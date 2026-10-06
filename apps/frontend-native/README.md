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
  selected-card lift, results and a full-target accessible card picker.
- Pass & Play for 2–4 seats, editable human names and optional bots. Private
  hands are omitted until the next human presses Ready; backgrounding hides
  them again. Bots pause in the background.
- Saved local games, shared rule validation and legal first moves.
- Online room creation/list/code entry, live table, spectator view, explicit
  Join Table, host dealing/bots, leave/remove confirmation and replay.
- Room chat with history/older pages, foreground reconnection, retry-safe sends,
  redaction and keyboard-aware native presentation. Returning to the lobby does
  not relinquish a seat. Room focus heartbeats follow app foreground state.

### Not yet at web feature parity

- **Native turn push notifications:** the current backend sends Web Push, not
  APNs/FCM/Expo push. The settings panel states this explicitly; native device
  enrollment is not falsely reported as ready. Existing web/TWA push remains.
- Jev inference/strategy selection: native offline bots use the deterministic
  shared strategy. No inference credits are consumed by native solo play.
- Web audio, 3D gold-spade animation, confetti and holographic card tilt are not
  ported. Native selection uses haptics instead.
- Persistent sound preferences need follow-up. Auto-pass preferences are saved
  locally; chat displays an unread count while its panel is closed.

## Android replacement / keeping the TWA

`apps/android` remains the Bubblewrap TWA project, including its signing setup
and store assets. Native Android keeps **`com.chiubaca.bigtwocrew`**, with
version code **3** above the TWA's **2**, so a later signed native bundle can
update the existing Play listing. The same ID means the two apps **cannot be
installed side by side**; preserving the TWA means retaining its source and
release path, not using a second production application ID.

Do not publish the native app until device QA and the missing-feature release
decisions are complete. Updating an installed TWA will not migrate browser
cookies or localStorage into native storage: users sign in again and online
room membership is recovered from the server.

## Builds and release gates

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
