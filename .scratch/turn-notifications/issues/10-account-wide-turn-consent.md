Title: Save account-wide Turn notification consent from Table settings
Status: ready-for-agent

## What to build

Let a signed-in seated Player save an off-by-default, account-wide Turn notification preference from online-room Table settings. Use the agreed separate switch and this-device card layout alongside sound. Consent alone does not request permission, subscribe a device, or claim delivery; Spectators and offline tables do not show the switch. This slice delivers the preference UI and authenticated persistence, not alert sending.

## Acceptance criteria

- [ ] A new account reads as off; changing the switch persists across rooms, devices, and reloads, and a failed save cannot appear successful or on.
- [ ] Only signed-in seated Players see the switch in online-room Table settings; Spectators and offline games do not.
- [ ] Opening settings or toggling consent never prompts for notification permission or enrolls a device.
- [ ] Separate, keyboard-operable controls have visible focus, textual state, and politely announced save success or failure; authenticated API tests cover unauthorized and account-deletion states.

## Blocked by

None - can start immediately.
