# Big Two Crew — React Native

An Expo SDK 55 / React Native app for **Android and iOS**. Screens use native
views, text, inputs and touch controls—not a WebView. Metro consumes the same
workspace rules, legal-move strategy and XState machine as the web app.

## Run

From the repository root:

```sh
vp install
vp run dev:native
# Build/install a development client (requires platform tools):
vp run native:android
vp run native:ios
```

Android requires Android Studio, its SDK, Java 17 and a device/emulator. iOS
requires full Xcode, command-line tools configured to Xcode, CocoaPods and a
simulator/device. Expo generates native projects inside **this** app; it does
not use or overwrite `apps/android`.

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

Copy `.env.example` to `.env` to override `EXPO_PUBLIC_BACKEND_URL`. On physical
devices, `localhost` and the Mac's `/etc/hosts` domains do not identify the
development machine. Use a reachable HTTPS development backend and a trusted
certificate. Do not disable TLS, CSRF or origin validation.

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
- Web audio, 3D gold-spade animation, confetti, holographic card tilt and sticky
  logo scroll effects are not ported. Native selection uses haptics instead.
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
