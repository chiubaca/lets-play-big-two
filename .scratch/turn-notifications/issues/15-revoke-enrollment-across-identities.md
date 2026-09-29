Title: Revoke Turn enrollment safely across account changes
Status: ready-for-agent

## What to build

Complete the identity and revocation lifecycle of registered installs and queued Turn work. Signing out detaches this install from its old account; signing into another account never transfers or silently re-enrolls the origin subscription. Account deletion stops eligibility and removes registrations. Rechecks at send and receipt must honor individual removal, off/re-on generation invalidation, session expiry, and deletion, including races with queued work and already displayed alerts.

## Acceptance criteria

- [ ] Removing this install leaves other registrations and account consent intact; off/re-on makes every old registration ineligible until explicitly re-enrolled.
- [ ] Sign-out, session expiry, or account change makes old registrations ineligible at send and receipt; no subsequent sign-in inherits the prior subscription or shows the old Player's room.
- [ ] Account deletion prevents queued sends and removes registrations, including when delivery races the deletion workflow.
- [ ] Account-database/API, room-queue, and worker/tap tests cover revocation and concurrent send/receipt checks without exposing subscription secrets.

## Blocked by

- [Enroll and remove this device explicitly](11-enroll-this-device.md)
- [Notify an away Player for the first Turn after a deal](12-first-deal-turn-alert.md)
