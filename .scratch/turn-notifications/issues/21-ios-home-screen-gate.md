Title: Gate installed iOS and iPadOS Home Screen enrollment independently
Status: ready-for-human

## What to build

Validate installed iOS/iPadOS Home Screen web push on physical devices with actual delivered pushes. Unlock only the tested installed surface/version after its own fail-closed suppression and follow-up-delivery gate passes. Ordinary iOS browser tabs remain Unavailable with Home Screen guidance, and a macOS Safari pass does not unlock iOS/iPadOS.

## Acceptance criteria

- [ ] With real pushes to an installed Home Screen app, verify no visible alert for a stale Turn, focused room, different signed-in account, or unavailable receipt verification.
- [ ] After suppressed pushes, verify fresh eligible delivery, retained usable permission/subscription, correct tap, normal enrollment, and original-Player sign-in gating for an already displayed alert after account change; repeat after app restart.
- [ ] Record device, OS/browser version, permission/subscription retention, results, and limitations; simulated service-worker events are not a pass.
- [ ] A failing surface stays Unavailable without a visible fallback or weakened verification; a pass unlocks only the tested installed surface/version, never ordinary iOS tabs.

## Blocked by

- [Recognize every distinct ongoing Turn, and no false Turns](13-distinct-ongoing-turns.md)
- [Make queued Turn delivery bounded and per-install](14-bounded-per-install-delivery.md)
- [Revoke Turn enrollment safely across account changes](15-revoke-enrollment-across-identities.md)
- [Return from an alert without exposing or replacing the wrong room](16-safe-alert-return.md)
