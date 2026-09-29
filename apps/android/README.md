# Big Two Crew for Android

This directory contains the Bubblewrap-generated Trusted Web Activity (TWA) for the production PWA
at <https://big-two.chiubaca.com>.

## Application identity

- Play package: `com.chiubaca.bigtwocrew`
- App name: `Big Two Crew`
- Version: `1.0.1` (`versionCode` 2; not yet uploaded to Play)
- Minimum Android version: Android 6 / API 23
- Target Android version: Android 16 / API 36

The package ID cannot be changed after the first Play release.

## Signing key

The upload key and its passwords are deliberately ignored by Git:

- `apps/android/android.keystore`
- `apps/android/.signing.env`

Back up both files in a password manager or encrypted backup before uploading the first release.
Google Play App Signing can reset an upload key, but losing it still disrupts releases.

For a first-time setup only, generate the upload key from the repository root. Never regenerate it
after uploading a release:

```bash
keytool -genkeypair -v \
  -keystore apps/android/android.keystore \
  -alias big-two-crew \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Store the two passwords entered above in `apps/android/.signing.env`:

```dotenv
BUBBLEWRAP_KEYSTORE_PASSWORD="your-keystore-password"
BUBBLEWRAP_KEY_PASSWORD="your-key-password"
```

Restrict that file with `chmod 600 apps/android/.signing.env`.

The checked-in upload certificate fingerprint is:

```text
13:78:0C:D0:7D:60:14:52:5A:85:40:D8:38:1E:38:A5:FB:47:C1:7D:23:59:55:22:10:E6:6D:68:2B:13:D1:90
```

It is served in `apps/frontend-web/public/.well-known/assetlinks.json` so locally installed APKs can
open as a verified TWA.

## Build

Bubblewrap requires JDK 17 and the Android SDK. On a new machine, initialize its managed toolchain:

```bash
vp dlx @bubblewrap/cli@1.25.0 doctor
```

Regenerate the Android project after changing `twa-manifest.json`:

```bash
./scripts/update-android.sh
```

Build signed release artifacts:

```bash
./scripts/build-android.sh
```

Outputs (ignored by Git):

- `apps/android/app-release-bundle.aab` — upload this to Google Play
- `apps/android/app-release-signed.apk` — install this for device testing

For every update, increase both `appVersion` and `appVersionCode` in `twa-manifest.json`, regenerate,
and build with the same upload key.

## Turn notification delegation

`twa-manifest.json` has `enableNotifications: true`. Bubblewrap generates an exported/enabled
`DelegationService`, the `POST_NOTIFICATIONS` permission and
`NotificationPermissionRequestActivity` for Android 13+. The native permission request is triggered
by the site's explicit **Enable on this device** action through `Notification.requestPermission()`;
account consent alone does not prompt. Keep the generated notification icons and regenerate after
configuration changes rather than editing the generated manifest alone.

The `1.0.1` wrapper launches at `/?twa-notifications=2`. The web card uses the Android app
referrer and this release-specific launch marker (held only for the current browser session) to
avoid reporting Ready in the old `1.0.0` wrapper, whose delegation service is disabled. It also
rejects a reported browser display mode, which indicates a Custom Tab fallback. A direct deep
link that has no marker may stay Unavailable until the updated app is reopened from its icon.
These web signals are conservative, **not native attestation**: they cannot independently prove
the installed APK's signing, delegation service or actual OS delivery. Validate those on device.

**Release manifest inspected after regeneration (2026-09-29):**
`./gradlew :app:assembleRelease --offline` succeeded with the Bubblewrap JDK 17 and SDK. In
`app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`,
the release has `targetSdkVersion="36"`, `android.permission.POST_NOTIFICATIONS`, the
`com.chiubaca.bigtwocrew.DelegationService` with the
`TRUSTED_WEB_ACTIVITY_SERVICE` action and `android:enabled`/`android:exported` pointing to
`@bool/enableNotification`, and `NotificationPermissionRequestActivity`. In
`app/build/generated/res/resValues/release/values/gradleResValues.xml`,
`enableNotification` is `true`. The merged launcher also has an HTTPS `VIEW` intent with
`android:autoVerify="true"` for `@string/hostName` (`big-two.chiubaca.com`). These generated
build outputs are ignored by Git: inspect them again after each regeneration and release build.

If running Gradle directly rather than through Bubblewrap, set `JAVA_HOME` to its managed JDK 17
and `ANDROID_HOME` to its managed Android SDK (see `~/.bubblewrap/config.json`). A successful
build/manifest inspection is **not** proof of device delegation, verified links, or delivery.

### Device follow-up (not yet verified)

On an Android 13+ physical device with a compatible browser and the deployed VAPID key/API:

1. Sideload the **newly built** upload-key-signed APK (not an older disabled-delegation APK).
   Confirm the app opens without a Custom Tab toolbar. Check
   `adb shell pm get-app-links com.chiubaca.bigtwocrew` for the verified production domain and the live
   `https://big-two.chiubaca.com/.well-known/assetlinks.json` for the upload fingerprint.
2. Sign in, turn on account-wide Turn notifications, then tap **Enable on this device**. On
   Android 13+, grant the OS notification prompt; verify **Ready on this device** only after the
   browser subscription and server registration succeed. Deny/revoke notification permission and
   confirm **Blocked** (or **Unavailable** when Web Push is unsupported), not Ready. Check Android
   app notification settings and the browser's site permission if the prompt does not appear.
3. Install the **new** bundle from the Play internal track (not the existing `1.0.0` test build),
   repeat the verified-link and enrollment checks, and confirm which Play signing certificate
   signed the installed APK. The Play fingerprint must be in the live asset links response.
4. Later, test actual first-Turn delivery while away, including notification attribution and
   safe return behavior, on both sideloaded and Play-installed variants. Record outcomes before
   claiming device delivery works. This physical-device delivery test is follow-up work, not a
   prerequisite for browser enrollment or the web release.

The shared card's **Ready** means the detectable capability and permission checks, browser
subscription and server registration succeeded; it explicitly does not promise OS delivery. A
non-delegated build, failed app-link verification (Custom Tab fallback), or revoked native
permission must not be treated as a verified Android notification installation. Check the actual
installed variant during device follow-up.

## Play App Signing certificates

Google Play signs distributed APKs with different certificates from the upload key. Find them in
Play Console:

1. Open **Protected with Play**.
2. Expand **Play Store protection** and select **Manage Play app signing**.
3. Copy every SHA-256 fingerprint under **App signing key**, including the current classical and
   post-quantum keys and any previous key still used for older Android versions.
4. Keep those values in both `fingerprints` in `twa-manifest.json` and
   `sha256_cert_fingerprints` in `apps/frontend-web/public/.well-known/assetlinks.json`.
5. Regenerate the Android project, rebuild the frontend, deploy it, and validate the live Digital
   Asset Links response.

The upload fingerprint verifies direct/local APK installs. All Google-held app-signing fingerprints
verify the variants delivered by Google Play's quantum-ready signing configuration.
