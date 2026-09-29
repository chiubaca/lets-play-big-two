Title: Gate macOS Safari Turn enrollment independently
Status: ready-for-human

## What to build

Validate macOS Safari with actual delivered pushes on a physical device and unlock only the tested macOS Safari surface/version if its own fail-closed receipt and follow-up-delivery gate passes. Otherwise leave it Unavailable. Do not infer macOS support from Chrome, Android, or iOS Home Screen results and do not add a visible fallback for suppressed pushes.

## Acceptance criteria

- [ ] With real pushes, verify no visible alert for a stale Turn, focused room, different signed-in account, or unavailable receipt verification.
- [ ] After suppressed pushes, verify a fresh eligible Turn still arrives with permission/subscription usable, correct tap and original-Player sign-in gating; repeat after Safari restart.
- [ ] Record OS/browser versions, permission/subscription retention, results, and any failed cases; DevTools simulation alone does not pass the gate.
- [ ] Enrollment remains Unavailable if suppression displays, subscription is revoked, verification cannot pass, or follow-up delivery fails; a pass unlocks only the tested macOS surface/version.

## Blocked by

- [Recognize every distinct ongoing Turn, and no false Turns](13-distinct-ongoing-turns.md)
- [Make queued Turn delivery bounded and per-install](14-bounded-per-install-delivery.md)
- [Revoke Turn enrollment safely across account changes](15-revoke-enrollment-across-identities.md)
- [Return from an alert without exposing or replacing the wrong room](16-safe-alert-return.md)
