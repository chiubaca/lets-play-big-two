# Native UI review and validation

## Reference and review checkpoints

The current web source and production mobile UI are the reference. The older
TWA store screenshots are not the current layout specification.

1. A reference subagent mapped home, authentication, table/lobby, profile,
   Pass & Play, results, rules and the current casino tokens/assets.
2. A foundation review corrected logo-layer coordinates, white game cards,
   font aliases, gold/lacquer buttons, card fan geometry and backdrop cropping.
3. A 390×844 screenshot comparison drove home spacing/icon/panel refinements.
   Source review corrected spectator/fixed-slot seating, private handoff,
   safe-area sizing, modal presentation, results reset, profile live preview
   and emoji-picker access.
4. Independent Standards and Spec reviews found and corrected cold-online
   Hermes compatibility, abandoned Android handshakes, missing local resume,
   host reset controls and Android room-link configuration. iOS website
   association still requires the real Apple Team ID (see README).
5. A final browser-rendered review checked 390×844 portrait and 844×390
   landscape. It found a collapsed landscape board; stretch sizing and compact
   cards/pile/controls corrected it, and the reviewer confirmed the fix.
6. Hint → Play, full-target card selection, menu/settings/rules, human-only
   mixed-seat handoffs and saved-table resume passed browser checks. Resume
   preserved the exact hand, counts and pile, and hid cards until Ready again.

The resulting home uses the same original casino background and three-layer
logo, rather than an approximation. Table UI uses the same four-seat geometry,
public card counts, white selected cards, red opponent backs, gold controls and
illustrated rules. An additional full-target card picker is provided under
table settings for accessibility when fan cards overlap.

Remaining visual differences include simpler card-back patterns/table trim,
static typography/branding, and the unported effects listed in README. These
checks do not establish pixel-perfect parity across native devices. A
five-card center pile in short landscape remains on the device QA checklist.

## Automated validation

- `vp check`: formatting, lint and configured type checks pass.
- `vp run check` in this app: strict native TypeScript passes.
- Root `vp test --run`: 514 tests pass, including 45 native tests.
- Native tests cover rules/event/hint helpers, hand privacy, bot timing and
  background cancellation, save/restore, seat rotation, deep links,
  authenticated requests, chat reconciliation and abandoned socket cleanup.
- `vp exec expo install --check`: SDK dependencies match.
- `vp exec expo export --platform all`: Android/iOS Hermes bundles and the
  browser-rendered UI export pass.
- Backend Wrangler deployment **dry run** succeeds with the Expo auth plugin.
  This does not deploy the backend or modify a remote database.

## What remains unverified

The development machine has only Xcode Command Line Tools and no Android SDK.
Browser-rendered React Native screenshots and Hermes export are not proof of
Android/iOS runtime behavior. Actual native installation, signing, simulator
and physical-device checks have **not** been performed. Neither production
native authentication nor a TWA-to-native signed upgrade has been exercised.

Before replacing the TWA, run the device/release checklist in README, including
keyboard clearance, safe areas/font scaling, VoiceOver/TalkBack, overlapping
fan hit targets, private handoff/background resume, native OAuth, authenticated
socket reconnect, and account deletion. Native push and the remaining visual
effects are explicitly listed as parity gaps rather than silently omitted.
