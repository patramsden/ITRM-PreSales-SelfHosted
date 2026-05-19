#!/usr/bin/env bash
# =============================================================================
#  ITRM PreSales — Linux bare-metal installer
#  Supports: Ubuntu 22.04/24.04 LTS, Debian 12
#
#  Usage:
#    sudo bash install.sh [--domain your-domain.example.com] [--skip-ssl]
#
#  What this script does:
#    1. Installs Node.js 20, PostgreSQL 16, nginx, certbot
#    2. Creates a dedicated system user and app directory
#    3. Sets up the PostgreSQL database and user
#    4. Builds the frontend (Vite) and the API server (TypeScript)
#    5. Creates a .env file from your inputs
#    6. Installs a systemd service for auto-start
#    7. Configures nginx as a reverse proxy
#    8. Obtains a Let's Encrypt TLS certificate (unless --skip-ssl)
#    9. Runs the database seed to create tables and default data
# =============================================================================

set -euo pipefail

# ─── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ─── Must run as root ─────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Please run as root: sudo bash install.sh"

# ─── Argument parsing ─────────────────────────────────────────────────────────
DOMAIN=""
SKIP_SSL=false
SKIP_SEED=false
APP_DIR="/opt/itrm-presales"
APP_USER="itrm"
APP_PORT=3001
PG_USER="itrm"
PG_DB="itrm_presales"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)    DOMAIN="$2";     shift 2 ;;
    --skip-ssl)  SKIP_SSL=true;   shift ;;
    --skip-seed) SKIP_SEED=true;  shift ;;
    --port)      APP_PORT="$2";   shift 2 ;;
    --dir)       APP_DIR="$2";    shift 2 ;;
    *) warn "Unknown option: $1"; shift ;;
  esac
done

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔════════════════════════════════════════╗"
echo -e "║   ITRM PreSales — Linux Installer      ║"
echo -e "╚════════════════════════════════════════╝${NC}"
echo ""

# ─── Interactive prompts ──────────────────────────────────────────────────────
if [[ -z "$DOMAIN" && "$SKIP_SSL" == false ]]; then
  read -rp "$(echo -e "${CYAN}?${NC}  Enter your domain name (e.g. presales.company.com): ")" DOMAIN
fi

if [[ -z "$DOMAIN" ]]; then
  DOMAIN="localhost"
  SKIP_SSL=true
fi

PG_PASS="$(openssl rand -hex 20)"
SESSION_SECRET="$(openssl rand -hex 32)"
SEED_SECRET="$(openssl rand -hex 16)"

read -rp "$(echo -e "${CYAN}?${NC}  Default password for seed users [Presales@2026!]: ")" SEED_PASSWORD
SEED_PASSWORD="${SEED_PASSWORD:-Presales@2026!}"

echo ""
info "Installing for domain: ${DOMAIN}"
info "App directory:         ${APP_DIR}"
info "App user:              ${APP_USER}"
info "API port:              ${APP_PORT}"
info "SSL/TLS:               $( [[ $SKIP_SSL == true ]] && echo 'skipped' || echo 'Let'\''s Encrypt' )"
echo ""

# ─── Detect distro ───────────────────────────────────────────────────────────
if command -v apt-get &>/dev/null; then
  PKG_MGR="apt"
elif command -v dnf &>/dev/null; then
  PKG_MGR="dnf"
else
  error "Unsupported package manager — only apt/dnf (Ubuntu/Debian/RHEL/Rocky) are supported"
fi

# ─── Helper: install packages ─────────────────────────────────────────────────
pkg_install() {
  if [[ "$PKG_MGR" == "apt" ]]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  else
    dnf install -y "$@"
  fi
}

# ─── Step 1: System dependencies ─────────────────────────────────────────────
info "Step 1/9 — Installing system packages..."

if [[ "$PKG_MGR" == "apt" ]]; then
  apt-get update -qq
  pkg_install curl ca-certificates gnupg lsb-release openssl
else
  dnf update -y -q
  pkg_install curl ca-certificates gnupg openssl
fi

# ── Node.js 20 via NodeSource ──────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')" -lt 20 ]]; then
  info "  Installing Node.js 20 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null || \
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null
  pkg_install nodejs
fi
success "Node.js $(node --version)"

# ── PostgreSQL 16 ─────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  info "  Installing PostgreSQL 16..."
  if [[ "$PKG_MGR" == "apt" ]]; then
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
    echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
    pkg_install postgresql-16
  else
    dnf install -y postgresql16-server postgresql16
    postgresql-16-setup --initdb 2>/dev/null || true
  fi
fi
systemctl enable --now postgresql 2>/dev/null || systemctl enable --now postgresql-16 2>/dev/null || true
success "PostgreSQL $(psql --version | awk '{print $3}')"

# ── nginx ─────────────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  info "  Installing nginx..."
  pkg_install nginx
fi
systemctl enable nginx
success "nginx $(nginx -v 2>&1 | grep -oP '[0-9]+\.[0-9]+\.[0-9]+')"

# ── Certbot ───────────────────────────────────────────────────────────────
if [[ "$SKIP_SSL" == false ]] && ! command -v certbot &>/dev/null; then
  info "  Installing Certbot..."
  if [[ "$PKG_MGR" == "apt" ]]; then
    pkg_install certbot python3-certbot-nginx
  else
    dnf install -y certbot python3-certbot-nginx
  fi
  success "Certbot $(certbot --version 2>&1 | awk '{print $2}')"
fi

# ─── Step 2: App user & directories ──────────────────────────────────────────
info "Step 2/9 — Creating system user and directories..."

if ! id "$APP_USER" &>/dev/null; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# ACME challenge dir for Certbot
mkdir -p /var/www/certbot
chown www-data:www-data /var/www/certbot 2>/dev/null || true

success "System user '${APP_USER}' ready"

# ─── Step 3: Copy app files ───────────────────────────────────────────────────
info "Step 3/9 — Copying application files..."

# Script is at the repo root in the self-hosted edition
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

rsync -a --exclude='node_modules' --exclude='.git' --exclude='server/dist' --exclude='dist' \
  "$PROJECT_ROOT/" "$APP_DIR/"

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
success "Files copied to ${APP_DIR}"

# ─── Step 4: Create .env ──────────────────────────────────────────────────────
info "Step 4/9 — Writing .env configuration..."

cat > "$APP_DIR/.env" <<EOF
# ITRM PreSales — auto-generated by install.sh $(date +%Y-%m-%d)
DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}
SESSION_SECRET=${SESSION_SECRET}
SEED_SECRET=${SEED_SECRET}
SEED_DEFAULT_PASSWORD=${SEED_PASSWORD}
PORT=${APP_PORT}
APP_URL=https://${DOMAIN}
NODE_ENV=production
EOF

chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
success ".env written"

# ─── Step 5: PostgreSQL database setup ───────────────────────────────────────
info "Step 5/9 — Configuring PostgreSQL..."

# Create the user if it doesn't exist, then ALWAYS update the password so it
# stays in sync with .env — even on re-runs where the user already exists.
sudo -u postgres psql -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${PG_USER}') THEN
      CREATE USER ${PG_USER};
    END IF;
  END
  \$\$;
  ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 || \
  sudo -u postgres createdb -O "$PG_USER" "$PG_DB"

success "Database '${PG_DB}' owned by '${PG_USER}'"

# ─── Step 6: Build frontend & API ────────────────────────────────────────────
info "Step 6/9 — Building frontend and API server..."

# Build frontend (Vite) as the app user
info "  Building React frontend..."
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR'
  npm ci --prefer-offline --silent 2>&1 | tail -3
  npm run build 2>&1 | tail -5
"

# Build API server (TypeScript → JS)
info "  Building Express API server..."
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR/server'
  npm ci --prefer-offline --silent 2>&1 | tail -3
  npm run build 2>&1 | tail -5
"

success "Build complete"

# ─── Step 7: systemd service ──────────────────────────────────────────────────
info "Step 7/9 — Installing systemd service..."

# Patch WorkingDirectory in the service template
sed "s|/opt/itrm-presales|${APP_DIR}|g" \
  "$SCRIPT_DIR/itrm-presales-api.service" \
  > /etc/systemd/system/itrm-presales.service

systemctl daemon-reload
systemctl enable itrm-presales
systemctl restart itrm-presales

# Wait up to 10 s for the service to come up
for i in $(seq 1 10); do
  sleep 1
  systemctl is-active --quiet itrm-presales && break
  [[ $i -eq 10 ]] && { warn "Service did not start within 10 s — check: journalctl -u itrm-presales"; }
done
success "systemd service 'itrm-presales' enabled and started"

# ─── Step 8: nginx configuration (HTTP only — certbot upgrades to HTTPS) ─────
info "Step 8/9 — Configuring nginx..."

NGINX_CONF="/etc/nginx/sites-available/itrm-presales"

# Always start with a plain HTTP config so nginx -t passes before certbot runs.
# certbot --nginx will add the SSL server block and all TLS directives itself.
cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    ## Certbot ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    ## Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    ## API proxy → Express server
    location /api/ {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        client_max_body_size 25M;
    }

    ## Frontend static files
    root ${APP_DIR}/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location ~* \.(js|css|woff2?|ttf|svg|png|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

ln -sfn "$NGINX_CONF" /etc/nginx/sites-enabled/itrm-presales

# Disable default site if present
[[ -f /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
success "nginx configured (HTTP)"

# ─── Step 9: Let's Encrypt certificate ───────────────────────────────────────
if [[ "$SKIP_SSL" == false ]]; then
  info "Step 9/9 — Obtaining Let's Encrypt certificate for ${DOMAIN}..."
  # certbot --nginx reads the existing HTTP config, obtains a cert, and
  # automatically rewrites the config to add the HTTPS server block.
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    -d "$DOMAIN" && {
    # Add HSTS header that certbot doesn't set by default
    sed -i '/ssl_certificate/a\    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;' "$NGINX_CONF"
    nginx -t && systemctl reload nginx
    # Set up automatic renewal
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -
    success "TLS certificate obtained and auto-renewal configured"
  } || {
    warn "Certbot failed — the app is running on HTTP. Retry TLS later with:"
    warn "  sudo certbot --nginx -d ${DOMAIN}"
  }
else
  info "Step 9/9 — Skipping SSL (--skip-ssl)"
fi

# ─── Step 10: Database seed ───────────────────────────────────────────────────
if [[ "$SKIP_SEED" == false ]]; then
  info "Seeding database (creating tables + default data)..."
  SEED_URL="http://127.0.0.1:${APP_PORT}/api/seed"
  for i in $(seq 1 5); do
    HTTP_STATUS=$(curl -s -o /tmp/seed_response.json -w "%{http_code}" \
      -X POST "$SEED_URL" \
      -H "x-seed-secret: ${SEED_SECRET}" \
      -H "Content-Type: application/json")
    if [[ "$HTTP_STATUS" == "200" ]]; then
      success "Database seeded successfully"
      break
    fi
    [[ $i -lt 5 ]] && { sleep 3; info "  Retrying seed ($i/5)..."; } || warn "Seed returned HTTP ${HTTP_STATUS} — run manually: POST ${SEED_URL}"
  done
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗"
echo -e "║  Installation complete!                            ║"
echo -e "╚════════════════════════════════════════════════════╝${NC}"
echo ""
if [[ "$SKIP_SSL" == false ]]; then
  echo -e "  App URL:   ${GREEN}https://${DOMAIN}${NC}"
else
  echo -e "  App URL:   ${YELLOW}http://${DOMAIN}${NC}  (no SSL — use --domain to enable)"
fi
echo ""
echo "  Default logins:"
echo "    Email:    pat.ramsden@company.com"
echo "    Password: ${SEED_PASSWORD}"
echo ""
echo "  Configuration: ${APP_DIR}/.env"
echo "  Logs:          journalctl -u itrm-presales -f"
echo "  Restart:       systemctl restart itrm-presales"
echo ""
echo -e "${YELLOW}  IMPORTANT: Change all user passwords after first login!${NC}"
echo ""
