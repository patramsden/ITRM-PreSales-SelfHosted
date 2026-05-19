#!/usr/bin/env bash
# =============================================================================
#  ITRM PreSales — Linux uninstaller
#  Removes everything created by install.sh
#
#  Usage:
#    sudo bash uninstall.sh [--yes] [--keep-packages] [--keep-db]
#
#  Flags:
#    --yes            Skip all confirmation prompts (non-interactive)
#    --keep-packages  Don't uninstall Node.js / PostgreSQL / nginx / certbot
#    --keep-db        Keep the PostgreSQL database and user (preserve data)
#    --domain <name>  Domain to revoke TLS cert for (auto-detected if omitted)
#    --dir <path>     App directory (default: /opt/itrm-presales)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }
skipped() { echo -e "        ${YELLOW}skipped${NC}"; }

[[ $EUID -eq 0 ]] || error "Please run as root: sudo bash uninstall.sh"

# ─── Defaults ─────────────────────────────────────────────────────────────────
YES=false
KEEP_PACKAGES=false
KEEP_DB=false
APP_DIR="/opt/itrm-presales"
APP_USER="itrm"
APP_PORT=3001
PG_USER="itrm"
PG_DB="itrm_presales"
DOMAIN=""
SERVICE_NAME="itrm-presales"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)            YES=true;           shift ;;
    --keep-packages)  KEEP_PACKAGES=true; shift ;;
    --keep-db)        KEEP_DB=true;       shift ;;
    --domain)         DOMAIN="$2";        shift 2 ;;
    --dir)            APP_DIR="$2";       shift 2 ;;
    *) warn "Unknown option: $1"; shift ;;
  esac
done

# ─── Confirm helper ───────────────────────────────────────────────────────────
confirm() {
  # confirm "message" — returns 0 (yes) or 1 (no)
  if [[ "$YES" == true ]]; then return 0; fi
  local answer
  read -rp "$(echo -e "${YELLOW}?${NC}  $1 [y/N] ")" answer
  [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
}

# ─── Auto-detect domain from nginx config ────────────────────────────────────
if [[ -z "$DOMAIN" ]]; then
  NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"
  if [[ -f "$NGINX_CONF" ]]; then
    DOMAIN=$(grep -oP '(?<=server_name )[^;]+' "$NGINX_CONF" | head -1 | tr -d ' ')
  fi
fi

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${RED}╔════════════════════════════════════════╗"
echo -e "║   ITRM PreSales — Uninstaller          ║"
echo -e "╚════════════════════════════════════════╝${NC}"
echo ""
echo "  This will remove:"
echo -e "    ${RED}✗${NC}  systemd service:  ${SERVICE_NAME}"
echo -e "    ${RED}✗${NC}  app directory:    ${APP_DIR}"
echo -e "    ${RED}✗${NC}  system user:      ${APP_USER}"
echo -e "    ${RED}✗${NC}  nginx site:       /etc/nginx/sites-*/itrm-presales"
[[ -n "$DOMAIN" ]] && \
echo -e "    ${RED}✗${NC}  TLS certificate:  ${DOMAIN}"
if [[ "$KEEP_DB" == false ]]; then
echo -e "    ${RED}✗${NC}  PostgreSQL DB:    ${PG_DB} (and user ${PG_USER})"
fi
if [[ "$KEEP_PACKAGES" == false ]]; then
echo -e "    ${YELLOW}?${NC}  packages:         Node.js, PostgreSQL, nginx, certbot (asked separately)"
fi
echo ""

confirm "Proceed with uninstall?" || { echo "Aborted."; exit 0; }
echo ""

# ─── 1. Stop and disable systemd service ─────────────────────────────────────
info "Stopping systemd service..."
if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
  systemctl stop "${SERVICE_NAME}"
  success "Service stopped"
else
  skipped
fi

if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
  systemctl disable "${SERVICE_NAME}"
fi

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
if [[ -f "$SERVICE_FILE" ]]; then
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
  success "systemd unit removed"
else
  skipped
fi

# ─── 2. Remove Let's Encrypt certificate ─────────────────────────────────────
info "Removing TLS certificate..."
if [[ -n "$DOMAIN" ]] && command -v certbot &>/dev/null; then
  if certbot certificates 2>/dev/null | grep -q "$DOMAIN"; then
    certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null && \
      success "Certificate deleted for ${DOMAIN}" || \
      warn "certbot delete failed — certificate may still exist at /etc/letsencrypt/live/${DOMAIN}"
  else
    skipped
  fi
else
  skipped
fi

# Remove renewal cron job
if crontab -l 2>/dev/null | grep -q 'certbot renew'; then
  crontab -l 2>/dev/null | grep -v 'certbot renew' | crontab -
  success "Certbot renewal cron removed"
fi

# ─── 3. Remove nginx site ─────────────────────────────────────────────────────
info "Removing nginx site configuration..."
REMOVED_NGINX=false

for f in \
  "/etc/nginx/sites-enabled/${SERVICE_NAME}" \
  "/etc/nginx/sites-available/${SERVICE_NAME}"; do
  if [[ -f "$f" || -L "$f" ]]; then
    rm -f "$f"
    REMOVED_NGINX=true
  fi
done

if [[ "$REMOVED_NGINX" == true ]]; then
  # Re-enable the default site if it was disabled
  if [[ ! -f /etc/nginx/sites-enabled/default && -f /etc/nginx/sites-available/default ]]; then
    ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
    info "  Re-enabled default nginx site"
  fi
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null && success "nginx config removed and reloaded" || \
    warn "nginx reload failed — check /etc/nginx/sites-enabled/ manually"
else
  skipped
fi

# ─── 4. Remove app directory ──────────────────────────────────────────────────
info "Removing app directory ${APP_DIR}..."
if [[ -d "$APP_DIR" ]]; then
  rm -rf "$APP_DIR"
  success "Removed ${APP_DIR}"
else
  skipped
fi

# ─── 5. Remove system user ────────────────────────────────────────────────────
info "Removing system user '${APP_USER}'..."
if id "$APP_USER" &>/dev/null; then
  userdel "$APP_USER" 2>/dev/null && success "User '${APP_USER}' removed" || \
    warn "Could not remove user '${APP_USER}' — remove manually with: userdel ${APP_USER}"
else
  skipped
fi

# ─── 6. Drop PostgreSQL database and user ────────────────────────────────────
if [[ "$KEEP_DB" == false ]]; then
  info "Dropping PostgreSQL database '${PG_DB}'..."
  if sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" 2>/dev/null | grep -q 1; then
    if confirm "  Drop database '${PG_DB}'? ALL DATA WILL BE LOST."; then
      # Terminate active connections first
      sudo -u postgres psql -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${PG_DB}' AND pid <> pg_backend_pid();" \
        &>/dev/null || true
      sudo -u postgres dropdb "${PG_DB}" && success "Database '${PG_DB}' dropped"
    else
      warn "Database '${PG_DB}' kept — remove manually with: sudo -u postgres dropdb ${PG_DB}"
    fi
  else
    skipped
  fi

  info "Dropping PostgreSQL user '${PG_USER}'..."
  if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" 2>/dev/null | grep -q 1; then
    sudo -u postgres dropuser "${PG_USER}" 2>/dev/null && success "User '${PG_USER}' dropped" || \
      warn "Could not drop user '${PG_USER}' (may own other objects)"
  else
    skipped
  fi
else
  warn "Database kept (--keep-db)"
fi

# ─── 7. Optionally remove installed packages ─────────────────────────────────
if [[ "$KEEP_PACKAGES" == false ]]; then
  echo ""
  warn "The following packages were installed by install.sh."
  warn "Only remove them if nothing else on this server depends on them."
  echo ""

  PKG_MGR="apt"
  command -v dnf &>/dev/null && PKG_MGR="dnf"

  remove_pkg() {
    local name="$1"; shift
    if confirm "  Remove ${name}?"; then
      if [[ "$PKG_MGR" == "apt" ]]; then
        DEBIAN_FRONTEND=noninteractive apt-get remove -y --purge "$@" 2>/dev/null && \
          success "${name} removed" || warn "Could not remove ${name}"
      else
        dnf remove -y "$@" 2>/dev/null && success "${name} removed" || warn "Could not remove ${name}"
      fi
    else
      warn "  ${name} kept"
    fi
  }

  remove_pkg "Certbot"    certbot python3-certbot-nginx
  remove_pkg "nginx"      nginx nginx-common
  remove_pkg "PostgreSQL" postgresql-16 postgresql postgresql-client
  remove_pkg "Node.js"    nodejs

  if [[ "$PKG_MGR" == "apt" ]]; then
    apt-get autoremove -y --purge &>/dev/null || true
    apt-get clean &>/dev/null || true
  fi
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗"
echo -e "║  Uninstall complete.                 ║"
echo -e "╚══════════════════════════════════════╝${NC}"
echo ""

[[ "$KEEP_DB" == true ]] && \
  warn "Database '${PG_DB}' was kept. Remove later with:" && \
  warn "  sudo -u postgres dropdb ${PG_DB}" && \
  warn "  sudo -u postgres dropuser ${PG_USER}"
echo ""
