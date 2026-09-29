Title: Make queued Turn delivery bounded and per-install
Status: ready-for-agent

## What to build

Make delivery of persisted Turn intents resilient without converting it into a reminder service. Drain with bounded alarm work, a short deadline and limited retries; periodically wake stranded persisted intents without inventing Turns from snapshots. Persist per-Turn/per-install progress, retire permanently invalid endpoints, and distinguish provider retryable failure from permanent failure. Persist device-side deduplication while allowing separate rooms and Turns to display separately. Push-service acceptance remains best-effort, not proof of device display or literal exactly-once delivery.

## Acceptance criteria

- [ ] Two enrolled installs can each receive an eligible Turn at most once where the platform permits, including duplicate worker receipt and reload; different Turns/rooms do not overwrite one another.
- [ ] Provider failure, delay, unavailable service, offline device, invalid endpoint, and alarm failure produce bounded retry/retirement without falsely failing an accepted game action or sending after the Turn/deadline ends.
- [ ] The repair path wakes persisted eligible work only; it never invents work from a room snapshot, extends the deadline, or backfills a Turn after consent/enrollment.
- [ ] Room-action/reload, provider-failure, authenticated send, and worker receipt tests observe these outcomes at integration boundaries.

## Blocked by

- [Recognize every distinct ongoing Turn, and no false Turns](13-distinct-ongoing-turns.md)
