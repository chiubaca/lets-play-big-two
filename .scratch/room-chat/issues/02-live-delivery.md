Title: Decide live-only chat delivery and reconnect semantics
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: alex
Blocked by: none

## Question

What does live-only delivery mean for a Player sending while their connection drops, for recipients with multiple tabs, for reconnection, and for messages arriving while chat is closed? Decide whether the existing read-only game-state WebSocket can carry chat broadcasts while sends use authenticated HTTP, or whether a different route/protocol is warranted. Specify ordering, acknowledgements, duplicates, and ephemeral retention boundaries without implementing them.

## Comments

### Resolution

- Use a **separate room-chat Durable Object and chat WebSocket**, not the game room's existing read-only WebSocket or game-state machine. The chat socket receives only; a separate authenticated HTTP endpoint accepts Player sends and forwards accepted messages to the chat object. The Worker and chat object must coordinate with the authoritative room/seat state; [Decide who may send and receive room chat](03-chat-authorization.md) specifies those checks. Keep game spectator presence distinct from chat socket presence.
- Connect the chat socket for each open online room tab even when its chat panel is closed. Fan out each accepted message to every currently connected authorized tab, including all tabs belonging to its author. Each tab keeps its own in-memory message log and unread count; messages arriving while the panel is closed increase that tab's unread count, and opening it clears the count. A refresh or late arrival starts with an empty chat log. Do not replay messages missed during disconnection, reconnect, background suspension, or refresh; a reconnect receives only subsequent live messages.
- A Player's outgoing draft is not queued for automatic resending. If a send fails or remains unconfirmed, retain the draft in that tab and show an explicit retry path. HTTP success means the chat object accepted the send; the UI can clear the draft and show the confirmed message locally even if that tab's chat socket is disconnected. If the socket echo and HTTP acknowledgement both arrive, identify them as the same message and display it only once. A send that was never confirmed must not be presented as sent.
- Give each attempted message a client-generated send ID, reused for manual retries. The chat object deduplicates that ID so a lost HTTP response followed by a retry does not broadcast twice. Retain only bounded deduplication/acknowledgement metadata (no message body or replayable history) for **10 minutes**, including across chat-object hibernation/restart. An unresolved send older than this window cannot be retried with an exactly-once promise; require a new, explicit submission instead. A reused ID with different text must not silently acknowledge the old send.
- The chat object assigns each accepted message a room-local order and message ID; connected tabs display accepted messages in that order. No client gap filling, history endpoint, or replay follows from the sequence. The HTTP acknowledgement and WebSocket event carry enough matching identity/order information to merge a sender's local confirmation with its echo. An active tab's log lives only in memory; the server may retain short-lived dedup metadata and sequence bookkeeping, but never message content for later delivery.
- The Android package is a Trusted Web Activity of the web app, not a separate chat client. Include foreground/background reconnect and no-replay expectations in [Agree on chat acceptance scenarios and handoff spec](04-acceptance.md), alongside the independent chat/game connection lifecycle.
