Title: Plan your-turn push notifications for online rooms
Status: open
Labels: wayfinder:map

## Destination

An implementation-ready spec for opt-in push notifications when a seated Player's turn begins in online multiplayer and they are away from that room. It covers supported web browsers and the Android app, an account-wide switch in online Table settings, delivery and permission behavior, and acceptance scenarios; implementation follows as a separate effort.

## Notes

- Planning only: decide and document the route, do not build production push in these tickets. Use `/grilling` and `/domain-modeling` for human decisions; use `/prototype` if the settings interaction needs a rough artifact. Consult `CONTEXT.md`, `docs/agents/domain.md`, and `docs/agents/issue-tracker.md`.
- The switch is account-wide but shown in online-room Table settings, not offline tables. A Turn notification is opt-in; at most one alert per new turn, with no reminders. Suppress alerts while the Player is actively viewing that room. Web and the Android app are required; iOS is supported only where installed-PWA web push works, not as a separate native app requirement.
- Current shape: `apps/frontend-web/public/service-worker.js` handles offline caching but not push; `apps/frontend-web/src/components/game-room/game-room.tsx` owns Table settings; `apps/backend/src/do/big-two-room-do.ts` persists and broadcasts room state; `packages/game-state-machine/src/game-state-machine.ts` defines turns. `apps/android/` is a Trusted Web Activity wrapping the production PWA. Validate assumptions about Android notification support before choosing a delivery path.
- Only seated Players receive Turn notifications. An alert should return the Player to the relevant online room; exact trigger, presence, permission, content, subscription, and delivery semantics belong to the linked tickets.

## Decisions so far

<!-- Closed tickets are linked here with a one-line gist. -->

## Not yet specified

- Platform research may expose Android-specific permission or delivery work, browser limitations, or a prerequisite that cannot be scoped until the supported path is known.
- Delivery and presence decisions may expose additional failure or lifecycle cases requiring their own tickets before a handoff spec is credible.

## Out of scope

- Turn notifications for solo, pass-and-play, or Spectators.
- Repeated reminders while a turn is waiting, and unrelated room/chat/invitation notifications.
- A native iOS app or guaranteed push on browsers that do not support web push.
