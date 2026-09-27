Title: Send and receive live room chat across room phases
Status: ready-for-agent

## Parent

[Live-only room chat PRD](../PRD.md)

## What to build

Deliver the first complete online-room chat path: a currently seated Player submits bounded plain text over authenticated HTTP, and a separate room-chat Durable Object delivers each accepted message over a receive-only WebSocket to eligible tabs. Signed-in Spectators can read but cannot send. Give each online room tab its own compact, initially closed chat panel, live-only in-memory log, unread count, and Player draft across waiting, play, and finished phases. Do not route chat through game state or presence. Follow the approved visual prototype for layout, not its mock messages or simulated behavior. Retry uncertainty and deletion redaction have their own follow-up issues.

## Acceptance criteria

- [ ] In every online room phase, a seated Player can submit and read messages and a signed-in Spectator can read but cannot submit, including through a direct HTTP request. Gaining or losing a seat updates the composer without discarding an unsent draft; send authorization and displayed author name come from the current authoritative seat, not client claims or the membership reverse index.
- [ ] Admission, sends, and ongoing deliveries require a current session, no pending account deletion, an existing online room record, and live room state. Invalid sessions or removed rooms are rejected and connected sockets are promptly closed; a former Player with a valid account and room may remain a read-only Spectator.
- [ ] Accepted messages have room-local IDs and order, are delivered to all currently authorized tabs (including the author's other tabs), and carry matching identity/order in the HTTP acknowledgement and socket event so a visible or spoken entry appears once. No message bodies become replayable server history: a fresh tab, refresh, late join, or reconnect receives only subsequent live messages, with no history fetch or gap filling.
- [ ] The header trigger sits after the room menu and before the spectator count. The compact panel opens closed by default, uses a separately scrolling labelled log that follows new messages, offers an explicit Send button to Players and a read-only explanation to Spectators, and leaves room code and controls accessible on narrow screens. Opening clears the numbered unread count; incoming messages count as unread while closed or blocked by another modal. The closed log is not mounted as a live announcer.
- [ ] Keyboard users can open, close, and Escape out of chat with focus returned to its trigger. The trigger exposes an accessible name, expanded state, and unread count; closed chat announces count changes rather than each message. Chat is absent in solo, offline, and pass-and-play modes and survives reopening Results or starting another game in the same mounted online tab.
- [ ] Structured text and a client send ID are accepted only within the PRD limits: trim outer whitespace; reject empty, over 200 grapheme clusters, over three lines, disallowed controls, over 4 KiB of UTF-8 text, over 8 KiB total body, or malformed types without truncating or losing the draft. Errors are actionable; names and text render literally, without HTML, Markdown, or linkification.
- [ ] Authenticated HTTP/WebSocket contract tests exercise role/phase/seat/room changes, validation boundaries, attribution, fan-out, ordering, echo/acknowledgement matching, and no replay. Controlled-network room UI tests cover visibility, unread, focus, draft/role changes, accessibility, and no duplicate entry; browser-check touch and narrow-screen access. Game actions, private hands, and game spectator counts are unchanged.

## Blocked by

- [Keep finished online rooms accessible after the result](06-finished-room-access.md)
