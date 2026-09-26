Title: Plan live-only room chat for online Big Two
Status: open
Labels: wayfinder:map

## Destination

An implementation-ready spec for realtime room chat in online Big Two rooms: seated Players send plain-text messages; signed-in Spectators can read; chat works while waiting, playing, and after a game; messages are live-only and do not survive refresh or late arrival. The spec settles interaction, delivery, authorization, and acceptance behavior, ready for a separate implementation effort.

## Notes

- This is a planning map, not an implementation map. Stop at a spec; do not build chat in these tickets.
- Use the `/grilling` and `/domain-modeling` skills for human decisions, and consult `CONTEXT.md` plus `docs/agents/domain.md` for vocabulary. If a rough UI is needed, use `/prototype`.
- First release has no mute, report, or moderation controls. Security boundaries of accepting user input still need specification.
- Current shape: `apps/backend/src/do/big-two-room-do.ts` owns a room and broadcasts personalized game views; its WebSocket is read-only. `apps/frontend-web/src/routes/room/-subscribe-to-game-state.ts` subscribes; `apps/frontend-web/src/components/game-room/game-room.tsx` owns the table UI. Do not assume chat belongs in the game state machine.
- Local tracker conventions, including claims and blocking, are in `docs/agents/issue-tracker.md`.

## Decisions so far

<!-- Closed tickets are linked here with a one-line gist. -->

- [Decide the room chat surface for Players and Spectators](issues/01-chat-surface.md) — Approved a compact header-triggered chat panel with an unread count, Player composer, Spectator read-only view, and narrow-screen room-code row; post-game dialog access remains a separate decision.

## Not yet specified

- Further constraints the chosen chat surface and delivery model may reveal for the Android wrapper or the boundary between room presence and chat presence. Revisit after the delivery decision; don't invent tickets before their questions become precise.

## Out of scope

- Persisted history across refreshes or late joins; this room chat is live-only.
- Images, files, rich formatting, and clickable links in messages.
- Mute, report, and moderation controls in the first release.
- Chat in offline or solo modes.
