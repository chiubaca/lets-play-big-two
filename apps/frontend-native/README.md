# Big Two Crew — React Native

An Expo SDK 57 / React Native 0.86 app for **Android and iOS**. Screens use native
views, text, inputs and touch controls—not a WebView. Metro consumes the same
workspace rules, legal-move strategy and XState machine as the web app.

## Run

From the repository root:

```sh
vp install
vp run dev:native:setup
vp run dev:native
# Android: automatically boot an existing emulator before starting services
vp run dev:native:android
# Build/install a development client (requires platform tools):
vp run native:android
vp run native:ios
```

Android requires Android Studio, its SDK, Java 17 and a device/emulator. iOS
requires Xcode 26.4+, command-line tools configured to Xcode, CocoaPods and an
iOS 16.4+ simulator/device. Expo generates native projects inside **this** app; it does
not use or overwrite `apps/android`.

Use either `dev:native` or `dev:native:android`, not both. The Android launcher
reuses a connected device/emulator or boots the first configured virtual device,
then waits up to three minutes for Android to finish booting. Create a virtual
device once in Android Studio → Device Manager. To select one explicitly:

```sh
NATIVE_DEV_AVD=BigTwoCrew_API_36 vp run dev:native:android
```

The SDK is resolved from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or
`~/Library/Android/sdk`. Install/build with `vp run native:android` in a second
terminal on first use or after native changes. Otherwise press `a` in Metro to
open the installed development client. `Ctrl+C` stops the services, not the emulator.

Use a clean emulator/test device for debug builds: a locally signed debug app
cannot be installed over the Play-signed TWA with the same application ID.
Do not uninstall a user's existing app or discard its data just to test a build.

For a browser-rendered UI preview only:

```sh
vp run frontend-native#web
```

This preview is useful for layout comparisons but is **not a replacement for
Android/iOS testing**. Native authentication uses SecureStore and native
WebSocket headers; online flows are supported in the development client, not
the browser preview. Use the existing web app for browser online play. Expo Go
is not the recommended target because Google sign-in requires this app's URL scheme.

### Game-room Storybook

Preview the **actual native table and room-chat screens** in fixed states, without
authentication, a backend, the development tunnel, or notification registration:

```sh
# From the repository root; fastest UI iteration in a browser:
vp run storybook:native:web
# Or use an Android/iOS development client:
vp run storybook:native
```

Storybook runs on **port 8082**, independently of the regular app's Metro on 8081.
The browser preview is at <http://localhost:8082>. For native, open the development
client from this Metro session (press `a` or `i`). If this client was built before
Storybook was added, rebuild it once: the controls UI needs Gesture Handler,
Slider, and DateTimePicker native modules. Stop Metro, run `vp run prebuild` from
`apps/frontend-native`, then `vp run native:android` or `vp run native:ios` from the
root, preserving the existing installation/signing identity. No tunnel is needed
for Storybook itself.

Under **Game room → Table**, choose among 33 stories:

- Loading, sign-in required, connection failure, reconnecting, sending, rejected moves.
- Host alone, open/full waiting tables, guest waiting, and Spectator joining/watching.
- First move (3♦), singles, pairs, five-card combinations, a new lead, Bot turns,
  last cards, pass-only hands, long names, and room-reset notices.
- Wins/losses, Solo hints, private Pass & Play handoff, and live/empty/loading/
  reconnecting/failed Room chat.

**Controls** change the scenario, Player/Spectator perspective, mode, connection,
busy state, notice text, spectator count, unread badge, and chat state. Card
selection, sorting, menu/help/settings sheets, handoff reveal, and local chat
drafts work. **Actions** logs game events, retry, sign-in, and navigation; these
do **not** advance the fixture or contact any server. Choose another story/scenario
to inspect the next state. Share room still invokes the platform's normal share UI
with a fictional room code.

Close the Controls panel and collapse the sidebar for a full-size canvas. Resize
the browser to check small phones, landscape, and tablets; verify final spacing,
safe areas, gestures, keyboard behavior, and accessibility on Android/iOS too.
Fixture hands are deliberately private: only the selected Player sees a hand;
Spectators and opponents expose counts only.

Storybook substitutes in-memory storage, so settings experiments cannot overwrite
saved games or real app preferences. Restarting Metro/reloading clears those
preview preferences. The normal app entry point is unchanged: Metro swaps it only
when `STORYBOOK_ENABLED=true`, and normal development/build/update commands do not
include Storybook. Never set that flag for release builds or EAS updates.

Stories live in `src/storybook/game-room.stories.tsx`; deterministic, tested room
fixtures live in `src/storybook/room-fixtures.ts`. Add more `*.stories.tsx` files
under `src/` as needed. Metro regenerates `.rnstorybook/storybook.requires.ts` when
starting Storybook; if adding a file while Metro runs, restart it or run
`vp run frontend-native#storybook:generate` from the root. The React Native
renderer/UI are pinned to 10.4 to retain this Expo SDK's Safe Area Context version.

### Expo MCP visual verification

The `expo-mcp` development dependency enables simulator screenshots and app
interaction through [Expo MCP](https://docs.expo.dev/mcp/). The project-local
`expo-local` OpenCode server runs the package's stdio bridge against Metro at
`http://localhost:8081`. Start the native environment normally and open the
development client, then check `/mcps` → `expo-local`. This bridge works without
restarting Metro with an MCP flag or sending screenshots through the remote
server. Its configuration adds the default macOS Android SDK's `platform-tools`
to `PATH`; adjust that path in `opencode.json` if your SDK is elsewhere.

For Expo's remote documentation and account tools, register the remote server
in OpenCode once:

```sh
opencode mcp add expo --global --url https://mcp.expo.dev/mcp
```

In OpenCode, open `/mcps`, select `expo`, and sign in using the same Expo account
as `vp exec expo whoami` (run that command from this app's directory).
To expose local tools through the **remote** server instead of `expo-local`,
stop any existing native development session before restarting from the root:

```sh
EXPO_UNSTABLE_MCP_SERVER=1 vp run dev:native:android
# Or, for an iOS simulator:
EXPO_UNSTABLE_MCP_SERVER=1 vp run dev:native
```

Open the development client, then reconnect the `expo` server in `/mcps` so it
discovers the local tools. Reconnect after starting or stopping Metro. Local
screenshots and automation data are proxied through Expo's remote MCP server;
use test accounts and avoid displaying sensitive data during verification.

## Backend

### Local authentication and online play

The supported native development environment uses a **named Cloudflare Tunnel**
at `https://dev-big-two-api.chiubaca.com`, forwarding only `/api/*` (including
WebSockets) to the local Wrangler backend on `127.0.0.1:8788`. Cloudflare supplies
publicly trusted HTTPS, so phones/emulators need no hosts-file or local CA setup.
Caddy and the existing web development setup are unchanged.

First-time setup, from the repository root:

```sh
vp install
cp apps/backend/.dev.vars.example apps/backend/.dev.vars # only if it doesn't exist
# Set a real BETTER_AUTH_SECRET and Google OAuth credentials in .dev.vars.
vp run dev:native:setup
```

Setup installs `cloudflared` with Homebrew if needed, opens Cloudflare login when
needed (authorize `chiubaca.com`), creates/reuses the `big-two-native-dev` tunnel,
and creates its DNS route. It never force-overwrites an existing DNS record.
Credentials remain in `~/.cloudflared`; generated project configuration lives in
gitignored `.native-dev/`. Do not commit or share the account certificate or
tunnel credentials. An existing tunnel without local credentials must be restored
securely; setup will not delete or replace it.

Register this **authorized redirect URI** on your Google OAuth **web client**:

```text
https://dev-big-two-api.chiubaca.com/api/auth/callback/google
```

Google returns to that HTTPS backend callback; Better Auth then redirects to the
installed development app's `bigtwocrew://` scheme. No Google redirect URI for the
custom app scheme is needed for this system-browser flow.

```sh
vp run dev:native
```

This starts the tunnel, Wrangler, and Metro together. Metro inherits the terminal
for its QR code and keyboard commands (`a` / `i`). `Ctrl+C` stops the whole group;
the other services also stop if one exits. Ports `8788` and `8081` must be free,
so stop `dev:local` before running this environment. No Caddy process is started.
Build/install the development client with `native:android` or `native:ios` as
described above. Physical devices also need network access to Metro on your Mac
(normally the same LAN); the API tunnel does not tunnel Metro.

The launcher sets `EXPO_PUBLIC_BACKEND_URL` for Metro and loads a generated
`BETTER_AUTH_URL` override **after** the backend's existing `.dev.vars` secrets.
It does not edit either frontend `.env` or the web backend's `.dev.vars`.
For your own Cloudflare zone, use
`NATIVE_DEV_HOSTNAME=dev-api.example.com vp run dev:native:setup` and register that
hostname's Google callback instead. Use a distinct tunnel/credentials per developer
machine (set `NATIVE_DEV_TUNNEL_NAME` during setup); do not run multiple connectors
with different local backends for the same
development hostname.

**Security:** this exposes the local API publicly while running. The existing
Wrangler configuration uses **remote D1 and remote Workers AI**, not an isolated
native development database. Use test accounts; account/profile deletion and other
mutations affect that remote database. AI requests can incur charges. Configure a
dedicated development database before using destructive QA flows. Do not disable
TLS, CSRF, or origin validation. An interactive Cloudflare Access login in front of
the API is not compatible with the current native HTTP/WebSocket client.

Troubleshooting:

- DNS conflicts: choose an unused development hostname; setup will not replace
  another service's record. DNS remains after shutdown, but no connector runs.
- `502` / `1033`: check the Wrangler/tunnel logs and that `dev:native` is running.
- Google redirect mismatch: add the exact callback above to the OAuth web client
  identified by `GOOGLE_CLIENT_ID` in `.dev.vars`.
- API reachable but app cannot load: check Metro/LAN connectivity separately.
- Remote-binding login errors: see [local development troubleshooting](../../agent/LOCAL_DEV.md).

### Using another backend

For standalone Metro (`vp run frontend-native#dev`), copy `.env.example` to `.env`
to override `EXPO_PUBLIC_BACKEND_URL`. The default is production. The full
`dev:native` launcher overrides that value with the configured tunnel URL.

The backend now includes Better Auth's Expo plugin and trusts `bigtwocrew://`.
**Deploy that backend change before testing native authentication against
production.** Existing web authentication and TWA configuration remain intact.
Email registration/sign-in, Google system-browser sign-in, profile updates
and account deletion use the existing account system. Cookies stay in
SecureStore and are sent in authenticated HTTP/WebSocket headers, never URLs.

Native deep links accept `bigtwocrew://room/ABCDE`. Android HTTPS room intent
filters reuse the existing website's Digital Asset Links when signed with the
existing Play app-signing identity. Unsigned/development builds will not verify
as that production app. iOS includes the associated-domain entitlement; before
release, host an `apple-app-site-association` file at
`https://big-two.chiubaca.com/.well-known/apple-app-site-association` with your
real Apple Team ID and `com.chiubaca.bigtwocrew`, scoped to `/room/*`. Without it,
iOS HTTPS links still open the web app. No placeholder Team ID is configured.

## Implemented

- Current web casino artwork, Inter/Fraunces/IBM Plex Mono fonts, home modes,
  sign-in/registration, membership profile editors and illustrated rules.
- Sticky home navigation and logo overlap, scroll-driven fade/scale/blur, and
  live reduced-motion support. See [motion parity and QA](../../docs/native-home-motion.md).
- Solo play with three deterministic bots, legal hints, rank/suit sorting,
  spring-animated card selection/reflow, staggered flights into the center pile,
  results and a full-target accessible card picker. Card motion uses Reanimated
  on the UI thread and respects the device's reduced-motion setting. Flights
  start only after a confirmed play; hydration/reconnects and rejected moves
  don't replay them. Opponent flights use public counts and card-back positions,
  never private hands.
- Pass & Play for 2–4 seats, editable human names and optional bots. Private
  hands are omitted until the next human presses Ready; backgrounding hides
  them again. Bots pause in the background.
- Saved local games, shared rule validation and legal first moves.
- Online room creation/list/code entry, live table, spectator view, explicit
  Join Table, host dealing/bots, leave/remove confirmation and replay.
- Room chat with history/older pages, foreground reconnection, retry-safe sends,
  redaction and keyboard-aware native presentation. Returning to the lobby does
  not relinquish a seat. Room focus heartbeats follow app foreground state.
- Opt-in Android/iOS turn notifications through Expo Push Service, sharing web's
  account consent, session-bound enrollment, focus suppression and verified return.

### Turn push notifications: credentials and rollout

Native uses `expo-notifications` and Expo's FCM/APNs gateway; web/TWA still uses
Web Push. **Code setup does not provision platform credentials or deploy changes.**

1. This app is linked to `@chiubaca/lets-play-big-two`, project ID
   `feb26247-9b9f-4d68-b9a3-760409a03453`. The app config embeds this as
   `extra.eas.projectId` for push notifications and EAS Update. Do not switch to
   `@chiubaca/big-two-crew`: its credentials/updates are a separate project.
   `EXPO_PUBLIC_EAS_PROJECT_ID` can override the ID for a separate deployment;
   this ID is public, not a signing credential.
2. Android: register `com.chiubaca.bigtwocrew` in Firebase, download its
   `google-services.json`, and set `GOOGLE_SERVICES_JSON` to the file path (for
   example `./google-services.json`, or an EAS **file** environment variable).
   Upload the matching **FCM v1 service account key** to EAS using
   `vp dlx eas-cli credentials --platform android`. Never put the service account
   key in the app, `EXPO_PUBLIC_*`, or Git. Retain the existing Play signing identity.
3. iOS: configure the real Apple team, provisioning profile and APNs push key
   through `vp dlx eas-cli credentials --platform ios`. The notifications plugin
   supplies the APNs entitlement on prebuild; Xcode uses production in archives.
4. Apply backend migration `0010_turn_push_receipts.sql` **before** deploying the
   updated backend. From `apps/backend`, the existing remote database command is
   `vp exec wrangler d1 migrations apply lets-play-big-two-db --remote`.
   This affects the real database; review pending migrations first. Native
   registration itself uses the existing table: `endpoint` is a namespaced
   `expo:<token>` address, and Web Push key fields are empty for native installs.
5. Keep the backend's existing `VAPID_PRIVATE_KEY` configured: native reuses it
   for encrypted return tickets, not for FCM/APNs encryption. Native sending
   does not require `VAPID_PUBLIC_KEY` or `VAPID_SUBJECT`. If you enable Expo's
   enhanced push security, set **backend-only** `EXPO_ACCESS_TOKEN` in `.dev.vars`
   and the deployed Worker's secrets (`vp exec wrangler secret put EXPO_ACCESS_TOKEN`).
6. Stop Metro, run `vp run prebuild` from this app, and rebuild the development
   client with `vp run native:android` / `vp run native:ios` from the root. The old
   binary does not contain the new native notification module. Do not use Expo Go.

If Android reports `Cannot find native module 'ExpoPushTokenManager'` (sometimes
followed by an undefined `useTurnNotifications` import), the installed development
client is missing `expo-notifications`. Restarting Metro or reloading JavaScript
cannot add native modules. Rebuild/install the app with Java 17 as described below;
if Metro is already running, add `--no-bundler` to the Android build command.
Update the existing debug app in place rather than uninstalling or clearing its data.

If Android reports `Unable to get Firebase Messaging instance` / `Default FirebaseApp
is not initialized`, the installed app lacks Firebase's native configuration. An EAS
project ID alone is not enough, and calling `FirebaseApp.initializeApp` from JavaScript
is not the fix. Download `google-services.json` for Firebase's Android app with package
`com.chiubaca.bigtwocrew`, place it at `apps/frontend-native/google-services.json`
(gitignored), and set this in `apps/frontend-native/.env`:

```dotenv
GOOGLE_SERVICES_JSON=./google-services.json
```

Stop Metro, then from `apps/frontend-native` run `vp run prebuild`. From the root,
run `vp run native:android` to rebuild/install, then restart `vp run dev:native:android`.
If Metro is already running, use `vp run native:android -- --no-bundler`. Reloading
JavaScript cannot add Firebase resources to an existing binary. Configure the matching
FCM v1 service account key in EAS as described above before testing push delivery;
that server credential is separate from the app's `google-services.json`.

In an online table's Settings, enable **Turn notifications for my account**, then
**Enable notifications on this device**. Account-on alone never requests OS
permission or registers a device. Device-off affects only this install;
account-off revokes all web and native installs. A fresh sign-in requires explicit
device enrollment again. Missing EAS configuration, permission denial and failed
enrollment never display Ready. System settings are rechecked when resuming.

The minute cron checks Expo receipts after 15 minutes, retires
`DeviceNotRegistered` enrollments and expires receipt tracking after 24 hours.
Provider errors are logged by safe error code only. Expo's token mapping is
refreshed on resume/native token rotation only while enrollment remains live.
If the Expo address itself changes, the previous address is retired and the user
must explicitly enable the device again; this never silently restores device-off.

Native background notifications use OS-visible, generic alerts, not unreliable
silent/background JS. Eligibility/focus is checked immediately before sending,
with a TTL bounded by the Turn's deadline. Foreground alerts additionally verify
the current Turn before display and are suppressed in the open room. Unlike the
web service worker, a terminated native app cannot recheck before the OS displays
an alert; a Turn may have changed in transit. Delivery is best effort. Taps in both
warm and cold starts use the existing encrypted, account/enrollment/seat-checked
return endpoint, never an arbitrary URL or room claimed by a push payload.
Signed-out taps wait for sign-in; wrong-account, revoked and missing-room taps
offer lobby recovery without exposing a private table.

Device QA before release: permission allow/deny and Android channel-off; account
on versus device-on; device-off and web/native account-off; sign-out/sign-in and
account deletion; foreground room suppression, lobby/background and terminated
delivery; cold/warm taps, wrong account, expired rooms and changed Turns; and
receipt cleanup after token invalidation. Use test accounts: local development
still uses remote D1. This setup has not sent test pushes or changed credentials.

### Not yet at web feature parity

- Jev inference/strategy selection: native offline bots use the deterministic
  shared strategy. No inference credits are consumed by native solo play.
- Web audio, 3D gold-spade animation, confetti and holographic card tilt are not
  ported. Native selection uses haptics instead.
- Persistent sound preferences need follow-up. Auto-pass preferences are saved
  locally; chat displays an unread count while its panel is closed.

## Android replacement / keeping the TWA

`apps/android` remains the Bubblewrap TWA project, including its signing setup
and store assets. Native Android keeps **`com.chiubaca.bigtwocrew`**, with
version code **8** above the previous native version's **7** and the TWA's **2**, so a signed native bundle can
update the existing Play listing. The same ID means the two apps **cannot be
installed side by side**; preserving the TWA means retaining its source and
release path, not using a second production application ID.

Do not publish the native app until device QA and the missing-feature release
decisions are complete. Updating an installed TWA will not migrate browser
cookies or localStorage into native storage: users sign in again and online
room membership is recovered from the server.

## Builds and release gates

### Internal OTA updates (Android)

The `preview` profile produces an internal release APK subscribed to the
**preview** EAS Update channel. Production uses a separate **production** channel.
The preview EAS environment points to the **production API** for testing on real
devices; it is not an isolated database. It also contains the public project ID
and Firebase client configuration as a secret file variable. No service-account
key or signing key belongs in an OTA bundle.

`expo-updates` requires **one new APK install** before updates work. Existing
APKs without the module cannot gain OTA support through JavaScript. Choose one
build route, from `apps/frontend-native`:

```sh
# EAS Build (cloud or --local); configure the EXISTING signing key first:
vp dlx -- eas-cli build --profile preview --platform android

# Or keep your existing local Expo/Gradle release-build process:
export EXPO_UPDATE_CHANNEL=preview
vp run prebuild -- --platform android
# Keep EXPO_UPDATE_CHANNEL set while building your signed release APK.
vp exec expo run:android --variant release --no-bundler
```

The local prebuild uses `--no-clean --no-install` and preserves generated native
folders. Never replace the signing identity of an installed app; install the
new APK in place with the same signing key. Expo's generated Gradle project uses
the debug key unless your existing release process configures signing. A cloud
build also needs that existing key configured in EAS; do not let it generate a
replacement. Development clients/Expo Go are not the release OTA test target.

After installing that APK, publish JavaScript/assets changes:

```sh
# From the repository root; prompts for the update message:
vp run update:preview
# Or supply the message directly:
vp run update:preview -- --message "Fix native turn focus release"

# Also works from apps/frontend-native; Android + preview environment/channel are fixed:
vp run update:preview -- --message "Fix native turn focus release"
# Equivalent:
vp dlx -- eas-cli update --channel preview --environment preview --platform android --message "Fix native turn focus release"
```

The launcher uses the global Vite+ CLI (`VITE_PLUS_HOME/bin/vp`, defaulting to
`~/.vite-plus/bin/vp`) because the local CLI on package scripts' PATH lacks `dlx`.

The explicit environment prevents a local dev-tunnel URL from leaking into an
internal update. Review the working tree before publishing: the current local
JavaScript/assets are uploaded, not just committed changes. This does not deploy
backend code. Close/reopen the app online to download the update, wait for the
download, then close/reopen again to apply it. No forced mid-game reload is used.
Review updates at <https://expo.dev/accounts/chiubaca/projects/lets-play-big-two/updates>.

#### Play Store internal testing with preview OTA

Play's testing track and EAS Update's channel are separate. The `internal-testing`
profile produces a store AAB subscribed to `preview`, using the preview environment
and production's remote version auto-increment:

```sh
# From apps/frontend-native; requires the EXISTING Play upload key in credentials.json:
vp dlx -- eas-cli build --profile internal-testing --platform android --non-interactive --freeze-credentials
# With a Google Play service account configured in EAS, submit that exact build:
vp dlx -- eas-cli submit --profile internal-testing --platform android --id <build-id> --non-interactive
```

Upload the AAB to Play's **internal testing** track, then install the update through
Play without uninstalling. That installation receives `update:preview` OTA releases
for its runtime. Production-channel builds do not receive them, regardless of Play
track. Preserve the existing package ID, upload key and Play App Signing identity;
do not generate replacement credentials. This profile uses local credentials rather
than EAS-generated keys. Configure the ignored `credentials.json` with the existing
upload key's path, alias and passwords following
[Expo's local credentials guide](https://docs.expo.dev/app-signing/local-credentials/).
Never commit that file or print its contents. Submission also requires a Google Play
service account with access to this app, or a manual AAB upload in Play Console.

Runtime compatibility uses **appVersion**, currently `1.1.5`. Keep that version
for JS-only fixes to the same native runtime. Whenever native dependencies,
plugins, Firebase/native configuration or the Expo SDK change, increment
`version` in `app.config.ts` (and keep `package.json` in sync), then rebuild and
install before publishing an update for the new runtime. OTA cannot add native
modules or upgrade an older runtime. Local builds without an explicit
`EXPO_UPDATE_CHANNEL` are not subscribed to preview by default.

Version `1.1.5` adds Gesture Handler, Slider, and DateTimePicker for native Storybook.
Rebuild the development client before opening Storybook on a device. Normal app
bundles still exclude the Storybook UI and fixtures. This native-runtime change
must not be sent to a `1.1.4` binary as an OTA-only update.

Version `1.1.3` added `react-native-reanimated` and `react-native-worklets`.
Rebuild/install the native app before using or publishing this runtime; it
cannot be delivered to a `1.1.2` binary as an OTA-only update. Expo's Babel
preset configures the Worklets plugin automatically. Restart Metro after
installing these dependencies (use `vp exec expo start --dev-client --clear`
from this app if a cached bundle reports missing Worklets `__initData`).

Version `1.1.4` reduces the Android boot logo to fit the system splash screen's
circular mask. This native launch-screen change requires a new build/install;
an OTA update cannot change the splash screen of an existing binary.

After upgrading SDK/native dependencies, stop Metro, run `vp run prebuild` from
this app, then rebuild with `vp run native:android` or `vp run native:ios` from
the root. Old development clients cannot load the SDK 57 runtime. The prebuild
script uses `--no-clean --no-install` to preserve existing native folders and
leave dependency installation to Vite+. SDK 57's plain `expo prebuild` clears
those folders by default; use it only after checking/backing up manual changes.
Native authentication/network flows and Android edge-to-edge appearance need
device QA because SDK 57 changes the native fetch implementation and StatusBar API.

Use Java 17 for local Android builds. Java 25 can fail the native prefab/CMake
step with `WARNING: A restricted method in java.lang.System has been called`.
For Homebrew's `openjdk@17`, set the JDK explicitly before rebuilding:

```sh
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

```sh
# From apps/frontend-native:
vp run check
vp test --run
vp exec expo install --check
vp run build                       # JS/assets + Hermes bundles, not an IPA/AAB
vp run prebuild                    # Generate local Android/iOS projects
vp dlx eas-cli build --profile preview --platform android
vp dlx eas-cli build --profile preview --platform ios
```

`eas.json` has development, Android APK/iOS simulator preview, and production
profiles. EAS builds require your Expo project setup and credentials; no
signing material is embedded or copied. Before Play release, configure the
**existing upload key** from the TWA with EAS/Gradle and retain Play App Signing.
Never create a replacement signing identity for the existing listing. Confirm
the next version code against Play Console, not just this repository.

Production EAS builds use remote version management with auto-increment;
initialize/synchronize its build version with your current store release first.

iOS uses `com.chiubaca.bigtwocrew`; verify availability in your Apple developer
account, set up signing, and review App Store requirements (including the
third-party-login/Sign in with Apple requirement) before submitting. No store
upload or submission has been performed.

Device QA must cover: notches/home indicators, small phones, landscape/tablets,
font scaling, VoiceOver/TalkBack, every exposed fan-card touch target, private
handoff/background/resume, interrupted network/auth/chat, OAuth return, and an
in-place **signed** TWA-to-native Android upgrade. Offline snapshots contain
private hands in local app storage; they are never sent to the UI for opponents.

Bundled fonts are redistributed under the SIL Open Font License; see
`assets/fonts/*-OFL.txt`. Casino artwork is copied unchanged from the web app.
