# Let's Play Big Two

A web-based Big Two card game.

## Prerequisites

- Node.js >= 22.12.0
- pnpm 10.33.0+
- macOS (for local domain setup)

## Local Development Domains

This project uses local domains for better DX. Access your development servers via:

- `https://local.bigtwo.com` → Frontend (proxies to localhost:5173)
- `https://local.api.bigtwo.com` → Backend (proxies to localhost:8788)

### First-Time Setup

Install dependencies and set up local domains:

```bash
# Install dependencies
vp install

# Set up local development domains (macOS only)
# Installs caddy and mkcert via Homebrew
# Requires admin access for /etc/hosts setup
pnpm dev:setup
```

### Daily Workflow

```bash
# Start all services (caddy, backend, frontend)
pnpm dev:local

# Stop all services
pnpm dev:stop
```

### Accessing Your App

After running `pnpm dev:local`:

| Service  | Local Domain                 | Original Port         |
| -------- | ---------------------------- | --------------------- |
| Frontend | https://local.bigtwo.com     | http://localhost:5173 |
| Backend  | https://local.api.bigtwo.com | http://localhost:8788 |

## Development

### Check Everything

```bash
vp run ready
```

### Run Tests

```bash
vp run test -r
```

### Build

```bash
vp run build -r
```

### Individual Services

```bash
# Frontend only
pnpm --filter frontend-web dev

# Backend only
pnpm --filter backend dev

# Website (marketing site)
pnpm --filter website dev
```

## Project Structure

```
.
├── apps/
│   ├── frontend-web/    # TanStack Start frontend
│   ├── backend/         # Cloudflare Workers backend
│   └── website/         # Marketing website
├── packages/
│   ├── game-core/       # Core game logic
│   ├── game-state-machine/  # XState game flow
│   ├── data-ops/        # Database operations
│   └── utils/           # Shared utilities
├── tools/               # Development tools
├── Caddyfile            # Reverse proxy config
└── scripts/
    ├── setup-local-dev.sh
    ├── start-dev.sh
    └── stop-dev.sh
```

## Manual Service Management

If you need manual control:

```bash
# Reverse proxy
caddy run --config Caddyfile   # Start
pkill caddy                    # Stop

# Individual dev servers
pnpm --filter backend dev       # Backend on :8788
pnpm --filter frontend-web dev  # Frontend on :5173
```
