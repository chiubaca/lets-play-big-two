Title: Return from an alert without exposing or replacing the wrong room
Status: ready-for-agent

## What to build

Complete notification-tap navigation. Prefer focusing a client already showing the intended room; otherwise open a new client without replacing another room. Revalidate identity or route through a neutral original-Player sign-in gate before revealing the validated same-origin room path. Load the room's current state even if the Turn or game has ended, and provide a clear Lobby return when the room has expired.

## Acceptance criteria

- [ ] A tap focuses an existing intended-room view; with only another-room view open, it opens a new view and leaves the other room intact.
- [ ] A signed-out/different account sees no target-room details until original-Player sign-in; arbitrary or cross-origin payload URLs cannot control navigation.
- [ ] After the Turn/game ends, the Player sees current room state rather than replayed notification state; an expired room shows **“This room could not be found”** and **Return to lobby**.
- [ ] Worker click, room-route authentication/rejoin, and navigation tests cover client choice, changed accounts, ended games, and missing rooms.

## Blocked by

- [Notify an away Player for the first Turn after a deal](12-first-deal-turn-alert.md)
- [Revoke Turn enrollment safely across account changes](15-revoke-enrollment-across-identities.md)
