#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CADDFILE="$PROJECT_ROOT/Caddyfile"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

check_prerequisites() {
    info "Checking prerequisites..."
    
    if [[ "$(uname)" != "Darwin" ]]; then
        error "This script only supports macOS"
    fi
    
    if ! command -v brew &> /dev/null; then
        error "Homebrew is required. Install from https://brew.sh"
    fi
    
    success "Prerequisites met"
}

install_dependencies() {
    info "Checking for required tools..."
    
    local needs_install=()
    
    if ! brew list caddy &> /dev/null; then
        needs_install+=("caddy")
    fi
    
    if ! command -v mkcert &> /dev/null; then
        needs_install+=("mkcert")
    fi
    
    if ! brew list nss &> /dev/null; then
        needs_install+=("nss")
    fi
    
    if [[ ${#needs_install[@]} -gt 0 ]]; then
        info "Installing: ${needs_install[*]}"
        brew install "${needs_install[@]}"
    fi
    
    success "All dependencies installed"
}

configure_hosts() {
    info "Configuring /etc/hosts for local domains..."
    
    local hosts_entries=(
        "127.0.0.1 local.bigtwo.com"
        "127.0.0.1 local.api.bigtwo.com"
    )
    
    local needs_update=false
    for entry in "${hosts_entries[@]}"; do
        if ! grep -q "$entry" /etc/hosts 2>/dev/null; then
            needs_update=true
        fi
    done
    
    if [[ "$needs_update" == true ]]; then
        echo "Adding entries to /etc/hosts (requires sudo)..."
        for entry in "${hosts_entries[@]}"; do
            if ! grep -q "$entry" /etc/hosts 2>/dev/null; then
                echo "$entry" | sudo tee -a /etc/hosts > /dev/null
            fi
        done
        success "Hosts file configured"
    else
        info "Hosts file already configured"
    fi
}

install_mkcert_ca() {
    info "Installing mkcert CA certificate..."
    
    if mkcert -CAROOT &> /dev/null; then
        info "mkcert CA already installed"
    else
        mkcert -install
        success "CA certificate installed"
    fi
    
    info "Trusting Caddy's local CA certificate..."
    local caddy_root="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
    if [[ -f "$caddy_root" ]]; then
        if sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$caddy_root" 2>/dev/null; then
            success "Caddy certificate trusted"
        else
            warn "Could not auto-trust Caddy certificate. Run manually:"
            warn "  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '$caddy_root'"
        fi
    fi
}

create_caddyfile() {
    info "Creating Caddyfile..."
    
    if [[ -f "$CADDFILE" ]]; then
        info "Caddyfile already exists"
        return
    fi
    
    cat > "$CADDFILE" << 'EOF'
{
  local_certs
}

local.bigtwo.com {
  reverse_proxy localhost:5173
}

local.api.bigtwo.com {
  reverse_proxy localhost:8788
}
EOF
    success "Caddyfile created at $CADDFILE"
}

check_ports() {
    info "Checking for port conflicts..."
    
    local ports=(5173 8788 443 80)
    local conflicts=()
    
    for port in "${ports[@]}"; do
        if lsof -i ":$port" &> /dev/null; then
            conflicts+=("$port")
        fi
    done
    
    if [[ ${#conflicts[@]} -gt 0 ]]; then
        warn "Ports ${conflicts[*]} are in use. Stop conflicting services before running 'pnpm dev:local'"
    else
        success "No port conflicts detected"
    fi
}

verify_setup() {
    info "Verifying hosts file..."
    
    if grep -q "local.bigtwo.com" /etc/hosts && grep -q "local.api.bigtwo.com" /etc/hosts; then
        success "Hosts file configured correctly"
    else
        error "Hosts file not configured. Run setup again."
    fi
}

print_summary() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Setup Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Local development domains configured:"
    echo -e "  ${BLUE}local.bigtwo.com${NC} → https://local.bigtwo.com (proxies to :5173)"
    echo -e "  ${BLUE}local.api.bigtwo.com${NC} → https://local.api.bigtwo.com (proxies to :8788)"
    echo ""
    echo "What was configured:"
    echo "  ✓ Caddy (reverse proxy with HTTPS)"
    echo "  ✓ mkcert (local CA for SSL certificates)"
    echo "  ✓ /etc/hosts (local.bigtwo.com, local.api.bigtwo.com)"
    echo ""
    echo "Next steps:"
    echo -e "  ${YELLOW}pnpm dev:local${NC}  Start all development servers"
    echo -e "  ${YELLOW}pnpm dev:stop${NC}   Stop all services"
    echo ""
}

main() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║     Local Development Domain Setup                    ║"
    echo "║     lets-play-big-two                                 ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    check_prerequisites
    install_dependencies
    configure_hosts
    install_mkcert_ca
    create_caddyfile
    check_ports
    verify_setup
    print_summary
}

main "$@"