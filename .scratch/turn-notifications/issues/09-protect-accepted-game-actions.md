Title: Keep accepted game actions successful after post-commit work fails
Status: ready-for-agent

## What to build

Separate the authoritative room action commit from fallible broadcasts and housekeeping before adding Turn notification work. An accepted deal, play, or pass must remain accepted even when post-commit work fails; rejected actions must still leave game state unchanged. Preserve the existing inactive-room expiry policy, including the longer window for unfinished games.

## Acceptance criteria

- [ ] Room action tests demonstrate the same accepted/rejected game transitions and persisted/reloaded state as before the change.
- [ ] Injected post-commit broadcast or room-housekeeping failures do not turn an already committed action into an error or roll back play.
- [ ] Room expiry and leave behavior remain unchanged, including unfinished games.

## Blocked by

None - can start immediately.
