Title: Research push support for web and the Android app
Status: closed
Labels: wayfinder:research
Parent: ../map.md
Assignee: chiubaca
Blocked by: none

## Question

What push delivery and permission mechanisms actually work for the production PWA across supported desktop/mobile browsers and the Android Trusted Web Activity, including an installed iOS PWA where supported? Check current primary platform documentation and the local Android/PWA setup; identify registration, permission, backend credentials/provider, deep-link, and testing constraints. Recommend a supported path with explicit fallbacks; link a concise markdown research asset in the resolution. Do not implement push.

## Comments

### Resolution

Recommend one standards-based, VAPID-authenticated Web Push path through the existing frontend service worker, with per-install subscriptions and a backend-held private key; Firebase SDK, FCM server credentials, and native APNs credentials are not required for this path. Desktop browsers and supported Android browsers can subscribe on secure origins; on iPhone/iPad the PWA must be installed to the Home Screen and permission requested on a user gesture inside it. The Android TWA uses the web subscription but requires notification delegation in a rebuilt wrapper plus Android 13+ OS notification permission. The current wrapper has delegation disabled and its merged release manifest lacks `POST_NOTIFICATIONS`, so Android app support remains conditional on real sideloaded and Play-installed device tests of permission, receipt, attribution and tap-to-room routing. Unsupported, denied or unverified devices should not be promised alerts; retain the live room experience and explain install/permission requirements rather than substitute native FCM. Keep return URLs to validated `/room/<id>` paths, with sign-in and missing-room handling. The existing [Decide the online Table settings opt-in flow](04-settings-and-permission.md) and [Decide subscription storage and reliable turn delivery](06-delivery-design.md) tickets cover the newly clarified permission and delivery work; no new ticket is needed.

Research and local evidence: [Push platform support](../research/push-platform-support.md). No push was implemented or device-tested.
