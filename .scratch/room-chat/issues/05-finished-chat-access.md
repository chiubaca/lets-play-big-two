Title: Decide how Players and Spectators reach chat after a game
Status: open
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: unassigned
Blocked by: 01-chat-surface.md

## Question

The approved chat surface lives in the room header, but `GameRoom` opens a winner dialog throughout `GAME_END`, with no way for a non-host Player or Spectator to dismiss it and keep watching or chatting. What should happen to the winner dialog and its actions so room chat remains reachable after a game without blocking Play again, Return home, or a subsequent game? Decide focus and small-screen behavior as part of that interaction; do not implement it in this planning ticket.
