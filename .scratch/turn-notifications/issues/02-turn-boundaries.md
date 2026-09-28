Title: Define which online turns earn an alert
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: chiubaca
Blocked by: none

## Question

Which successful online-game transitions count as the start of a new Player turn, including the first deal, plays, passes, new rounds, game end, reset, and resumed rooms? Define one-alert-per-new-turn identity and stale-alert handling with concrete scenarios so rejected actions, repeated snapshots, and room re-entry do not create duplicate alerts. Ask the human one question at a time; distinguish a genuinely new turn for the same Player from a repeated view of the same turn.

## Comments

### Resolution

A **new turn** is a distinct opportunity for a seated Player to act in an ongoing online game. It begins on a successful `START_GAME` deal for the Player holding 3♦, or on a successful card play or pass that leaves the game ongoing and hands control to the next Player. The final pass of a round starts a new turn for the round's lead even when that is the same Player who last played. A newly dealt game starts a fresh turn even if the first Player and room are unchanged. A winning play ends the game and starts no next turn.

Give each turn occurrence a stable identity scoped to its room and game, associated with the Player whose turn it is. It must distinguish two turns of the same Player (including new-round leads and new games), survive persistence and reconnection, and not be inferred solely from the current Player index, machine phase, or a broadcast snapshot. A rejected action, reset, game end, restored room, repeated snapshot, or room re-entry does not itself create a turn notification. Reset or game end terminates any outstanding turn; a subsequent successful deal creates a new one. For example, A plays, B passes, and the lead eventually returns to A: A's new-round turn is different from A's earlier turn; fetching that same new-round snapshot twice is not two turns.

At most one alert may be shown **per subscribed device per turn occurrence**; two subscribed devices may each show one. Never generate a reminder for an unchanged turn. Drop queued work if the identified turn is no longer current before send. On receipt, the device must confirm the identified turn is still current before display; if it cannot confirm, suppress the alert rather than display a possibly stale “your turn” message. A turn that has already ended is not revived by restoring a room. These checks do not imply that an OS notification already displayed can always be recalled after the turn ends; return-to-room behavior belongs to [Decide alert content and return-to-room behavior](05-alert-content-and-return.md).

Whether a Player is away, how opt-in behaves mid-turn, and the concrete turn-id/delivery mechanism remain with [Decide when a Player is away from the room](03-away-presence.md), [Decide the online Table settings opt-in flow](04-settings-and-permission.md), and [Decide subscription storage and reliable turn delivery](06-delivery-design.md). No additional ticket is needed yet.
