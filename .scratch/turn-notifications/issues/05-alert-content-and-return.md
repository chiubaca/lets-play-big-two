Title: Decide alert content and return-to-room behavior
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: chiubaca
Blocked by: none

## Question

What should a Turn notification show, and what should happen when the Player opens it? Resolve room identification, privacy of lock-screen text, opening the existing room tab versus a new one, and what to show when a turn or room has ended before the alert is tapped. Use concrete scenarios and ask the human one question at a time.

## Comments

### Resolution

Show the generic lock-screen text **“It’s your turn”** with no room name, room code, Player name, cards, or other game details. The notification still carries a validated destination for the specific online room, so alerts from different rooms can lead to their respective rooms even though their visible text is the same. Do not expose the room destination as notification copy.

On tap, focus an existing tab or app window showing that room if one exists; otherwise open that room in a new tab or app window rather than replacing a different room. Route through normal sign-in and room loading. If the intended Player has signed out or another account is now signed in on that device, require sign-in as the original Player before following the notification to the room; do not disclose or open the targeted room under the other account. A notification displayed before sign-out is not permission to bypass this check.

If the Turn has ended by the time the Player taps, open the room in its **current** state, without trying to restore the Turn or adding a stale-turn message. This includes a game that has ended while its room still exists. If the room has expired or been removed, show **“This room could not be found”** with a **Return to lobby** link, rather than a dead-end or a turn-specific error. For example, a Player tapping after an opponent acts sees the live table normally; tapping after room expiry sees the missing-room message and can return to the Lobby.

Pre-display stale-Turn suppression remains as decided in [Define which online turns earn an alert](02-turn-boundaries.md); this ticket covers an alert that has **already been displayed**. Validated room URLs, account-bound routing and the browser/TWA mechanics belong to [Decide subscription storage and reliable turn delivery](06-delivery-design.md). Cross-device, account-switch, expired-room and click-through acceptance cases belong to [Agree on turn notification acceptance and handoff](07-handoff-spec.md). No new ticket is needed yet.
