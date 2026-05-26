# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

### Frontend (root)
```bash
npm run dev          # Vite dev server on http://localhost:5173 (proxies /api → port 7071)
npm run build        # Production build to dist/
npm run lint         # ESLint
npx tsc --noEmit     # Type-check without emitting (always run before committing)
```

### Azure Functions API (`api/`)
```bash
cd api && npm run dev        # Azure Functions local host on port 7071
cd api && npx tsc --noEmit   # Type-check the API
```

### Self-hosted Express backend (`C:\Apps\ITRM-PreSales-SelfHosted\server\`)
```bash
cd server && npm run dev     # Express on port 3001
npx tsc --noEmit --project C:\Apps\ITRM-PreSales-SelfHosted\server\tsconfig.json
```

### Syncing frontend to self-hosted repo
There are **two separate repositories** that share the same `src/` frontend:
- `C:\Apps\ITRM-PreSales` — Azure Functions + Azure SQL Server
- `C:\Apps\ITRM-PreSales-SelfHosted` — Express.js + PostgreSQL

All frontend changes must be manually copied to the self-hosted repo after editing:
```bash
cp src/some/file.tsx C:\Apps\ITRM-PreSales-SelfHosted\src\some\file.tsx
```
Always run `npx tsc --noEmit --project C:\Apps\ITRM-PreSales-SelfHosted\tsconfig.json` after syncing.

### Database seed / schema bootstrap
```
POST /api/seed   # Creates all tables if they don't exist, idempotent
```

---

## Architecture Overview

### Two-repo structure
This codebase exists in two deployable forms that share the same React frontend:

| | Azure repo | Self-hosted repo |
|---|---|---|
| API runtime | Azure Functions v4 (`app.http(...)`) | Express.js routers |
| Database | Azure SQL Server (`mssql`) | PostgreSQL (`pg`) |
| Auth tokens | JWT via `SESSION_SECRET` | Same |
| Port | 7071 | 3001 |

Backend logic is duplicated between `api/src/functions/` and `server/src/routes/`. When changing backend behaviour, both files must be updated.

### Frontend data flow
```
App.tsx
  └── BrandingProvider     — loads branding settings from API on mount
      └── AuthProvider     — manages login state (dev mock or real JWT)
          └── StoreInitializer  — fetches ALL data from API into Zustand store
              └── Layout + Routes (all pages are lazy-loaded)
```

`StoreInitializer` (`src/components/StoreInitializer.tsx`) is the single data hydration point. It fires all `GET` requests in parallel on load, populates the Zustand store, and re-fetches on tab focus or route change (throttled to 30s). In dev, if the API is unreachable, it falls back to seed data and shows a warning banner.

### State management
The entire app state lives in a single Zustand store (`src/store/index.ts`). It holds:
- `proposals`, `users`, `templates`, `catalog`, `rateCards`, `clauses`, `lookups`
- `discountMarkupFloor` — loaded from `app_settings`, defaults to 10%

`updateProposal` contains the most complex logic — it:
1. Auto-captures a financial fingerprint when TRB/5K is approved
2. Compares the current fingerprint against the stored one on every edit and auto-sets status to `'stale'` if commercial data changed
3. Auto-triggers `trbStatus = 'pending'` when a consultancy discount > 0 is applied

### Routing
All page components are **lazy-loaded** (`React.lazy`) in `src/App.tsx`. The heavy proposal tabs (Consultancy, Billing, Approvals, SoW, Totals, Discount) are also lazy-loaded inside `ProposalWorkspace`. The `xlsx` and `@azure/msal-browser` packages are loaded on-demand at point-of-use, not in the initial bundle.

### Proposal lifecycle and tabs
`ProposalWorkspace` renders the proposal editor with 9 tabs:
`Summary → Parts → Consultancy → Billing → Approvals → Discount → Statement of Work → Totals & Approval → Comments`

Every tab receives `{ proposal, editable, onUpdate }` and calls `onUpdate(partialProposal)` which flows into `store.updateProposal`.

### Financial calculations
All money calculations flow through `src/utils/totals.ts → calcTotals()`:
- Parts sell price × quantity, using the selected vendor quote's cost (or `unitCost` fallback)
- Consultancy: `days × dayRate × rateMultiplier` (PM uplift = 20% auto-added)
- If `useRateCardCost` is true, looks up actual cost rates from `rateCards`
- Markup: a configurable % applied to the parts sell total (hardware + software)
- Consultancy discount applied after PM uplift, before grand total
- `grandTotal = partsSell + markupAmount + consultancyDiscountedSell`
- `marginPct` = `(grandTotal − totalCost) / grandTotal × 100`

`CustomerProposalView` has its own local `calcTotals` that bakes markup into category totals (never exposes % to customers) and adds 20% VAT.

### Approval workflow
Defined in `src/config/approvals.ts`:
- **TRB** required when gross profit ≥ £750
- **5K Review** required when gross profit ≥ £5,000
- Both have statuses: `pending | sent | approved | rejected | waived | stale`
- `'stale'` is set automatically by `updateProposal` when financial data changes after approval (fingerprint mismatch via `src/utils/reviewFingerprint.ts`)
- Export is blocked (`src/utils/exportGuard.ts`) until all required reviews are resolved

Any consultancy discount (any value > 0) also mandates TRB, regardless of GP threshold.

### Authentication
- **Dev mode**: No `SESSION_SECRET` env var → all auth middleware is bypassed. A dropdown in the sidebar switches the active mock user.
- **Production**: `SESSION_SECRET` required. Bearer JWT tokens are issued on login and stored in `localStorage` as `auth_token`.
- **SAML SSO**: Supported via `@node-saml/node-saml`. IdP config stored in `app_settings` table.
- **TOTP MFA**: Optional per-user 2FA. Enrolment flow: `POST /api/auth/totp/setup` → `POST /api/auth/totp/enable`.
- The API also accepts a long-lived **service API key** (for automation) — stored as a bcrypt hash in `app_settings`.

### Backend structure (Azure Functions)
Each function file in `api/src/functions/` registers one or more HTTP handlers using `app.http(name, { methods, route, handler })`. All routes are prefixed with `/api/` by the host.

Auth middleware pattern:
```typescript
const authError = await requireAuth(req);   // or requireAdmin, requirePresales
if (authError) return authError;
```
In dev (no `SESSION_SECRET`), all `require*` functions return `null` (allow through).

### Repository pattern (Azure)
Database access goes through `api/src/repositories/`. Each repo file exposes typed async functions. The SQL connection pool is a module-level singleton in `api/src/shared/db.ts`. Schema is bootstrapped by `ensureSchema()` called from `POST /api/seed`.

### Encryption
Secrets stored in `app_settings` (SAML certs, SMTP passwords, API keys) are encrypted with AES-256-GCM using `ENCRYPTION_KEY` (64 hex chars). See `api/src/shared/crypto.ts`. If `ENCRYPTION_KEY` is unset, values are stored in plain text (acceptable for dev).

### CRM integration (Autotask)
`api/src/functions/crm.ts` proxies Autotask REST API calls. Key behaviours:
- Auth headers: `UserName`, `Secret`, `ApiIntegrationCode` on every request
- `atQuery(creds, entity, filter, fields?, max?)` is the generic query helper — always use `undefined` for `fields` unless you've verified the field names work (Autotask rejects unknown field names in `includeFields`)
- Account manager lookup uses `ownerResourceID` (not `accountManagerResourceID`) — resolved dynamically via entity field metadata
- Web UI ticket URLs use `ww{N}.autotask.net` (not `webservices{N}.autotask.net`)
- Queue IDs and status labels are resolved dynamically from picklists, never hardcoded

### Customer-facing views
Two public (no-auth) routes:
- `/share/:token` — read-only proposal preview (`SharedProposalView`)
- `/customer/:token` — interactive sign-off portal (`CustomerProposalView`) with approve/reject and a live VAT calculation. Markup % is never shown here.

### Branding
`BrandingContext` reads `branding.*` keys from `app_settings` and applies:
- CSS variable `--brand-primary` for the colour theme
- Dynamic favicon via `<link rel="icon">`
- Company name and subtitle in the sidebar and document title

Default branding: `MSP SalesPro` / `Sales Platform` / `#2B3990`. Logo file: `/public/msp-logo.svg`.

### Proposal layout
The PDF and customer view are driven by `ProposalLayoutConfig` (`src/types/layout.ts`), stored as JSON in `app_settings['proposal.layout']`. `parseLayout()` merges stored config with `DEFAULT_LAYOUT` so new sections added in code automatically appear without DB migrations.

### DB migrations
Both backends apply additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements on startup inside `ensureSchema()`. Never drop or rename columns — add new ones only. Both repos must be updated together when the schema changes.

---

## Key environment variables

| Variable | Required in prod | Purpose |
|---|---|---|
| `SQL_CONNECTION_STRING` | Yes | Azure SQL connection string |
| `SESSION_SECRET` | Yes | Signs JWT session tokens (min 32 chars) |
| `ENCRYPTION_KEY` | Recommended | 64 hex chars for AES-256-GCM secret encryption |
| `VITE_SAML_ENABLED` | No | Set `'true'` to show SSO login button |

If `SQL_CONNECTION_STRING` is set but `SESSION_SECRET` is not, the API will **throw at startup** to prevent running unauthenticated.
