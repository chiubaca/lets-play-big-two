# Local development

These instructions describe the supported local development setup on macOS.

## Prerequisites

- macOS
- Node.js `>=22.12.0`
- Vite+ (`vp`)
- Homebrew (used to install Caddy, mkcert, and nss)

The backend uses a local Durable Object and the remote D1 database configured
in `apps/backend/wrangler.jsonc`, so Wrangler/Cloudflare access may be needed.

## First-time setup

From the repository root:

```bash
vp install
cp apps/backend/.dev.vars.example apps/backend/.dev.vars
```

Set a real `BETTER_AUTH_SECRET` in `apps/backend/.dev.vars`. Add Google OAuth
credentials there if Google sign-in is needed. Do not commit this file.

Set `TYPESAFE_API_KEY` in `apps/backend/.dev.vars` to enable the Jev opponent in
solo games. Without it, that seat safely falls back to the deterministic bot.

Configure the local HTTPS domains and certificates:

```bash
vp run dev:setup
```

This installs the required Homebrew tools, adds `local.bigtwo.com` and
`local.api.bigtwo.com` to `/etc/hosts`, and may request `sudo` access.

## Start and stop

Make sure ports `5173`, `8788`, `80`, and `443` are available, then run:

```bash
vp run dev:local
```

This starts:

- Caddy HTTPS proxy
- Frontend Vite server on `localhost:5173`
- Backend Wrangler server on `localhost:8788`

Open the game at <https://local.bigtwo.com>. The backend is available at
<https://local.api.bigtwo.com>.

Keep the terminal running. Press `Ctrl+C` to stop the environment, or use:

```bash
vp run dev:stop
```

The stop script matches process names (`caddy`, `wrangler`, `vite`, and
`concurrently`), so it can also stop matching development processes from
other projects.

## Troubleshooting

- If Vite reports that port `5173` is busy and switches to another port, stop
  the process using `5173` and restart. Caddy is configured to proxy to
  `5173`; it does not follow Vite's fallback port.
- If Wrangler reports that `8788` is busy, stop the existing backend before
  restarting.
- If the HTTPS domains do not resolve, rerun `vp run dev:setup` and verify
  the two `/etc/hosts` entries.
- If the backend cannot access D1, authenticate Wrangler with the Cloudflare
  account that owns the configured database.
