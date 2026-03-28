#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║     Stopping Development Environment                  ║"
echo "║     lets-play-big-two                                 ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

info "Stopping all services..."

pkill -f "caddy run" 2>/dev/null || true
pkill -f "wrangler dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "concurrently" 2>/dev/null || true

success "All services stopped"

echo ""
echo -e "${GREEN}To start again: pnpm dev:local${NC}"
echo ""