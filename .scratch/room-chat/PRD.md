Title: Implement live-only online room chat
Status: ready-for-agent

## Problem Statement

Players in an online Big Two room cannot talk to each other while waiting, playing, or remaining in the room after a game. Spectators cannot follow a room conversation. The current result modal also blocks continued access to the room after a game. Room chat must not expose private game state, turn chat visitors into game Spectators, or imply that messages missed during a disconnection can be recovered.

## Solution

Add a compact, accessible room chat to online rooms. Seated Players can send bounded plain text; signed-in Spectators can read it. Each open room tab receives messages live and keeps only its own in-memory log, unread count, and unsent draft. A separate chat connection delivers accepted messages, and an authenticated HTTP send confirms them independently of that connection. Reconnecting, joining late, or refreshing never replays history. Make the finished room usable after dismissing a result modal, with Results, Return home, and host-only Play again controls. Keep chat available across games in the same room tab without coupling it to game updates or presence.

## User Stories

1. As a Player in a waiting online room, I want to send room chat, so that I can coordinate before the deal.
2. As a Player during a game, I want to send room chat, so that I can talk without interrupting my turn.
3. As a Player after a game, I want to keep chatting, so that the conversation can continue before another game.
4. As a signed-in Spectator in a waiting room, I want to read room chat, so that I can follow the room without taking a seat.
5. As a signed-in Spectator during a game, I want to read room chat without a composer, so that my access is clear.
6. As a signed-in Spectator after a game, I want to read room chat, so that I can remain with the group while awaiting the host.
7. As a room visitor, I want the chat trigger beside the room menu and before the spectator count, so that I can find it without covering the table.
8. As a room visitor, I want chat closed initially and opened in a compact panel, so that the game remains the primary surface.
9. As a room visitor on a narrow screen, I want the room code and table controls to remain accessible while chat is open, so that I can still use the room.
10. As a room visitor, I want a separately scrolling log that follows new messages when open, so that the latest accepted message stays visible.
11. As a room visitor with chat closed, I want a numbered unread indicator, so that I know how many messages arrived.
12. As a room visitor, I want opening chat to clear my unread count, so that the indicator reflects messages I have not opened.
13. As a room visitor blocked by another modal, I want incoming chat to count as unread, so that messages are not silently lost to my attention.
14. As a keyboard user, I want to open and close chat, use Escape, and return focus to its trigger, so that I can navigate the room predictably.
15. As a screen-reader user, I want a named trigger with expanded state and unread count and a labelled log, so that I can discover and navigate chat.
16. As a screen-reader user with chat closed, I want count changes rather than each incoming message announced, so that chat does not interrupt card selection or turns.
17. As a Player, I want a draft and explicit Send button, so that I control when my message is submitted.
18. As a Player, I want a confirmed send to appear once even if its socket echo also arrives, so that my conversation is not duplicated.
19. As a Player whose chat socket is offline, I want HTTP confirmation to show a successful send and clear my draft, so that I do not have to wait for the socket.
20. As a Player whose send fails or is unconfirmed, I want to retain my draft and manually retry, so that I do not mistake uncertainty for delivery.
21. As a Player retrying within ten minutes, I want the same attempted send to be accepted at most once, so that a lost acknowledgement does not duplicate my message.
22. As a Player retrying after the ten-minute window, I want the uncertainty explained and a fresh explicit submission required, so that I am not promised exactly-once delivery.
23. As a Player editing text after an attempted send, I want the old send identity not to acknowledge different text, so that my draft cannot be silently misreported as sent.
24. As a Player losing a seat, I want my existing draft preserved while chat becomes read-only, so that I can use it if I regain a seat.
25. As a Spectator gaining a seat, I want a composer to become available, so that I can participate as a Player.
26. As a current room visitor, I want messages sent by others to reach each of my connected tabs, so that each tab has its own live conversation.
27. As a late arrival or a visitor opening a fresh or refreshed tab, I want an empty log, so that room chat accurately presents itself as live-only.
28. As a visitor reconnecting after a chat outage or device suspension, I want my existing in-memory log preserved but no missed messages replayed, so that I can distinguish what I actually received.
29. As an Android Trusted Web Activity user, I want chat to resume independently after backgrounding, so that the table and chat can recover without pretending to fill gaps.
30. As a room visitor during a chat outage, I want a chat-only reconnecting status while the existing log stays readable, so that I do not mistake chat failure for a game outage.
31. As a room visitor during a game-socket outage, I want live chat to continue independently, so that one connection does not disable the other.
32. As a Player, I want game turns, actions, and private hands unaffected by chat, so that conversation cannot change the rules or reveal cards.
33. As a Spectator, I want chat connections excluded from the game's spectator count, so that presence still means people watching the game.
34. As a signed-out visitor or an account pending deletion, I want chat access denied, so that room messages are restricted to eligible signed-in people.
35. As a Spectator, I want direct send attempts refused, so that bypassing the composer cannot grant Player privileges.
36. As a Player whose seat changes, I want send permission checked at acceptance and on retry, so that stale tabs cannot send as a former Player.
37. As a Player, I want messages attributed to my name stored in the current room seat, so that client-supplied names and later profile changes cannot impersonate me.
38. As a room visitor, I want invalid sessions or removed rooms to stop chat delivery promptly, so that outdated connections do not keep receiving messages.
39. As a room visitor, I want a deleted author's existing labels changed to “Deleted player”, so that the live log respects account deletion without exposing account IDs.
40. As a returning visitor whose tab slept through a deletion, I want old labels reconciled or the log cleared before it is shown, so that stale author names do not reappear.
41. As a Player, I want actionable feedback for invalid text without losing my draft, so that I can correct and resubmit it.
42. As a room visitor, I want author names and messages displayed literally without HTML, Markdown, or clickable links, so that untrusted text cannot alter the room UI.
43. As a visitor whose tab witnessed a game end, I want a dismissible result modal, so that I can return to chat after seeing the winner.
44. As a late arrival or refreshing visitor in a finished room, I want to land in the finished room rather than an automatic modal, so that chat is immediately reachable.
45. As a visitor in a finished room, I want a winner strip with Results and Return home, so that I can revisit the result or leave without blocking chat.
46. As a host in a finished room, I want Play again on the strip, so that I can restart without reopening Results.
47. As a non-host Player or Spectator, I want no restart control, so that room management remains with the host.
48. As a Spectator in a finished room, I want to know the room awaits the host, so that I understand why I cannot restart.
49. As a keyboard user, I want result-modal focus contained and returned to Results on dismissal, so that underlying chat is inert until I close the modal.
50. As a room visitor, I want chat state to survive reopening Results, a successful new game, or a failed restart, so that those interactions do not discard conversation or drafts.
51. As a solo, offline, or pass-and-play user, I want no room chat shown, so that the feature appears only where an online room exists.

## Implementation Decisions

- Follow the approved compact header-triggered panel, gold-trimmed circular control, numbered unread badge, independently scrolling log, Player composer, Spectator explanation, and narrow-screen room-code row. The prototype is a visual reference, not a source of production message, reply, input-length, or retention behavior.
- Scope chat to the online room and tab, not to an individual game. Keep one receive-only chat socket per open online room tab even while its panel is closed. Unmount the active live log when closed; continue counting incoming unread messages. Opening clears the count. Keep chat state when the room moves between waiting, active play, and finished phases or starts another game.
- Use a separate room-chat Durable Object and WebSocket for receiving, plus an authenticated HTTP endpoint for sending. Do not route messages through the game's read-only socket or state machine, and do not include chat sockets in game spectator presence.
- Admit only a currently signed-in account without pending deletion to a valid online room record with live room state. Any eligible visitor may receive regardless of seat or phase; the room-membership reverse index is neither a read prerequisite nor seating authority. On each send or retry, verify the account occupies a current seat in authoritative room state and use that seat's stored display name. Never trust claimed author, role, phase, name, or a stale client view.
- Recheck eligibility for ongoing deliveries and promptly revoke invalid-session, deletion-pending, or missing-room connections; reject new upgrades and sends when the room record or live room state disappears. A former Player remains an eligible read-only Spectator if their account and room remain valid.
- Assign accepted messages a room-local order and message ID. Fan out each accepted event to every currently connected, authorized tab, including the sender's other tabs. Carry matching identity and order in the HTTP acknowledgement and socket event so the sender can merge confirmation and echo into one ordered entry; do not duplicate visible or spoken entries.
- Keep message bodies only in connected tabs' in-memory logs and transient delivery, never as replayable server history. Retain bounded acknowledgement/deduplication metadata and order bookkeeping for ten minutes across chat-object hibernation/restart. Reuse a client send ID on manual retry, reauthorize it, and reject changed text under that ID. After the window, require a fresh explicit submission and disclose uncertainty. Never enqueue automatic resends or fill gaps on reconnect.
- An HTTP success alone confirms acceptance and may show the message locally and clear its draft while the sender socket is offline. A failed or unknown result keeps the draft and offers explicit retry; an unconfirmed message must not appear as sent. Show chat-only reconnecting status without disabling game actions or deciding HTTP send outcomes from socket status.
- Send live author-redaction events keyed by an opaque correlation token, replacing matching in-memory labels with “Deleted player” without exposing account IDs or persisting message bodies. Before revealing a suspended tab's old log after reconnect/resume, reconcile deletion status for its authors or clear the log. Previously read or copied text cannot be revoked.
- Accept structured message text and client send ID only. Trim outside whitespace and reject empty text, over 200 grapheme clusters after trimming, over three lines, disallowed controls, over 4 KiB UTF-8 text, over 8 KiB total request body, or malformed types; do not truncate. Give actionable errors and preserve drafts. Render all text literally, without HTML, Markdown, or linkification.
- No chat-specific rate limit, mute, report, or moderation controls in the first release; retain normal authenticated endpoint protections.
- Show the modal automatically only to a tab that witnesses a transition into game end. Permit close and Escape, keep focus within the modal and underlying chat inert, and return focus to the persistent Results control on dismissal. A fresh or refreshed finished-room tab gets the persistent strip without automatic modal. The strip shows winner, Results, Return home, host-only Play again, and an awaiting-host explanation for Spectators; wrap controls on narrow screens. New games remove the old result and strip without clearing chat; failed restarts preserve the finished view.

## Testing Decisions

- Test observable behavior and authorization at the highest practical boundaries, not internal reducers, storage tables, component implementation, or exact socket-management details. Use two primary seams: the authenticated chat HTTP/WebSocket boundary for server contracts, and the online room UI with controlled network events for tab-level behavior. Keep game and chat regression checks at those same boundaries where possible.
- Server contract tests cover room/phase/role access; live room and seat changes; session and account-deletion revocation; invalid-room closure; stored seat-name attribution; structured-input, Unicode, line, control, and byte limits; literal message payloads; fan-out and room ordering across tabs; matching acknowledgement/echo; ten-minute retry deduplication across hibernation/restart; changed-payload rejection; redaction without account ID or replayable history; and the absence of replay or gap-fill on reconnect. Exercise actual admission/send/delivery behavior rather than testing only a permission helper.
- Client tests cover unread changes while closed or blocked by a modal, opening/closing and scroll-follow, composer/read-only transitions with draft preservation, acknowledgement/echo merging, success with socket down, failed/unknown sends and manual retry, expired retry guidance, independent chat/game outages, refresh/re-entry resets, no history fetch, resume-time deletion reconciliation or clearing, and no duplicate screen-reader announcements.
- Room UI tests cover keyboard focus, trigger state, labelled log and count announcement, result-modal transition versus late join, focus trapping and restoration, finished-room actions for host/non-host/Spectator, restart success/failure, chat-state survival across results and games, and absence of chat in non-online modes. Include browser checks for narrow-screen positioning, touch/keyboard access, and Trusted Web Activity foreground/resume behavior.
- Follow the existing room rejoin tests' controlled HTTP/WebSocket events and the table component's role-based UI tests as client prior art. Existing game-action authorization and room-view tests demonstrate server-side role and visibility checks, but chat needs higher-level API/socket coverage to establish delivery, revocation, and ordering together. Run the project's Vite+ check and test commands when implementing.

## Out of Scope

- Persisted or fetchable chat history, delivery of missed messages, cross-tab synchronization of read status or drafts, and exactly-once guarantees after the ten-minute retry window.
- Images, attachments, rich text, Markdown rendering, and clickable links.
- Chat-specific rate limiting, mute, report, or moderation controls.
- Chat in solo, offline, or pass-and-play modes, or a separate native Android chat client.
- Changing the game rules, private-hand visibility, or the definition of game Spectator presence.

## Further Notes

- The [completed planning map](map.md), [implementation handoff](spec.md), and its linked resolved decisions are authoritative. This PRD translates them into implementation work; it does not reopen them.
- The approved UI prototype contains mock messages, a simulated reply, and a single-line 280-character input. These are not production requirements.
- Local issue-tracker publication uses this PRD in the existing room-chat effort with `Status: ready-for-agent`. A subsequent `/to-issues` can split the implementation into independently grabbable tickets.
