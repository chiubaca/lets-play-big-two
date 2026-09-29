Title: Pass the real-push web release gate
Status: ready-for-human

## What to build

Validate and document the complete web Turn notification flow on a real HTTPS deployment using actual VAPID pushes to subscribed **Chrome or Edge desktop, Firefox desktop, and Chrome on Android**. Do not count DevTools simulation or push-service acceptance as device receipt, and do not wait for physical Android TWA testing. Record failures as follow-up issues before claiming web support.

## Acceptance criteria

- [ ] Each required browser/surface records browser and OS version, fresh permission/enrollment, an away-room Turn, real receipt with tab/app closed or backgrounded, and tap-to-room outcome.
- [ ] Each records focused-room suppression, stale suppression, off/sign-out behavior, a later eligible Turn, and permission-denied device-state fallback; note delivery limitations honestly.
- [ ] Actual service-worker receipt/display is evidenced separately from provider 2xx acceptance; unsupported or failing surfaces are not advertised as Ready on the strength of simulated events.
- [ ] The web go/no-go decision and any unresolved failures are recorded without making Android TWA physical-device testing a release blocker.

## Blocked by

- [Recognize every distinct ongoing Turn, and no false Turns](13-distinct-ongoing-turns.md)
- [Make queued Turn delivery bounded and per-install](14-bounded-per-install-delivery.md)
- [Revoke Turn enrollment safely across account changes](15-revoke-enrollment-across-identities.md)
- [Return from an alert without exposing or replacing the wrong room](16-safe-alert-return.md)

## Comments

### 2026-09-29 — gate prepared; not passed

The [web release gate record and per-surface procedure](../web-release-gate.md) is ready for a tester with access to a deployed HTTPS build, desktop Chrome/Edge and Firefox, and an Android device running Chrome. No actual VAPID-to-device receipt, notification display or tap was observed here, so all acceptance checks remain open and the decision is **NO-GO (unverified)**. Automated worker-event tests and provider HTTP acceptance are not substitutes. Log observed failures as follow-up issues before advertising support; physical Android TWA checks remain separate and do not block the web decision.
