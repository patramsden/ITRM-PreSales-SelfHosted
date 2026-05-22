#!/usr/bin/env bash
# =============================================================================
#  ITRM PreSales — update script
#  Pulls latest code, rebuilds frontend + API, restarts the service.
#
#  Usage:
#    sudo bash update.sh
#
#  Safe to run at any time — does not touch the database or .env
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || error "Please run as root: sudo bash update.sh"

APP_DIR="/opt/itrm-presales"
APP_USER="itrm"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════╗"
echo -e "║   ITRM PreSales — Update               ║"
echo -e "╚════════════════════════════════════════╝${NC}"
echo ""

# ─── Step 1: Pull latest code ─────────────────────────────────────────────────
info "Step 1/4 — Pulling latest code..."
git -C "$SCRIPT_DIR" pull --ff-only 2>&1 || {
  warn "git pull failed — you may have local changes. Continuing with current code."
}
success "Repository up to date"

# ─── Step 2: Sync source to installed location ────────────────────────────────
info "Step 2/4 — Syncing files to ${APP_DIR}..."
rsync -a \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='server/dist' \
  --exclude='.env' \
  "$SCRIPT_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
success "Files synced"

# ─── Step 3: Rebuild ──────────────────────────────────────────────────────────
info "Step 3/4 — Rebuilding..."

info "  Building frontend..."
APP_VERSION=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
info "  Version: ${APP_VERSION} built at ${BUILD_TIME}"
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR'
  npm ci --silent 2>&1 | tail -3
  APP_VERSION='$APP_VERSION' BUILD_TIME='$BUILD_TIME' npm run build 2>&1 | tail -5
"

info "  Building API server..."
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR/server'
  npm ci --silent 2>&1 | tail -3
  npm run build 2>&1 | tail -5
"
success "Build complete"

# ─── Step 4: Restart service ──────────────────────────────────────────────────
info "Step 4/4 — Restarting service..."
# Persist version so the running service can report it
echo "APP_VERSION=$APP_VERSION" > "$APP_DIR/.version"
echo "BUILD_TIME=$BUILD_TIME"  >> "$APP_DIR/.version"
systemctl restart itrm-presales

for i in $(seq 1 10); do
  sleep 1
  systemctl is-active --quiet itrm-presales && break
  [[ $i -eq 10 ]] && error "Service failed to restart — check: journalctl -u itrm-presales -n 30"
done
success "Service restarted"

echo ""
echo -e "${GREEN}Update complete!${NC}"
systemctl status itrm-presales --no-pager | grep -E "Active:|Main PID:"
echo ""
