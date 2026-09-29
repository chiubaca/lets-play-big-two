Title: Enroll and remove this device explicitly
Status: ready-for-agent

## What to build

Add explicit per-install Web Push enrollment to the online Table settings device card, backed by account-database registrations bound to the originating live session. A Player taps **Enable on this device** to request permission, subscribe, and register; only completion of all three yields Ready, which is not a delivery guarantee. Support removal without changing account consent. Turning account consent off invalidates its enrollment generation and removes all registrations so turning it back on requires fresh taps. Keep ordinary iOS browser tabs and unverified WebKit surfaces unavailable.

## Acceptance criteria

- [ ] Settings distinguish Not enabled, Ready, Blocked for denied/revoked permission, Unavailable for actual lack of capability, and retryable subscription/registration errors; ordinary iOS tabs explain Home Screen installation. No automatic reprompt occurs on load, settings open, toggle, or denied permission.
- [ ] An explicit action alone starts setup; removal affects only this install, while switching consent off removes all registrations and invalidates old enrollment even after re-on. A failed setup never shows Ready or changes another device.
- [ ] Authenticated registration endpoints reject off/deleting accounts, invalid or oversized subscriptions, unsupported provider endpoints, and silent endpoint transfer between accounts; responses and logs do not expose subscription secrets.
- [ ] Browser/room-settings and account-database tests cover permission denial/revocation, retry, removal, generation changes, session binding, accessible controls, focus, and announced asynchronous outcomes.

## Blocked by

- [Save account-wide Turn notification consent from Table settings](10-account-wide-turn-consent.md)
