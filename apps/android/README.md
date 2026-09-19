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

## Play App Signing follow-up

Google Play signs distributed APKs with a different certificate from the upload key. After the first
AAB is uploaded:

1. Open **Play Console → Test and release → Setup → App signing**.
2. Copy the SHA-256 fingerprint under **App signing key certificate** (not the upload certificate).
3. Add it to `fingerprints` in `twa-manifest.json`.
4. Add it to `sha256_cert_fingerprints` in
   `apps/frontend-web/public/.well-known/assetlinks.json`.
5. Regenerate the Android project, rebuild the frontend, and deploy it.

Keep both fingerprints. The upload fingerprint verifies direct/local APK installs; the Play signing
fingerprint verifies installations delivered by Google Play.
