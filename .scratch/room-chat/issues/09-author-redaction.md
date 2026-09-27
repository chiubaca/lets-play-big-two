Title: Redact deleted room-chat authors in live and resumed tabs
Status: ready-for-agent

## Parent

[Live-only room chat PRD](../PRD.md)

## What to build

When a chat author begins account deletion, update the labels on messages already present in connected tabs to “Deleted player” without transmitting account IDs or retaining message bodies. A tab returning from suspension must reconcile its in-memory author labels or clear its old log before displaying it again. This extends the live-only room chat path and its existing deletion/admission protections; it does not introduce server-side history or retroactively erase text someone already read or copied.

## Acceptance criteria

- [ ] Account deletion triggers a live redaction event keyed by an opaque author correlation token. Connected tabs replace matching author labels with “Deleted player”; unrelated messages and their ordering remain unchanged, and events expose no account IDs.
- [ ] A disconnected or sleeping tab reconciles deleted authors before revealing its retained log on reconnect/resume, or clears that log first. A new tab still starts with an empty log and neither path retrieves message history.
- [ ] Deletion-pending accounts cannot newly connect or send, existing connections stop receiving promptly, and redaction does not add message bodies to Durable Object persistence or disturb game state/private hands.
- [ ] Server-boundary tests exercise deletion during connected delivery and resume without leaking IDs or replayable history; controlled-network UI tests cover live relabelling and the no-stale-label-before-display behavior after suspension.

## Blocked by

- [Send and receive live room chat across room phases](07-live-room-chat.md)
