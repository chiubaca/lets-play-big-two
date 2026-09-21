# Big Two Crew for Android

This directory contains the Bubblewrap-generated Trusted Web Activity (TWA) for the production PWA
at <https://big-two.chiubaca.com>.

## Application identity

- Play package: `com.chiubaca.bigtwocrew`
- App name: `Big Two Crew`
- Version: `1.0.0` (`versionCode` 1)
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
