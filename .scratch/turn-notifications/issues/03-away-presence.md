Title: Decide when a Player is away from the room
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: chiubaca
Blocked by: none

## Question

What counts as actively viewing the relevant online room for suppressing a Turn notification: visible tab, background tab, lobby, disconnected browser, multiple tabs, and multiple devices? Specify the intended policy and acceptable races when a Player closes or reopens the room around a turn change; do not assume an open WebSocket means the Player is looking at the game. Work through concrete scenarios with the human.

## Comments

### Resolution

A Player is **actively viewing a room** only while a tab or app window showing that specific online room is both visible and focused. An open connection alone does not count. A background tab, an unfocused room window, the Lobby, another room, and a closed or disconnected tab do not establish active viewing of the relevant room. If any of the Player's tabs or devices is actively viewing that room, suppress that Turn's alert on **all** subscribed devices; other connected but inactive tabs do not change this. For example, a focused room on a laptop keeps the subscribed phone quiet, while a laptop sitting in the Lobby does not.

Suppress only with fresh, affirmative evidence of active viewing. If that evidence is stale or missing, treat the Player as away and allow an alert, even if a briefly disconnected tab might actually still be on screen. The delivery design must choose how to communicate and expire viewing evidence, but must not equate a connected WebSocket with active viewing.

Presence is checked at the start of a new Turn: if actively viewing then, that Turn earns no alert, even if the Player backgrounds the room before acting. If away then, recheck before sending and again on the receiving device before display; skip the alert if the Player is actively viewing the room at either check. A skipped alert does not become a later reminder if the Player leaves again during the same Turn. If the Player opens the room only after an alert has already displayed, there is no requirement to recall it. These checks accept unavoidable focus/connection/delivery races rather than guaranteeing silence under all network conditions.

No additional ticket is needed now: [Decide subscription storage and reliable turn delivery](06-delivery-design.md) will specify the concrete freshness mechanism, and [Agree on turn notification acceptance and handoff](07-handoff-spec.md) will cover cross-device and timing scenarios.
