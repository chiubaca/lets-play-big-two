Title: Keep finished online rooms accessible after the result
Status: ready-for-agent

## Parent

[Live-only room chat PRD](../PRD.md)

## What to build

Make a finished online room usable without leaving the result celebration permanently open. Only a tab that witnesses a transition into game end opens the result modal automatically; a late arrival or refreshed tab sees the finished room and can choose Results. Keep a persistent winner strip with Results, Return home, and host-only Play again, plus an awaiting-host explanation for Spectators. This prepares the finished room for chat without adding chat in this issue. Preserve existing game authorization and non-online result behavior.

## Acceptance criteria

- [ ] A tab that witnesses game end opens a dismissible result modal; a tab that first enters or refreshes a finished room does not automatically open it and can reopen it via Results.
- [ ] Closing by the visible control or Escape returns focus to Results; focus stays inside the modal and the underlying room is inert while it is open.
- [ ] The finished strip shows the winner and Return home to every visitor, Play again only to the host, and an awaiting-host explanation to Spectators. Controls wrap on narrow screens without obstructing the room header or table controls.
- [ ] A successful restart closes the old result and removes the strip; a failed restart leaves the finished view and its controls usable. The room remains mounted across result open/close so later tab-local chat can survive it.
- [ ] Room UI tests distinguish transition from late entry, cover host/non-host/Spectator actions, keyboard focus, and restart outcomes; browser-check the narrow-screen layout.

## Blocked by

None - can start immediately.
