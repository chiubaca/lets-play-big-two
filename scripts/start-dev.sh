#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CADDFILE="$PROJECT_ROOT/Caddyfile"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
ORANGE='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

check_dependencies() {
    info "Checking dependencies..."
    
    if ! command -v caddy &> /dev/null; then
        error "Caddy not installed. Run 'pnpm dev:setup' first."
    fi
    
    if ! command -v mkcert &> /dev/null; then
        error "mkcert not installed. Run 'pnpm dev:setup' first."
    fi
    
    if [[ ! -f "$CADDFILE" ]]; then
        error "Caddyfile not found. Run 'pnpm dev:setup' first."
    fi
    
    if ! grep -q "web.local.big-two.com" /etc/hosts 2>/dev/null; then
        error "Hosts file not configured. Run 'pnpm dev:setup' first."
    fi
    
    success "All dependencies installed"
}

print_banner() {
    echo -e "${CYAN}"
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     Development Environment                           ║${NC}"
    echo -e "${BOLD}║     lets-play-big-two                                 ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
    echo -e "${NC}"
    echo -e "${BOLD}  URLs:${NC}"
    echo -e "    ${BLUE}Frontend:${NC}  ${BOLD}https://web.local.big-two.com${NC}"
    echo -e "    ${ORANGE}Backend:${NC}   ${BOLD}https://api.local.big-two.com${NC}"
    echo ""
    echo -e "${YELLOW}  Press Ctrl+C to stop all services${NC}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

main() {
    check_dependencies
    print_banner
    
    cd "$PROJECT_ROOT"
    
    concurrently \
        -n "caddy,api,web" \
        -c "cyan,orange,blue" \
        --kill-others \
        --restart-tries 1 \
        "caddy run --config Caddyfile --watch" \
        "pnpm --filter backend dev" \
        "pnpm --filter frontend-web dev"
}

main "$@"