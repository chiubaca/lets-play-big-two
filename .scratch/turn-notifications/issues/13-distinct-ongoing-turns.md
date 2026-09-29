Title: Recognize every distinct ongoing Turn, and no false Turns
Status: ready-for-agent

## What to build

Extend the working first-deal alert path to every accepted play or pass that leaves an ongoing Turn. The final pass returning the lead to the same Player and a new game dealt to the same starter each have distinct persistent identities. Never derive alerts from snapshots, restoration, re-entry, or Player index alone; retire pending work when its Turn ends. There are no reminders for an unchanged Turn.

## Acceptance criteria

- [ ] Accepted deal, play, pass, final-pass lead return, and fresh deal with the same starter produce distinct persisted/reloaded Turn identities and eligible notifications.
- [ ] Rejected/no-op actions, repeated snapshots, reconnections, restored rooms, re-entry, reset, winning play, and game end do not create new notification work; ended Turns retire outstanding intents.
- [ ] A Player who was focused at Turn start receives no delayed reminder after leaving; opting in or enrolling mid-Turn does not backfill it.
- [ ] Room-action and restored-state tests cover these transitions through the notification path, not merely a Turn-identification helper.

## Blocked by

- [Notify an away Player for the first Turn after a deal](12-first-deal-turn-alert.md)
