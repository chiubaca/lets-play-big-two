Title: Decide subscription storage and reliable turn delivery
Status: closed
Labels: wayfinder:research
Parent: ../map.md
Assignee: chiubaca
Blocked by: 01-supported-delivery.md, 02-turn-boundaries.md, 03-away-presence.md, 04-settings-and-permission.md

## Question

Given the platform, turn, presence, and preference decisions, where should account preferences and device subscriptions live, how should the authoritative online turn transition trigger fan-out, and how should delivery cope with retries, duplicate sends, expired subscriptions, sign-out, account deletion, and stale game state? Study the existing backend and relevant primary platform documentation, compare plausible designs, and link a concise markdown design/research asset. Preserve game-action success if push delivery fails; do not implement.

## Comments

### Resolution

Recommend storing account-wide consent and session-bound, per-device Web Push registrations in D1, separate from room game state. A successful deal/play/pass in the room Durable Object creates a stable room-scoped turn identity and, only if the Player is away at that transition, persists an outbox intent atomically with the updated game state. A room alarm drains bounded work and retries independently of the game action; a periodic repair sweep can wake persisted intents if alarm scheduling fails. Fresh room-scoped visible-and-focused presence leases, current turn/seat, account consent, device enrollment generation, live session, room availability and account-deletion state are checked before send. Consent and enrollment must predate the turn; enabling mid-turn never backfills an alert.

Use bounded retries and short push TTLs, retire invalid subscriptions, and distinguish push-service acceptance from on-device display. Per-turn/per-device outbox keys plus persistent service-worker deduplication make duplicates unlikely, but network delivery cannot promise literal exactly-once; receipt checks must fail closed when the turn or recipient cannot be verified. Turning off consent removes all registrations; sign-out detaches this device's registration and a session binding prevents delayed cleanup from making it eligible; account deletion blocks sends and clears registrations. Re-enrollment is explicit. The encrypted payload carries only validated identifiers; generic visible copy and original-Player-only click routing are preserved. Push failures must never report a committed game action as failed.

One conflict is **not** resolved by this recommendation: WebKit requires a visible notification for each delivered classic push and may revoke subscriptions for intentionally suppressed events, while our stale/presence policy requires suppression after receipt. [Decide the WebKit stale-push policy](08-webkit-stale-push-policy.md) now holds that human decision before the handoff. Android TWA notification delegation and permission remain device-validation requirements, not claimed production support.

Design, alternatives, evidence and limitations: [Turn delivery design research](../research/delivery-design.md). No push was implemented or device-tested.
