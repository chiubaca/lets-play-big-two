Title: Agree on chat acceptance scenarios and handoff spec
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: chiubaca
Blocked by: 01-chat-surface.md, 02-live-delivery.md, 03-chat-authorization.md, 05-finished-chat-access.md

## Question

Given the resolved UI, delivery, and authorization decisions, which observable scenarios constitute an implementation-ready chat spec (including Player/Spectator access, all room phases, live-only joins/refreshes, disconnects, accessibility, and regression of game updates)? Capture the consolidated handoff as a linked Markdown asset rather than duplicating answers in the map.

## Comments

### Resolution

The [implementation handoff spec](../spec.md) consolidates the four earlier decisions into an interaction, delivery, and authorization contract and an eight-part acceptance matrix. The human confirmed that a chat-only outage leaves the log/draft usable with a reconnecting indicator and permits explicit HTTP send attempts; that live chat state persists across games in the same tab; that losing a seat makes chat read-only without erasing an unsent draft; and that closed-chat accessibility announces unread counts rather than each message's contents. The handoff distinguishes the approved local-only prototype from production behavior and covers game-connection independence, Android background/resume, result modal access, input limits, redaction, and regression checks. No production chat was implemented by this ticket.
