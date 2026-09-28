Title: Decide the WebKit stale-push policy
Status: closed
Labels: wayfinder:grilling
Parent: ../map.md
Assignee: chiubaca
Blocked by: 01-supported-delivery.md, 02-turn-boundaries.md, 03-away-presence.md, 06-delivery-design.md

## Question

WebKit says a classic Web Push event must display a user-visible notification and may revoke a subscription if it does not, but the agreed policy drops a received push when the Turn is stale, the Player is actively viewing the room, the account has changed, or verification is unavailable. Which behavior takes precedence for Safari and installed iOS PWAs: preserve fail-closed suppression and describe WebKit support as conditional pending real-device validation; relax the guarantee in a specified, privacy-safe way for WebKit; or remove those surfaces from supported delivery? Decide what must be tested and what the handoff can promise, without implementing push or pretending network races can be eliminated. Ask the human one question at a time and reconcile any changed prior decision explicitly.

## Comments

### Resolution

Preserve the existing fail-closed receipt policy on WebKit: if the Turn is no longer current, the Player is actively viewing that room, the receiving install is now signed in as a different account, or verification is unavailable, display **no** notification. Do not add a generic visible fallback, treat an unverified Turn as current, or replace the service-worker check with declarative push. This keeps [Define which online turns earn an alert](02-turn-boundaries.md), [Decide when a Player is away from the room](03-away-presence.md), and [Decide subscription storage and reliable turn delivery](06-delivery-design.md) intact, despite [WebKit's user-visible-push requirement](https://webkit.org/blog/12945/meet-web-push/#power-and-privacy) and possible subscription revocation. A short TTL and pre-send checks narrow the conflict but cannot eliminate arrival races or offline verification failures.

Safari on macOS and installed iOS/iPadOS PWAs are **separate, conditional surfaces**. Do not offer enrollment or claim working Turn notifications on either until that surface passes a physical-device, real-push validation gate (an installed Home Screen app for iOS/iPadOS). For each, cause delivered pushes to reach the service worker for all four suppression cases above and verify that none produces an alert. After the suppressed pushes, verify a fresh eligible Turn still produces an alert, the permission and subscription remain usable, and tapping it returns to the intended room. Repeat after restarting the browser/app and record the tested OS/browser versions. This must use actual endpoint delivery, not DevTools push emulation; also check the ordinary permission/enrollment path and, separately, that an already displayed notification clicked after an account change requires the original Player to sign in. A pass is evidence for that tested surface and version, **not** a guarantee of delivery, permanent subscription retention, or perfect race suppression.

If a surface revokes the subscription, displays a suppressed alert, cannot be verified end-to-end, or fails another gate, withhold enrollment there and show the device as unavailable; keep the live-room experience. Do not silently relax suppression or ship it as an experimental enrollment. Reconsidering a visible fallback would require a new human decision, not an implementation workaround. [Agree on turn notification acceptance and handoff](07-handoff-spec.md) must incorporate this per-surface gate and the best-effort limitation. No production push or device validation was performed in this planning ticket.
