Title: Preserve online Room chat and let Spectators participate
Status: ready-for-agent

## Problem Statement

Online Room chat is live-only: refreshing, leaving and returning, or reconnecting starts a new log, so visitors cannot catch up on what they missed. A signed-in Spectator can read but cannot contribute. The current behavior makes a room's conversation fragile and excludes people who are watching without a seat. Persisting that conversation also introduces a lifecycle and privacy obligation: abandoned rooms cannot retain chat indefinitely, and account deletion must remove a former participant's identifying name and message text wherever they remain accessible.

## Solution

Keep a room's complete, ordered chat history for the lifetime of the online room. Allow signed-in Players and Spectators to send and read. When someone arrives or returns, show recent messages first and offer older messages on demand; continue to deliver new messages live. Attribute each message to the sender's account name and role at send time. Deleting an account replaces that person's existing messages with non-identifying placeholders. Empty rooms and all their data expire after 48 hours, or after seven days if an unfinished game is paused; any connected signed-in visitor keeps the room active. On rollout, immediately remove pre-existing rooms with no connected visitors, including unfinished games.

## User Stories

1. As a Player in a waiting online room, I want my messages to remain in Room chat, so that arrivals can follow the conversation.
2. As a Player during a game, I want chat history to persist without affecting game turns, so that I can talk and play independently.
3. As a Player in a finished room, I want to continue the same conversation into the next game, so that our group does not lose context.
4. As a signed-in Spectator, I want to send Room chat without taking a seat, so that I can join the conversation without joining the game.
5. As a signed-in Spectator, I want the same input and send feedback as a Player, so that my contributions work predictably.
6. As a signed-in Spectator, I want chat participation not to expose unplayed hands or permit game actions, so that watching remains distinct from playing.
7. As a Player who leaves the table, I want to keep chatting as a Spectator, so that leaving my seat does not end my participation in the room.
8. As a Spectator who takes a seat, I want my existing conversation to continue, so that my role change does not split my messages into separate histories.
9. As a visitor returning to the Lobby and then the same room, I want recent chat on my return, so that I can catch up without giving up my seat.
10. As a visitor who refreshes, closes, or reopens the room, I want recent history to reload, so that a tab's lifetime does not determine what I can read.
11. As a visitor whose chat connection drops and reconnects, I want missed messages to appear in order, so that a network interruption does not create a permanent gap.
12. As a visitor with a chat connection outage, I want my existing log and draft to remain usable, so that a transient problem does not erase them.
13. As a visitor entering a room for the first time, I want to read messages from before I arrived, so that I understand the current conversation.
14. As a visitor, I want the newest messages available promptly without loading the entire history at once, so that a long conversation remains usable.
15. As a visitor, I want to request older messages until I reach the beginning, so that the full room history is accessible.
16. As a visitor paging backward while new messages arrive, I want a continuous, correctly ordered conversation without duplicates or omissions, so that history and live chat agree.
17. As a visitor who opens chat after returning, I want past messages displayed without a misleading unread badge, so that unread reflects messages received while this room page is open.
18. As a visitor who leaves chat closed or has another modal open, I want genuinely new live messages to increment unread, so that I still notice them.
19. As a visitor loading or replaying history, I want no repeated incoming-message sounds or announcements, so that catching up does not masquerade as live traffic.
20. As a sender, I want my confirmed HTTP send and its live echo to appear once, so that retries, replay, and reconnection do not duplicate what I wrote.
21. As a sender whose acknowledgement is uncertain, I want my draft and existing retry protections preserved, so that persistence does not silently double-send or falsely claim success.
22. As a Spectator sending a message, I want my account name and Spectator role shown, so that readers know who is speaking and in what capacity.
23. As a Player sending a message, I want my account name and Player role shown, so that readers can distinguish contributions from seated participants.
24. As someone who changes seats or account name, I want older messages to retain the name and role from when they were sent, so that the historical conversation does not change unexpectedly.
25. As a sender, I want the server to determine my identity and current role rather than trust client-submitted labels, so that another visitor cannot impersonate me.
26. As a visitor, I want plain text rendered literally, so that another person's text cannot inject markup or links into Room chat.
27. As a signed-out visitor, I want chat access denied, so that room history is available only to eligible signed-in visitors.
28. As a visitor whose session expires or whose account enters deletion, I want sends, history access, and subsequent delivery stopped, so that stale access does not persist.
29. As a visitor to an expired or removed room, I want its page and chat endpoints to report that it is unavailable, so that an old link cannot expose or revive its conversation.
30. As someone deleting my account, I want my name and message text removed from every retained room's history, including rooms I watched without a seat, so that my old contributions are no longer readable.
31. As a visitor reading a deleted person's messages, I want placeholders to preserve their positions without revealing the old name or text, so that the conversation order remains understandable.
32. As a visitor with chat open when another account is deleted, I want its visible messages redacted, so that an open tab does not keep displaying deleted content.
33. As a visitor whose tab was disconnected during deletion, I want old author names and text reconciled before they are shown again, so that stale local data cannot undo redaction.
34. As a room visitor, I want an empty room kept available for 48 hours after its last visitor disconnects, so that I can return soon and see its chat.
35. As a room visitor in an unfinished game, I want that empty room kept for up to seven days, so that we have more time to resume.
36. As a connected Spectator, I want the room kept active even when I am not playing or chatting, so that I am not removed while watching.
37. As someone creating a room without successfully opening its room connection, I want its 48-hour return window to start at creation, so that abandoned new rooms do not last forever.
38. As a returning visitor who reconnects before expiry, I want the inactivity countdown restarted when the room next becomes empty, so that the room remains available for its full return window.
39. As a visitor to an expired room, I want its game, chat, and Lobby listings removed together, so that there is no partial room left to enter.
40. As a visitor with an existing room open when the expiry policy ships, I want it to remain active until I disconnect, so that rollout does not remove a room I am using.
41. As a visitor with an existing room that has no connected visitors at rollout, I expect it to disappear immediately, even if its game was unfinished, so that the new expiry policy applies consistently to legacy empty rooms.
42. As a solo, offline, or pass-and-play user, I want no change to my game, so that this feature remains specific to online rooms.

## Implementation Decisions

- This is a follow-on to the existing live-only Room chat, not a rewrite of game logic or the previous historical planning records. Replace the earlier no-replay/read-only-Spectator behaviors where they conflict with this PRD; retain the established compact chat panel, HTTP send confirmation, live WebSocket delivery, independent game/chat connections, input limits, and literal text rendering unless explicitly changed here.
- Persist every accepted Chat message in durable room-scoped storage before confirming its send. Keep stable room-local IDs and order; store the author's authenticated account identity for deletion lookup, a snapshot of their account name and Player/Spectator role, and the accepted text. Never accept an author or role from client input. A current Player's role comes from their seat at acceptance; everyone else eligible to visit is a Spectator. An account-name change does not rewrite old messages.
- Provide authenticated, bounded, cursor-paged history (newest batch first, older pages on request) through the existing room-chat service boundary. Any signed-in visitor with current access to a live room can read the entire history, including messages before their first visit; room membership or seating is not required. Reject signed-out, deletion-pending, invalid-session, missing-room, and expired-room requests. Responses must not be cached publicly.
- Combine history loading and the existing live stream by stable message ID/order so joining, paginating, refreshing, and reconnecting cannot create duplicates or permanent gaps at the history/live handoff. Preserve the existing confirmation-versus-echo deduplication and explicit-retry semantics; do not use a history fetch to resend a draft.
- Keep unread as tab-local attention state, not persisted per account: historical or missed messages fetched on initial entry/re-entry do not add unread or play receive sounds; only new live messages received while the current room page is open can do so. Chat stays closed by default, with recent history accessible on opening.
- Replace the Spectator read-only explanation with the same composer and send path available to Players. Server-side authorization still verifies a current authenticated account, active room, and non-pending deletion on every send. Sending as a Spectator never seats them, enables game actions, or changes game spectator presence.
- On account deletion, mark the account ineligible before redacting every retained Chat message it authored, including while it was only a Spectator. Replace stored author name and message text with a neutral deleted-participant placeholder while retaining order and role-independent position; remove or render inaccessible identifying sender references. Propagate redaction to connected clients, and reconcile or clear stale tab-local entries before showing them after reconnect/resume. The deletion workflow must not complete successfully while reachable stored chat remains unredacted.
- Give online rooms a persistent inactivity deadline derived from creation if nobody connects, otherwise from the last connected visitor's departure. Presence includes signed-in game-room visitors and Spectators (including when only the chat connection survives), not merely seated Players; stale, invalid, or deletion-pending connections do not keep a room active. Reconnection before expiry cancels/reset the countdown, and disconnection starts a fresh one. A waiting or finished room gets 48 hours; an unfinished game gets seven days. An unfinished game left empty for the full seven days expires even if seats remain occupied.
- Expiry removes the room record, membership/Lobby references, game state, and chat history together; do not expose or resurrect stale data if deletion partially fails or a room code is later reused. Treat expiry and reconnection races in favor of an actually connected eligible visitor, and make cleanup repeatable after partial failures. A missing or expired room denies new history requests, upgrades, and sends and stops existing delivery.
- At rollout, existing rooms with no connected signed-in visitors are expired immediately, including unfinished games; no inferred or retroactive grace period. Rooms with a connected visitor remain active and start the applicable countdown on the next departure. Because this is irreversible data deletion, implementation must explicitly verify presence and the cleanup target before applying it to existing rooms.
- Do not alter card privacy, game rules, host privileges, or the definition of a game Spectator. Messages remain room-scoped across waiting, active play, finished state, and resets. Preserve ordinary draft, accessibility, and error behavior in the existing chat UI.

## Testing Decisions

- Prefer focused automated tests of observable outcomes and existing public boundaries over storage-table, reducer, or socket-internals assertions. Basic unit and integration tests are sufficient; there is no requirement to introduce an automated browser E2E suite. Existing authenticated chat API/socket tests, room-object lifecycle tests, account-deletion tests, and Room chat UI tests are prior art.
- Server-side tests should cover Player and Spectator sends in each phase; account-name/role snapshots; signed-out, invalid, deletion-pending, and expired-room rejection; ordered durable acceptance and paged history; join/reconnect races without gaps or duplicates; retry/acknowledgement consistency; and unchanged game-state privacy and spectator counts.
- Deletion tests should exercise stored and live redaction across seated and Spectator-only authors, multiple rooms, connected and resumed tabs, and failure handling that prevents successful account deletion with exposed stored messages. Expiry tests should cover creation-without-connection, 48-hour waiting/finished rooms, seven-day unfinished games, connected Spectators, reconnects near a deadline, deletion/connection races, partial cleanup and code reuse, immediate legacy-empty-room cleanup, and preservation of legacy rooms with connected visitors.
- UI tests should cover recent-history loading on entry/re-entry, paging to oldest messages, live updates during pagination, literal text, role labels, composer across seat changes, accessibility of history controls, retained drafts, no replay-induced unread/sounds, and existing send-echo deduplication. Prefer user-visible assertions rather than testing the particular data-fetching hook or transport used.
- After **all** implementation issues are complete, run a manual verification of the actual online room with separate Player and Spectator accounts: send from both roles, refresh/leave/return, page back, disconnect/reconnect, switch seats, check account-deletion redaction, and verify expiry and rollout behavior using safe test rooms/fixtures. Include mobile/narrow-screen and keyboard checks. Record results and any gaps before declaring the feature done. Run the repository's Vite+ check and test commands during implementation.

## Out of Scope

- Rich text, attachments, clickable links, reactions, individual message editing or removal, and new mute/report/moderation controls.
- Persistent per-account unread/read receipts, cross-tab draft synchronization, or an unread badge for messages received while away from the room page.
- Chat for solo, offline, or pass-and-play games; changes to turns, private hands, host abilities, or game spectator counts.
- Indefinite room archives or retention of chat after its room expires. Browser E2E automation is not required; manual verification is required at the end.

## Further Notes

- The domain language in the root glossary and the decision to expire rooms and chat together in the accepted room-expiry ADR take precedence over earlier live-only chat planning. The existing live-only chat PRD and spec describe the implemented starting point, not the target state for this follow-on effort.
- The configured issue tracker is local Markdown. This PRD is a new effort so it does not overwrite the earlier live-only Room chat PRD. Subsequent issue splitting should target this PRD and reserve final manual verification as a completion step after implementation.
