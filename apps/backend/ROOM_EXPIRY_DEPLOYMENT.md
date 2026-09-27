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
