Title: Decide the room chat surface for Players and Spectators
Status: closed
Labels: wayfinder:prototype
Parent: ../map.md
Assignee: alex
Blocked by: none

## Question

What concrete chat interface should an online room expose across waiting, playing, and finished states, on desktop and narrow/mobile layouts, so seated Players can send and signed-in Spectators can read without hiding essential table controls? Resolve opening/closing, composer visibility, unread indication, and keyboard/screen-reader interaction using a rough prototype for human feedback. Link the prototype in the resolution; do not implement the production UI.

## Comments

### Prototype for feedback (not a resolution)

- [Opt-in room chat prototype](../../../apps/frontend-web/src/components/game-room/room-chat-prototype.tsx) on the real online room route: open `https://local.bigtwo.com/room/<room-code>?chat-prototype` while running the local dev environment. Styling is in [room-chat-prototype.css](../../../apps/frontend-web/src/components/game-room/room-chat-prototype.css).
- Local-only seeded messages and a simulated reply demonstrate open/close, unread, and spectator read-only behavior. Nothing is sent to the backend. The trigger stays small; on phones the panel opens downward from the header and stops above the play controls.
- The finished-game winner dialog still needs a separate interaction decision before the handoff spec.
- Human feedback: the chat trigger should match the existing round table buttons and show a numbered unread indicator. The prototype now reuses `room-icon`, starts with two preview unread messages, clears the badge on opening, and can show it again for a simulated reply received while closed.
- Human feedback: place chat immediately after the menu, with the spectator count to its right. On narrow screens the preview moves the room code to a compact second header row so all three fit in one row; the chat panel opens below that row, leaving the code and play controls accessible.
- Human feedback: after a message is posted, keep the latest message in view. The prototype now scrolls the message log to the bottom whenever an open chat receives a new message (including a local send); a browser check with overflowing content and an automated test cover this behavior.

### Resolution

The human approved the [opt-in room chat prototype](../../../apps/frontend-web/src/components/game-room/room-chat-prototype.tsx) as the UI direction. This locks the surface, **not** an implementation: messages and replies in the prototype are local mock data, and production chat still requires separate delivery and authorization work.

- In online rooms, put a chat trigger immediately to the right of the menu button, with the spectator count to the right of chat. Match the existing circular gold-trimmed `room-icon` buttons rather than adding a prominent chat bar. The trigger has an accessible name and a numbered unread badge when there are unread messages; opening chat clears that count.
- Chat is closed by default and opens as a compact, independently scrolling panel anchored below the header. On narrow screens, use a short second header row for the room code; open the panel below that row so the room code and play controls stay accessible. Do not expand chat across the whole table by default.
- Show plain-text author/message entries. A Player has a composer and Send button; a signed-in Spectator gets the same readable conversation without a composer, with a short read-only explanation. Trim whitespace-only submissions and keep the newest message visible after posting or receiving one while the panel is open.
- Support opening and closing by keyboard, Escape to close, visible focus, and focus returning to the trigger on close. Give the trigger an accessible unread count and the message list a labelled log; do not rely on the badge colour alone.
- Keep chat available through waiting, play, and the post-game room. The existing winner dialog prevents post-game access; [Decide how Players and Spectators reach chat after a game](05-finished-chat-access.md) must settle that overlay's behavior before acceptance scenarios are finalized. No choice about the winner dialog is implied by this UI approval.
