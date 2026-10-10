# Local development

These instructions describe the supported local development setup on macOS.

## Prerequisites

- macOS
- Node.js 22.13+ (22.x), 24.3+ (24.x), or 25+
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

The Jev opponent uses the backend's remote Cloudflare Workers AI binding. Local inference
requires Wrangler to be authenticated with Cloudflare and incurs Workers AI usage charges. If
Jev is unavailable, that seat safely falls back to the deterministic bot.

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

## Native development

Native development uses a named Cloudflare Tunnel instead of Caddy/local hosts
entries, giving physical devices and emulators a stable, trusted HTTPS API URL:
<https://dev-big-two-api.chiubaca.com>.

```sh
vp run dev:native:setup # one-time Cloudflare login, tunnel creation, DNS setup
vp run dev:native       # tunnel + local Wrangler backend + Metro
vp run dev:native:android # same services, automatically start/wait for Android
```

The Android launcher reuses a connected device/emulator or boots the first virtual
device from Android Studio's Device Manager. Create a virtual device there once;
set `NATIVE_DEV_AVD` to choose one when several exist. It finds the SDK using
`ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `~/Library/Android/sdk`. In another terminal,
run `vp run native:android` for the first install or after native changes; otherwise
press `a` in Metro. The emulator stays open when the services stop.

Configure backend secrets in `apps/backend/.dev.vars` first, and add
`https://dev-big-two-api.chiubaca.com/api/auth/callback/google` to your Google OAuth
web client's authorized redirect URIs. The launcher applies native-only URL
overrides without changing web environment files. Stop `dev:local` before starting
native development because both use port `8788`. `Ctrl+C` stops the native service
group, including the tunnel; it is not installed as an always-on system service.

If backend port `8788` or Metro port `8081` is busy, the launcher shows the listener
PIDs and asks before stopping them (default: no). To stop listeners automatically:

```sh
vp run dev:native:android -- --kill-ports
# Also supported: vp run dev:native -- --kill-ports
```

This stops only listeners on those two ports, including services from other projects.
It sends `SIGTERM`, waits up to five seconds, then uses `SIGKILL` if needed. Without
an interactive terminal, busy ports require `--kill-ports` or manual cleanup.

The local API is public while the tunnel runs and still uses the configured remote
D1/AI bindings. See [the native README](../apps/frontend-native/README.md#local-authentication-and-online-play)
for credentials, platform builds, security notes, and troubleshooting.

For isolated native game-room UI iteration (no API/tunnel/sign-in), run
`vp run storybook:native:web` for the browser or `vp run storybook:native` for a
development client. Storybook uses port `8082`; see the
[native Storybook guide](../apps/frontend-native/README.md#game-room-storybook)
for scenarios, controls, and the one-time native rebuild.

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
- If Wrangler fails to start with `Failed to start the remote proxy session` or
  `Authentication error [code: 10000]`, run `vp exec wrangler whoami` from
  `apps/backend`. If it reports `Invalid access token [code: 9109]`, run
  `vp exec wrangler login` there and complete the browser sign-in, then rerun
  `vp exec wrangler whoami` before restarting `vp run dev:local`. The remote D1
  and Workers AI bindings require a valid Cloudflare login even though the
  Worker and Durable Object run locally.
