# Web Push enrollment configuration

Set `VITE_VAPID_PUBLIC_KEY` for the frontend build to the URL-safe, unpadded
public key of the VAPID key pair used by the future push sender. For local
development, put it in an untracked `apps/frontend-web/.env.local`. For a
deployment, supply it to the frontend build environment. Never put the private
key in a `VITE_` variable or source control.

Without a configured public key, the device card says Unavailable; account-wide
consent remains usable. A registered device is marked Ready only after the
browser grants permission, subscribes with this key, and the account API
confirms registration. This is not a delivery test: push sending, receipt
suppression, and device-specific release checks are separate work.
