Title: Plan your-turn push notifications for online rooms
Status: closed
Labels: wayfinder:map

## Destination

An implementation-ready spec for opt-in push notifications when a seated Player's turn begins in online multiplayer and they are away from that room. It covers supported web browsers and the Android app, an account-wide switch in online Table settings, delivery and permission behavior, and acceptance scenarios; implementation follows as a separate effort.

## Notes

- Planning only: decide and document the route, do not build production push in these tickets. Use `/grilling` and `/domain-modeling` for human decisions; use `/prototype` if the settings interaction needs a rough artifact. Consult `CONTEXT.md`, `docs/agents/domain.md`, and `docs/agents/issue-tracker.md`.
- The switch is account-wide but shown in online-room Table settings, not offline tables. A Turn notification is opt-in; at most one alert per new turn, with no reminders. Suppress alerts while the Player is actively viewing that room. Web and the Android app are required; iOS is supported only where installed-PWA web push works, not as a separate native app requirement.
- Current shape: `apps/frontend-web/public/service-worker.js` handles offline caching but not push; `apps/frontend-web/src/components/game-room/game-room.tsx` owns Table settings; `apps/backend/src/do/big-two-room-do.ts` persists and broadcasts room state; `packages/game-state-machine/src/game-state-machine.ts` defines turns. `apps/android/` is a Trusted Web Activity wrapping the production PWA. Validate assumptions about Android notification support before choosing a delivery path.
- Only seated Players receive Turn notifications. An alert should return the Player to the relevant online room; exact trigger, presence, permission, content, subscription, and delivery semantics belong to the linked tickets.

## Decisions so far

- [Research push support for web and the Android app](issues/01-supported-delivery.md) — Standards-based Web Push covers supported browsers and installed iOS PWAs; Android TWA needs delegated notifications and Android 13+ permission (its validation gate was revised in the handoff).
- [Define which online turns earn an alert](issues/02-turn-boundaries.md) — Successful deals, plays, and passes create distinct turns; stale or repeated turns never generate additional alerts, with one display per device per turn.
- [Decide when a Player is away from the room](issues/03-away-presence.md) — Only a visible, focused view of that room on any device suppresses alerts account-wide; missing presence allows them, with rechecks before send and display.
- [Decide the online Table settings opt-in flow](issues/04-settings-and-permission.md) — Seated Players get an account-wide off-by-default switch plus explicit per-device enrollment; layout A distinguishes ready, blocked, unsupported and failed devices without conflating permission with consent.
- [Decide alert content and return-to-room behavior](issues/05-alert-content-and-return.md) — Generic private text opens the intended Player's current room, reusing its tab where possible; expired rooms offer a Lobby return and account changes require original-Player sign-in.
- [Decide subscription storage and reliable turn delivery](issues/06-delivery-design.md) — D1 holds consent/device registrations; the room Durable Object records turn outbox intents atomically and dispatches with bounded retries and live eligibility checks, independent of game-action success.
- [Decide the WebKit stale-push policy](issues/08-webkit-stale-push-policy.md) — Keep fail-closed suppression; gate macOS Safari and installed iOS/iPadOS PWAs independently on real-device stale-push and follow-up delivery tests, withholding enrollment where they fail.
- [Agree on turn notification acceptance and handoff](issues/07-handoff-spec.md) — [Handoff spec](PRD.md) sets concrete acceptance scenarios and a real-push web gate; Android device testing is manual follow-up, not an enrollment/release gate.

## Not yet specified

None currently.

## Out of scope

- Turn notifications for solo, pass-and-play, or Spectators.
- Repeated reminders while a turn is waiting, and unrelated room/chat/invitation notifications.
- A native iOS app or guaranteed push on browsers that do not support web push.
