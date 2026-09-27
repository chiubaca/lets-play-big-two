Title: Handle uncertain chat sends and independent outages
Status: ready-for-agent

## Parent

[Live-only room chat PRD](../PRD.md)

## What to build

Make live chat usable when HTTP acknowledgements are uncertain or either connection drops. A Player's explicit send succeeds or fails based on its authenticated HTTP result, not the chat socket state. Manual retries of the same attempted text use the same client send ID for a ten-minute deduplication window; after that window, require a fresh explicit submission with clear uncertainty guidance. Reconnect chat independently of game updates without replaying missed messages. Keep already received messages and drafts in the current tab unless it is refreshed, leaves, or must clear them for author-deletion safety.

## Acceptance criteria

- [ ] HTTP success confirms an accepted message once, clears the matching draft, and can display it locally while the sender's chat socket is offline; a late socket echo or acknowledgement does not duplicate the visible or spoken entry. Text edited after an attempted send is not cleared or acknowledged as the old text.
- [ ] Failed or unknown HTTP outcomes preserve the draft, do not present an unconfirmed message as sent, and offer explicit manual retry without automatic resend. Current seat and account eligibility are checked again on each retry; reusing an ID with changed text is rejected rather than silently confirming the old send.
- [ ] A manual retry within ten minutes yields the same acceptance identity/order without a second fan-out, including after chat-object hibernation/restart. Retain only bounded deduplication/acknowledgement metadata and order bookkeeping, not message bodies or replayable history. After expiry, explain possible prior delivery and require a new explicit submission rather than promising exactly-once delivery.
- [ ] Chat outage leaves its existing log readable and shows chat-only reconnecting status while game turns and actions remain available. Game-socket outage does not stop live chat. Reconnect, suspension, or Android Trusted Web Activity foreground/resume never replays missed messages, fetches chat history, fills sequence gaps, or counts chat sockets as game Spectators.
- [ ] HTTP/WebSocket tests cover deduplication across restart, changed payloads, reauthorization, expired retries, ordering, and no replay; controlled-network client tests cover success with a down socket, failures/unknown results, edited drafts, retry guidance, independent outages, and resume. Browser-check foreground/resume behavior where the environment supports it.

## Blocked by

- [Send and receive live room chat across room phases](07-live-room-chat.md)
