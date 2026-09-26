Title: Decide live-only chat delivery and reconnect semantics
Status: open
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: alex
Blocked by: none

## Question

What does live-only delivery mean for a Player sending while their connection drops, for recipients with multiple tabs, for reconnection, and for messages arriving while chat is closed? Decide whether the existing read-only game-state WebSocket can carry chat broadcasts while sends use authenticated HTTP, or whether a different route/protocol is warranted. Specify ordering, acknowledgements, duplicates, and ephemeral retention boundaries without implementing them.
