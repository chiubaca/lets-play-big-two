# First-deal Turn push setup

The backend sends encrypted VAPID Web Push from the room alarm. It never sends
the private key to the browser. Without configured keys, deal actions still work
but no alerts are sent and devices cannot enroll.

1. In `apps/backend`, run `vp exec node scripts/generate-vapid-keys.mjs` in a
   private terminal. Do not check its output into git or paste the private key
   into logs. Use the same key pair for the frontend public key and backend.
2. Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a real HTTPS or `mailto:`
   `VAPID_SUBJECT` to `apps/backend/.dev.vars`. In production provision these as
   backend Worker secrets, not `wrangler.jsonc` vars.
3. Add **only** `VITE_VAPID_PUBLIC_KEY` to the frontend environment for both
   development and deployment. Rebuild the frontend after setting it. The key
   must match the backend's public key. Rotate keys deliberately: existing
   subscriptions need explicit re-enrollment after a rotation.
   An account can enroll up to eight installs; additional enrollment is rejected
   rather than silently excluding an already-enrolled install from a Turn.
4. Apply the account migrations through `0007_turn_alarm_repair_cursor.sql`
   before enabling enrollment. Deploy the backend and frontend together.

The service worker maps the two supported frontend origins to their corresponding
API origins. Other origins fail closed rather than sending a receipt check to an
untrusted URL. Real-push browser/OS validation and WebKit enrollment gates remain
separate release tasks; a provider's 2xx response does not prove OS display.
