Title: Notify an away Player for the first Turn after a deal
Status: ready-for-agent

## What to build

Deliver a secure, end-to-end Turn notification for the first ongoing Turn after an accepted online-room deal. Record its stable identity, seated recipient, and, only when the Player is away at Turn start, a bounded outbox intent in the same room-local commit as game state. Affirmative short-lived visible-and-focused presence for the relevant room, across authenticated tabs/devices, suppresses intent; sockets alone do not. Use backend-only VAPID Web Push through the existing root service worker. Recheck the current Turn, room, recipient, focus, consent, enrollment generation, deletion, and originating live session before sending and via a non-cached authenticated check before display. The worker fails closed and displays only **“It’s your turn”**, with a same-origin, identity-gated basic return to the intended room; no client-supplied destination or visible room/hand/identity details.

## Acceptance criteria

- [ ] A committed first Turn while away creates one persistent intent and can alert an already consenting, enrolled install; consent or enrollment added mid-Turn never backfills it.
- [ ] A visible, focused view of this room on any device suppresses intent for all installs, even if focus later leaves; Lobby, another room, unfocused/backgrounded views, missing/expired evidence, and a mere socket do not suppress.
- [ ] Send and receipt checks suppress a stale Turn, newly focused room, wrong account, invalid session/registration, deleted account, expired room, or unavailable verification; WebKit gets no fallback/declarative display bypass. Distinct rooms/Turns cannot overwrite one another.
- [ ] A verified alert has only generic visible text and a validated same-origin target; a tap under a missing/different account reveals no target room and requires the original Player's sign-in. No arbitrary URL is opened.
- [ ] Accepted deals remain successful despite database, push, alarm, or network errors after the room-local commit; room-action/reload, authenticated API, worker event, and navigation tests exercise successes and failures.

## Blocked by

- [Keep accepted game actions successful after post-commit work fails](09-protect-accepted-game-actions.md)
- [Save account-wide Turn notification consent from Table settings](10-account-wide-turn-consent.md)
- [Enroll and remove this device explicitly](11-enroll-this-device.md)
