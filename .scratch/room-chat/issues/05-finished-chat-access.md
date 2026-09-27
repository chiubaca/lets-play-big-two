Title: Decide how Players and Spectators reach chat after a game
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: alex
Blocked by: 01-chat-surface.md

## Question

The approved chat surface lives in the room header, but `GameRoom` opens a winner dialog throughout `GAME_END`, with no way for a non-host Player or Spectator to dismiss it and keep watching or chatting. What should happen to the winner dialog and its actions so room chat remains reachable after a game without blocking Play again, Return home, or a subsequent game? Decide focus and small-screen behavior as part of that interaction; do not implement it in this planning ticket.

## Comments

### Resolution

- Keep the winner result as a modal celebration for a tab that **witnesses the transition** into `GAME_END`. Make it dismissible via an explicit close control and Escape (and ordinary modal dismissal where appropriate). Dismissing it reveals the finished room, including its header chat. A tab that first joins or refreshes while the room is already finished lands in the finished room instead of automatically opening the modal; it can open the result itself.
- In the finished room, show a compact persistent result strip with the winner summary, a **Results** control that reopens the modal, **Play again** for the host, and **Return home**. Non-host Players and Spectators can stay and use chat or leave; Spectators also see that the room is waiting for the host. The modal may retain the relevant actions, but no one should have to reopen it to restart or leave. Do not grant Spectators or non-host Players a restart action.
- While the result modal is open, focus stays inside it and the underlying room/chat is inert. On dismissal, restore focus to the finished-room Results control (including when closing by Escape); reopening the result moves focus into the modal. The compact strip and its actions must wrap or stack on narrow screens without covering the chat trigger, open chat panel, room code, or table controls. Chat is reachable by keyboard and touch once the modal is dismissed.
- When a new game begins, automatically close any still-open old result, remove the finished-room strip, and restore normal room interaction for all tabs, including Spectators; never reopen that old result. A subsequent transition into `GAME_END` can show the new celebration. A failed host restart leaves the finished room and its actions available instead of pretending a new game began. Dismissing/reopening the result does not clear the tab's live chat log, unread state, or unsent draft; refresh still obeys the separately agreed live-only chat semantics.
