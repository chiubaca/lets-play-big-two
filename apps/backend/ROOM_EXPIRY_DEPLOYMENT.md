# Room expiry rollout

For this installation, the initial rollout assumes there are no connected users.
The first sweep **deletes every pre-existing room**, including unfinished games,
without checking legacy presence. This operation cannot be undone by rolling back
the Worker.

From `apps/backend`, apply the D1 migration **before** deploying the Worker:

```sh
vp exec wrangler d1 migrations apply lets-play-big-two-db --remote
vp exec wrangler deploy
```

Do not create rooms between these commands: the previous Worker has no creation
timestamp and would create a room the new Worker considers legacy. The deployed
Worker sweeps legacy rooms on its next minute-level cron trigger; the same sweep
retries any partially removed rooms until game state, chat history, memberships,
and the room record are gone. Retired codes remain reserved to prevent an old
room URL from opening another room's conversation.

## Rollout record — 2026-09-27

Applied `0004_room_expiry.sql` to the remote D1 database and deployed Worker
version `e4414e86-bf35-4571-b255-130d3fadd855`. The scheduled sweep removed
all 48 legacy rooms. The final D1 query returned zero rooms, zero memberships,
and 48 reserved room codes. Cloudflare logs showed successful chat and game
object cleanup calls. No separate Player/Spectator manual UI verification was
performed as part of this rollout.
