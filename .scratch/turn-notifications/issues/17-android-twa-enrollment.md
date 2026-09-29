Title: Enable capable Android TWA Turn enrollment
Status: ready-for-agent

## What to build

Make the generated Android Trusted Web Activity capable of delegated Web Push notifications, including Android 13+ notification permission and verified app links/signing. The shared device card may report Ready only after real capability, permission, browser subscription, and server registration succeed; an incapable build must not claim Ready. Physical-device delivery verification is a follow-up, not an enrollment or web-release prerequisite.

## Acceptance criteria

- [ ] Generated wrapper configuration enables delegation and declares/requests OS notification permission as needed, surviving regeneration; inspect and record the merged manifest rather than relying only on source configuration.
- [ ] App links and upload/Play signing fingerprints support the intended verified TWA surfaces; a non-delegated, denied, or failing build does not appear Ready.
- [ ] Successful permission, subscription, and registration allow Ready without requiring a prior physical-device delivery test; Ready copy does not promise OS delivery.
- [ ] Build/configuration and available capability-state tests cover the integration; document the manual sideloaded and Play-installed follow-up without claiming it passed.

## Blocked by

- [Enroll and remove this device explicitly](11-enroll-this-device.md)
- [Notify an away Player for the first Turn after a deal](12-first-deal-turn-alert.md)
