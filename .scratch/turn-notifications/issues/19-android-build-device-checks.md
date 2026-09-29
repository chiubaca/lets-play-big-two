Title: Check sideloaded and Play-installed Android TWA builds
Status: ready-for-human

## What to build

Manually validate the notification-capable TWA in both sideloaded and Play-installed builds after the wrapper and return path are implemented. This follow-up identifies failures without blocking capable-device enrollment or the web release; Ready must not be described as a delivery guarantee.

## Acceptance criteria

- [ ] On both build types, record allow/deny OS and browser permission behavior, real delivery and notification attribution, and the browser/Android versions tested.
- [ ] Record cold and warm taps, correct room/account routing, and eligible delivery after restart, including any failures.
- [ ] Verify the live app-link/signing configuration and merged manifest for the tested builds; create separate issues for failures rather than weakening receipt verification.
- [ ] Results are documented as manual follow-up, not a retroactive enrollment gate or a blocker for the web feature.

## Blocked by

- [Return from an alert without exposing or replacing the wrong room](16-safe-alert-return.md)
- [Enable capable Android TWA Turn enrollment](17-android-twa-enrollment.md)
