Title: Agree on turn notification acceptance and handoff
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: chiubaca
Blocked by: 02-turn-boundaries.md, 03-away-presence.md, 04-settings-and-permission.md, 05-alert-content-and-return.md, 06-delivery-design.md, 08-webkit-stale-push-policy.md

## Question

Which observable acceptance scenarios and validation steps make the chosen Turn notification behavior implementation-ready across web and Android, including permission states, offline or closed app, multiple devices/rooms, turn races, stale alerts, unsubscribe, and game-action regressions? Review the integrated decisions with the human one question at a time, and link a handoff spec in the resolution without building the feature.

## Comments

### Resolution

The human approved the integrated scenarios and a web-first release boundary. A real Web Push end-to-end check on Chrome **or** Edge desktop, Firefox desktop, and Chrome on Android is the minimum web release gate. Safari on macOS and installed iOS/iPadOS PWAs keep the independently decided real-device WebKit gates. Android TWA support still requires implementing delegation and OS permission, but its **physical-device verification is not a release or enrollment gate**: a capable setup may enroll and report Ready after permission, subscription and server enrollment, without implying delivery has been proven. The human will manually test Android and raise issues if it fails. An actually unsupported or failing setup remains Unavailable/Blocked/Not enabled as appropriate. This supersedes the Android unverified-build gate in [Decide the online Table settings opt-in flow](04-settings-and-permission.md) and the device-validation-before-support recommendation in [Research push support for web and the Android app](01-supported-delivery.md), not the WebKit-specific gates.

The [implementation handoff spec](../PRD.md) consolidates behavior, concrete acceptance scenarios for turns/presence/consent/identity/staleness/navigation/game-action safety, test matrix, and implementation entry points. Network delivery is best-effort; a push-service acceptance is not proof of display, and unavailable receipt verification suppresses the notification. No production push or physical-device testing was done in this planning effort.
