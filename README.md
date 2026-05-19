# ITRM PreSales — Self-Hosted Linux Edition

A fully self-contained deployment of the ITRM PreSales app for Linux servers, using **PostgreSQL** as the database and **Express.js** as the API server instead of Azure Functions + Azure SQL.

## Architecture

```
Browser → nginx (80/443) ─┬─ /api/*  → Express.js (port 3001) → PostgreSQL
                           └─ /*      → React SPA (static files)
```

| Component | Technology |
|-----------|-----------|
| Frontend  | React 18 + Vite (same source as Azure version) |
| API       | Express.js (ported from Azure Functions) |
| Database  | PostgreSQL 16 |
| Web server | nginx (reverse proxy + static files) |
| TLS       | Let's Encrypt via Certbot |
| Process   | systemd service |

## Supported OS

- Ubuntu 22.04 LTS (Jammy)
- Ubuntu 24.04 LTS (Noble)
- Debian 12 (Bookworm)

## Quick install

```bash
# Clone the repo
git clone https://github.com/patramsden/ITRM-PreSales.git
cd ITRM-PreSales/self-hosted

# Install everything (interactive — will prompt for your domain)
sudo bash install.sh

# Or non-interactive:
sudo bash install.sh --domain presales.yourcompany.com
```

The installer will:
1. Install Node.js 20, PostgreSQL 16, nginx, Certbot
2. Create a dedicated `itrm` system user
3. Copy files to `/opt/itrm-presales`
4. Build the React frontend and TypeScript API
5. Create a PostgreSQL database and user
6. Write a `.env` configuration file
7. Install a systemd service for auto-restart
8. Configure nginx as a reverse proxy
9. Obtain a Let's Encrypt TLS certificate
10. Seed the database with default users and reference data

## Options

| Flag | Description |
|------|-------------|
| `--domain example.com` | Domain name for nginx and TLS cert |
| `--skip-ssl` | Skip Let's Encrypt (plain HTTP — useful for internal/dev) |
| `--skip-seed` | Don't run the database seed (useful for upgrades) |
| `--port 3001` | API port (default: 3001) |
| `--dir /opt/itrm-presales` | Installation directory |

## After installation

1. **Open** `https://your-domain.com` in your browser
2. **Log in** with `pat.ramsden@company.com` / the password you set during install
3. **Change all default passwords** immediately (User Management → Edit)
4. Remove or clear `SEED_SECRET` from `/opt/itrm-presales/.env`

## Configuration

All configuration lives in `/opt/itrm-presales/.env`:

```env
DATABASE_URL=postgresql://itrm:PASSWORD@localhost:5432/itrm_presales
SESSION_SECRET=<64-char hex string>
SEED_SECRET=<used once for seeding>
PORT=3001
APP_URL=https://your-domain.com
```

After editing `.env`, restart the service:

```bash
sudo systemctl restart itrm-presales
```

## Managing the service

```bash
# Status
sudo systemctl status itrm-presales

# View logs (live)
sudo journalctl -u itrm-presales -f

# Restart
sudo systemctl restart itrm-presales

# Stop
sudo systemctl stop itrm-presales
```

## Updating

```bash
cd ITRM-PreSales
git pull origin main
cd self-hosted
sudo bash install.sh --domain your-domain.com --skip-seed
```

The `--skip-seed` flag skips reseeding so existing data is preserved. The schema runs `CREATE TABLE IF NOT EXISTS` so new tables are added automatically.

## Let's Encrypt renewal

Renewal is configured automatically via cron during install:

```
0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'
```

To test renewal manually:
```bash
sudo certbot renew --dry-run
```

## Database management

```bash
# Connect to the database
sudo -u postgres psql itrm_presales

# Back up
pg_dump -U itrm itrm_presales > backup_$(date +%Y%m%d).sql

# Restore
psql -U itrm itrm_presales < backup_20260101.sql
```

## Differences from Azure version

| Feature | Azure version | Self-hosted version |
|---------|--------------|---------------------|
| API runtime | Azure Functions v4 | Express.js |
| Database | Azure SQL Server (mssql) | PostgreSQL 16 (pg) |
| Hosting | Azure Static Web Apps | nginx + systemd |
| TLS | Azure-managed | Let's Encrypt |
| Auth bypass in dev | `SESSION_SECRET` unset | Same |
| SAML/SSO | ✅ | ✅ |
| TOTP | ✅ | ✅ |
| All API endpoints | ✅ | ✅ (identical) |

## Troubleshooting

**Service won't start:**
```bash
journalctl -u itrm-presales -n 50 --no-pager
```

**Can't connect to database:**
```bash
# Test manually
psql "$(grep DATABASE_URL /opt/itrm-presales/.env | cut -d= -f2-)"
```

**nginx config error:**
```bash
sudo nginx -t
```

**Re-run seed after install:**
```bash
source /opt/itrm-presales/.env
curl -X POST http://localhost:3001/api/seed \
  -H "x-seed-secret: $SEED_SECRET" \
  -H "Content-Type: application/json"
```
