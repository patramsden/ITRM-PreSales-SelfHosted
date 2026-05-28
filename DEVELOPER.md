# ITRM PreSales — Developer Guide

A comprehensive reference for developers working on, maintaining, or extending the ITRM PreSales application.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Two-Repo Architecture](#2-two-repo-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Local Development Setup](#4-local-development-setup)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Database Schema & Migrations](#7-database-schema--migrations)
8. [Authentication System](#8-authentication-system)
9. [Proposal Lifecycle](#9-proposal-lifecycle)
10. [Financial Calculations](#10-financial-calculations)
11. [Approval Workflows](#11-approval-workflows)
12. [CRM Integration (Autotask)](#12-crm-integration-autotask)
13. [Rich Text Editor](#13-rich-text-editor)
14. [PDF Generation](#14-pdf-generation)
15. [MCP Server (Self-hosted)](#15-mcp-server-self-hosted)
16. [Branding & Theming](#16-branding--theming)
17. [Customer-Facing Views](#17-customer-facing-views)
18. [SCIM Provisioning](#18-scim-provisioning)
19. [How to Add New Features](#19-how-to-add-new-features)
20. [Two-Repo Sync Process](#20-two-repo-sync-process)
21. [Deployment](#21-deployment)
22. [Environment Variables Reference](#22-environment-variables-reference)
23. [Troubleshooting](#23-troubleshooting)

---

## 1. Project Overview

ITRM PreSales is a web application for managing sales proposals, statements of work, and managed-service contracts. It is used by pre-sales engineers, account managers, and sales administrators to:

- Build itemised proposals (hardware, software, recurring parts, professional services)
- Manage approval workflows (Technical Review Board, 5K Commercial Review)
- Generate and send customer-facing PDF and interactive sign-off portals
- Track proposals through their commercial lifecycle (New → Won/Lost)
- Author managed-service support contracts with billing schedules and SLA tiers

The application runs entirely in the browser (React SPA) backed by a REST API. There are two deployment targets: **Azure** (Azure Functions + Azure SQL Server) and **Self-hosted** (Express.js + PostgreSQL). Both use the same React frontend.

---

## 2. Two-Repo Architecture

The codebase is split across two Git repositories that share the same `src/` frontend:

| | Azure Repo | Self-hosted Repo |
|---|---|---|
| **Path** | `C:\Apps\ITRM-PreSales` | `C:\Apps\ITRM-PreSales-SelfHosted` |
| **API runtime** | Azure Functions v4 | Express.js |
| **Database** | Azure SQL Server (`mssql`) | PostgreSQL (`pg`) |
| **API port (local)** | 7071 | 3001 |
| **Functions dir** | `api/src/functions/` | `server/src/routes/` |
| **Repositories dir** | `api/src/repositories/` | `server/src/repositories/` |
| **Shared types** | `api/src/types/index.ts` | `server/src/types/index.ts` |
| **DB bootstrap** | `api/src/shared/db.ts → ensureSchema()` | `server/src/shared/db.ts → ensureSchema()` |
| **MCP server** | Not present | `server/src/mcp.ts` |

### Frontend is shared
The entire `src/` directory is **identical** in both repos. When you change any frontend file in the Azure repo, you must manually copy it to the self-hosted repo (see [Two-Repo Sync Process](#20-two-repo-sync-process)).

### Backend logic is duplicated
Every API endpoint exists in both `api/src/functions/<name>.ts` (Azure) and `server/src/routes/<name>.ts` (self-hosted). The business logic is the same; the wiring code differs:

```typescript
// Azure Functions
app.http('listProposals', {
  methods: ['GET'],
  route: 'proposals',
  handler: async (req, ctx) => { ... }
});

// Express
router.get('/', async (req, res) => { ... });
```

---

## 3. Tech Stack

### Frontend (both repos share this)
| Layer | Technology |
|---|---|
| Framework | React 18 with TypeScript |
| Build tool | Vite |
| Routing | React Router v6 |
| State management | Zustand |
| Styling | Tailwind CSS v3 (dark mode: `class` strategy) |
| Rich text editing | TipTap v2 (ProseMirror-based) |
| PDF generation (project) | `jsPDF` + `html2canvas` (via ProposalPdf.tsx) |
| PDF generation (support) | `@react-pdf/renderer` (vector PDF via SupportPdf.tsx) |
| Charts/exports | `xlsx` (lazy-loaded) |
| HTTP client | Native `fetch` wrapped in `src/lib/api.ts` |
| Typography plugin | `@tailwindcss/typography` (prose classes) |

### Azure backend
| Layer | Technology |
|---|---|
| Runtime | Azure Functions v4 (Node.js) |
| Database | Azure SQL Server via `mssql` |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| SAML | `@node-saml/node-saml` |
| Crypto | Node.js built-in `crypto` (AES-256-GCM) |

### Self-hosted backend
| Layer | Technology |
|---|---|
| Runtime | Express.js (Node.js) |
| Database | PostgreSQL via `pg` |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| SAML | `@node-saml/node-saml` |
| MCP | `@modelcontextprotocol/sdk` |

---

## 4. Local Development Setup

### Prerequisites
- Node.js 22 LTS
- For Azure: Azure Functions Core Tools v4 (`npm install -g azure-functions-core-tools@4`)
- For self-hosted: PostgreSQL running locally (or Docker)
- For Azure: Azure SQL Server instance or local SQL Server

### Azure repo setup

```bash
# 1. Install frontend dependencies
cd C:\Apps\ITRM-PreSales
npm install

# 2. Install API dependencies
cd api
npm install

# 3. Configure local API settings
# Copy the example file and fill in your connection strings
cp api/local.settings.json.example api/local.settings.json
# Edit api/local.settings.json — set SQL_CONNECTION_STRING

# 4. Bootstrap the database schema (run once, idempotent)
# Start the API first, then POST to seed endpoint:
cd api && npm run dev
# In another terminal:
curl -X POST http://localhost:7071/api/seed

# 5. Start the frontend dev server
cd C:\Apps\ITRM-PreSales
npm run dev
# → http://localhost:5173 (proxies /api → port 7071)
```

### Self-hosted setup

```bash
# 1. Install server dependencies
cd C:\Apps\ITRM-PreSales-SelfHosted\server
npm install

# 2. Configure environment
# Create server/.env:
DATABASE_URL=postgresql://user:password@localhost:5432/itrm_presales
SESSION_SECRET=your-secret-here-at-least-32-characters

# 3. Start the server
npm run dev
# → http://localhost:3001

# 4. Bootstrap the database schema
curl -X POST http://localhost:3001/api/seed

# 5. Start the frontend (from repo root)
cd C:\Apps\ITRM-PreSales-SelfHosted
npm install
npm run dev
# → http://localhost:5173 (proxies /api → port 3001)
```

### Dev mode (no auth)
When `SESSION_SECRET` is **not set**, all authentication middleware is bypassed. The sidebar shows a user-switcher dropdown letting you impersonate any mock user. This is the default for local development — you do not need a database for basic UI work if the API falls back to seed data.

> ⚠️ **Security**: If `SQL_CONNECTION_STRING` (or `DATABASE_URL`) is set but `SESSION_SECRET` is not, the API will **throw at startup** and refuse to run. This prevents accidentally running with a live database but no authentication.

### Useful commands

```bash
# Type-check without building
npx tsc --noEmit                                              # Frontend
cd api && npx tsc --noEmit                                   # Azure API
npx tsc --noEmit --project C:\Apps\ITRM-PreSales-SelfHosted\server\tsconfig.json  # Self-hosted

# Lint
npm run lint

# Build for production
npm run build
```

---

## 5. Frontend Architecture

### App boot sequence

```
main.tsx
  └── App.tsx
        └── BrandingProvider        (loads branding from /api/settings on mount)
              └── AuthProvider      (checks localStorage for auth_token, validates session)
                    └── StoreInitializer  (hydrates all data into Zustand store)
                          └── Layout + React Router routes (all pages lazy-loaded)
```

### StoreInitializer (`src/components/StoreInitializer.tsx`)

This is the **single data hydration point**. On mount it fires all GET requests in parallel:

```typescript
Promise.all([
  fetchProposals(), fetchUsers(), fetchTemplates(),
  fetchCatalog(), fetchRateCards(), fetchClauses(), fetchLookups(),
  fetchSettings() // for discountMarkupFloor
])
```

It re-fetches on:
- Tab/window focus (throttled to once per 30 seconds)
- Route changes (same throttle)

In dev, if the API is unreachable it falls back to built-in seed data and shows a yellow warning banner.

### State management (`src/store/index.ts`)

The entire application state lives in a single **Zustand** store. Key slices:

| Key | Type | Description |
|---|---|---|
| `proposals` | `Proposal[]` | All proposals the user can access |
| `users` | `User[]` | All users (for assignment, display) |
| `templates` | `Template[]` | Proposal templates |
| `catalog` | `CatalogItem[]` | Product/service catalogue |
| `rateCards` | `RateCard[]` | Consultancy rate cards |
| `clauses` | `Clause[]` | Reusable contract clauses |
| `lookups` | `AppLookups` | Catalogue categories, departments |
| `discountMarkupFloor` | `number` | Minimum markup % before discount approval required |

#### `updateProposal` — the complex one

The store's `updateProposal(id, patch)` function does more than a simple merge. It:

1. **Merges the patch** into the existing proposal
2. **Captures financial fingerprint** when `trbStatus` or `fiveKStatus` changes to `'approved'`/`'complete'` — stores the fingerprint on the proposal
3. **Detects stale reviews** — on every save, compares the current financial data against stored fingerprints; if they differ, sets the relevant status to `'stale'`
4. **Auto-triggers TRB** — if a consultancy discount > 0 is applied and TRB is not already in an active state, sets `trbStatus = 'pending'`
5. **Persists to API** — calls `PUT /api/proposals/:id` with the full updated proposal

### Routing (`src/App.tsx`)

All page components use `React.lazy` for code splitting:

```typescript
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Proposals     = lazy(() => import('./pages/Proposals'));
const ProposalWorkspace = lazy(() => import('./pages/ProposalWorkspace'));
// ...
```

Public (no-auth) routes:
- `/share/:token` — SharedProposalView (read-only)
- `/customer/:token` — CustomerProposalView (sign-off portal)

### Proposal workspace tabs

`ProposalWorkspace` renders different tab sets depending on proposal type:

**Project proposals** (9 tabs):
```
Summary | Parts | Consultancy | Billing | Approvals | Discount | Statement of Work | Totals & Approval | Comments
```

**Support proposals** (7 tabs):
```
Summary | Support Contract | Totals | Document | Billing | Approvals | Comments
```

Each tab component receives `{ proposal, editable, onUpdate }` and calls `onUpdate(partial)` to persist changes.

### Permissions (`src/utils/permissions.ts`)

The frontend checks user roles for UI decisions (showing/hiding buttons etc.). Backend always re-validates. Role hierarchy:

```
admin > sales_admin > presales > sales
```

| Action | Required role |
|---|---|
| View proposals | Any authenticated |
| Create/edit proposals | `presales` or above |
| Approve discounts | `sales_admin` or `admin` |
| Manage users, settings | `admin` only |
| Edit catalogue/rate cards | `sales_admin` or `admin` |

---

## 6. Backend Architecture

### Azure Functions (`api/src/functions/`)

Each file registers handlers with `@azure/functions`:

```typescript
import { app } from '@azure/functions';

app.http('listProposals', {
  methods: ['GET'],
  route: 'proposals',
  authLevel: 'anonymous', // auth is handled by requireAuth() middleware
  handler: async (req, ctx) => {
    const authError = await requireAuth(req);
    if (authError) return authError;
    // ... handler logic
    return { jsonBody: data };
  }
});
```

**Function files and their routes:**

| File | Routes |
|---|---|
| `proposals.ts` | `/api/proposals`, `/api/proposals/:id`, `/api/proposals/:id/status` |
| `auth.ts` | `/api/auth/login`, `/api/auth/logout`, `/api/auth/saml/*`, `/api/auth/totp/*`, `/api/auth/change-password` |
| `users.ts` | `/api/users`, `/api/users/:id` |
| `catalog.ts` | `/api/catalog`, `/api/catalog/:id` |
| `catalogImport.ts` | `/api/catalog/import` |
| `templates.ts` | `/api/templates`, `/api/templates/:id` |
| `rate-cards.ts` | `/api/rate-cards`, `/api/rate-cards/:id` |
| `settings.ts` | `/api/settings` |
| `clauses.ts` | `/api/clauses`, `/api/clauses/:id` |
| `comments.ts` | `/api/proposals/:id/comments` |
| `versions.ts` | `/api/proposals/:id/versions` |
| `shares.ts` | `/api/proposals/:id/share` |
| `customerLinks.ts` | `/api/proposals/:id/customer-link` |
| `sow.ts` | `/api/sow/generate` |
| `crm.ts` | `/api/crm/*` |
| `report.ts` | `/api/report/proposals` |
| `backup.ts` | `/api/backup` |
| `scim.ts` | `/api/scim/*` |
| `lookups.ts` | `/api/lookups` |
| `me.ts` | `/api/me` |
| `seed.ts` | `/api/seed` |

### Repository pattern

All database access goes through `api/src/repositories/`. Each file exposes async typed functions. Example pattern:

```typescript
// proposalRepo.ts
export async function getProposal(id: string): Promise<Proposal | null> {
  const pool = getPool();
  const result = await pool.request()
    .input('id', sql.NVarChar, id)
    .query('SELECT * FROM proposals WHERE id = @id');
  if (!result.recordset[0]) return null;
  return toProposal(result.recordset[0]); // maps DB row → Proposal type
}
```

The `toProposal()` mapper is the single place where DB column names (snake_case) are converted to TypeScript property names (camelCase). All JSON columns (parts, phases, milestones etc.) are stored as serialised strings and parsed here.

### Auth middleware pattern

```typescript
// requireAuth — any authenticated user
const authError = await requireAuth(req);
if (authError) return authError;

// requireAdmin — only admin role
const authError = await requireAdmin(req);
if (authError) return authError;

// requirePresales — admin, sales_admin, presales
const authError = await requirePresales(req);
if (authError) return authError;

// requireCatalogEdit — admin, sales_admin
const authError = await requireCatalogEdit(req);
if (authError) return authError;
```

All middleware returns `null` when `SESSION_SECRET` is unset (dev bypass).

---

## 7. Database Schema & Migrations

### Core tables

| Table | Purpose |
|---|---|
| `users` | User accounts (local + SAML) |
| `proposals` | Proposal headers |
| `parts` | Line items for a proposal |
| `vendor_quotes` | Vendor quotes per part |
| `phases` | Consultancy phases |
| `tasks` | Consultancy tasks within phases |
| `templates` | Proposal templates |
| `template_parts` / `template_phases` / `template_tasks` | Template contents |
| `catalog_items` | Product/service catalogue |
| `rate_cards` | Consultancy day rates |
| `app_settings` | Key-value store for all configuration |
| `sessions` | Active user sessions |
| `auth_codes` | Short-lived SAML exchange codes |
| `totp_challenges` | Pending TOTP verifications |
| `mfa_enrollment_tokens` | MFA setup tokens |
| `password_reset_tokens` | Password reset flow tokens |
| `proposal_versions` | Snapshot history per proposal |
| `proposal_shares` | Internal read-only share tokens |
| `customer_links` | Customer sign-off portal tokens |
| `proposal_comments` | Comments thread per proposal |
| `clauses` | Reusable contract clause library |
| `lookups` | Dynamic lookup lists |

### JSON columns in proposals

The following proposal fields are stored as serialised JSON strings in the `proposals` table (not in child tables):

| Column | Type | Contents |
|---|---|---|
| `collaborator_ids` | TEXT/NVARCHAR | `string[]` of user IDs |
| `milestones` | TEXT/NVARCHAR | `BillingMilestone[]` |
| `support_contract` | TEXT/NVARCHAR | Full `SupportContract` object |
| `five_k_attendees` | TEXT/NVARCHAR | `string[]` of attendee names |

Parts, phases, and tasks each have their own normalised tables with `proposal_id` foreign keys.

### Migration pattern

**Never drop or rename columns.** Schema changes are always additive. Both backends apply migrations inside `ensureSchema()` which is called when `POST /api/seed` is hit.

**Azure SQL Server** (`api/src/shared/db.ts`):
```sql
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('proposals') AND name = 'new_column'
)
ALTER TABLE proposals ADD new_column NVARCHAR(255) NULL
```

**PostgreSQL** (`server/src/shared/db.ts`):
```sql
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS new_column VARCHAR(255)
```

When you add a new column you must:
1. Add the migration in **both** `db.ts` files
2. Add the field to **both** `types/index.ts` files
3. Update the `toProposal()` mapper in **both** `proposalRepo.ts` files
4. Add the column to the INSERT and UPDATE queries in **both** `proposalRepo.ts` files

> ⚠️ PostgreSQL uses positional parameters (`$1`, `$2`, ...) while SQL Server uses named parameters (`@paramName`). When inserting a new parameter in the middle of a PostgreSQL INSERT, you must renumber all subsequent `$N` references.

---

## 8. Authentication System

### Authentication methods

The system supports four authentication methods:

#### 1. Local login (username + password)
- Passwords stored as bcrypt hashes in `users.password_hash`
- `POST /api/auth/login` → validates credentials → issues JWT
- JWT stored in `localStorage` as `auth_token`
- Session TTL: 8 hours (configurable)

#### 2. SAML SSO
- `GET /api/auth/saml/init` → redirects to IdP
- `POST /api/auth/saml/callback` → validates SAML response, creates/updates user, issues short-lived auth code
- `POST /api/auth/saml/exchange` → SPA exchanges auth code for JWT (solves POST redirect SPA incompatibility)
- IdP config stored encrypted in `app_settings`: `saml.idpUrl`, `saml.issuer`, `saml.certificate`
- Frontend shows SSO button only when `VITE_SAML_ENABLED=true`

#### 3. TOTP (two-factor authentication)
- Optional per-user. Stored in `users.totp_secret` (encrypted).
- Enrolment: `POST /api/auth/totp/setup` → returns QR code → `POST /api/auth/totp/enable` (verifies code)
- Login flow: after password check, if TOTP enabled, issues `totp_challenge` token instead of JWT. Frontend must then `POST /api/auth/totp/verify` with the 6-digit code.

#### 4. Service API key
- Long-lived key for automation (e.g. MCP server, CI scripts)
- Stored as bcrypt hash in `app_settings['system.serviceApiKey']` (server-only, encrypted)
- Accepted as a Bearer token on any endpoint
- Mapped to a synthetic `SERVICE_ACCOUNT` user with `admin` role
- Generate from the Settings page (admin only)

### JWT structure

```json
{
  "userId": "uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

The token is validated by looking up the session in the `sessions` table (not by verifying a signature alone — this allows server-side revocation on logout).

### Encryption of secrets

Secrets stored in `app_settings` (SAML certificate, SMTP password, service API key hash, TOTP secrets) are encrypted with AES-256-GCM:

```typescript
// api/src/shared/crypto.ts
encrypt(plaintext: string): string  // → "iv:authTag:ciphertext" (hex encoded)
decrypt(ciphertext: string): string
```

`ENCRYPTION_KEY` must be exactly 64 hex characters (32 bytes). If unset, values are stored in plain text (acceptable for local dev, **never for production**).

---

## 9. Proposal Lifecycle

### Status pipeline

```
New → In Progress → Waiting Approval → Approved → Sent to Customer → Won | Lost
```

Status transitions are managed by the frontend store and persisted via `PUT /api/proposals/:id`. The backend does not enforce transition rules — the frontend `updateProposal` function handles state machine logic.

### Proposal types

`proposalType: 'project' | 'support'`

- **Project**: Parts + consultancy phases. Uses `calcTotals()` for financials.
- **Support**: Managed-service contract. Uses `SupportContract` sub-object. Different tab set in workspace.

### Creating proposals

- Project proposals: `NewProposalModal` → `POST /api/proposals`
- Support proposals: `SupportProposalWizard` (multi-step wizard) → `POST /api/proposals`
- From template: `NewProposalModal` → copies parts/phases from selected template

### Proposal reference numbers

Auto-generated on creation using a database sequence (`proposal_ref_seq`):
```
P20260528-0042  (P + YYYYMMDD + 4-digit sequence number)
```

### Version history

Every `PUT /api/proposals/:id` creates a snapshot in `proposal_versions`. The `VersionHistoryPanel` component lets users view and restore previous versions.

---

## 10. Financial Calculations

All financial logic lives in `src/utils/totals.ts`. The `calcTotals(proposal, rateCards?)` function returns:

```typescript
{
  partsCost: number,       // sum of selected vendor quote costs × quantity
  partsSell: number,       // sum of unitPrice × quantity
  markupAmount: number,    // partsSell × (markupPct / 100)
  consultancyCost: number, // phases × tasks cost (rate card or 70% of sell)
  consultancySell: number, // phases × tasks sell (days × dayRate × rateMultiplier)
  pmUplift: number,        // 20% of consultancySell added automatically
  consultancyDiscountedSell: number, // after consultancy discount applied
  grandTotal: number,      // partsSell + markupAmount + consultancyDiscountedSell
  totalCost: number,       // partsCost + consultancyCost
  marginPct: number,       // (grandTotal - totalCost) / grandTotal × 100
}
```

### Part costs

Each `Part` can have multiple `VendorQuote` objects. The selected quote (where `selected: true`) drives the `unitCost` used in cost calculations. If no quote is selected, `part.unitCost` is used directly.

### Consultancy cost

With `useRateCardCost = false` (default): cost is assumed to be 70% of sell price.

With `useRateCardCost = true`: looks up the actual `costRate` from the rate cards for the task's role. Matches on role name (case-insensitive), picks the most recent effective rate card.

### PM uplift

A 20% project management uplift is automatically added to the consultancy sell total. It is **not** a separate task — it is calculated and displayed separately.

### Consultancy discount

`consultancyDiscountType: 'monetary' | 'percentage'`

Applied after PM uplift. A discount of any size requires:
- TRB approval (or waiver)
- A written justification in `consultancyDiscountNote`

### Markup floor

If `proposal.markupPct < discountMarkupFloor` (default 10%), the proposal requires discount approval from a `sales_admin` or `admin` before it can be exported. This floor is configurable via Settings.

---

## 11. Approval Workflows

### Review thresholds (`src/config/approvals.ts`)

| Review | Trigger | Method |
|---|---|---|
| **TRB** (Technical Review Board) | GP ≥ £750, or any consultancy discount | Email link |
| **5K Commercial Review** | GP ≥ £5,000 | Teams meeting |

### Review statuses

```
pending → sent → approved/complete
                        ↓ (if financials change)
                      stale
         → rejected
         → waived
```

### Fingerprint-based staleness detection

When a review is approved, the current financial data is serialised into a fingerprint string (`src/utils/reviewFingerprint.ts`):

```
fingerprint = JSON.stringify({
  markupPct, currency,
  parts: [...sorted by id].map(id, qty, price, type),
  phases: [...sorted by id].map(id, tasks: [...sorted by id].map(id, days, rate, mult))
})
```

The fingerprint is stored on the proposal (`trbApprovedFingerprint`, `fiveKApprovedFingerprint`). On every subsequent edit, the store recomputes the fingerprint and compares it. If it differs, the review status is set to `'stale'`.

**Important:** Only commercially-relevant fields are fingerprinted. Narrative text changes (objectives, SoW content, notes) do not trigger staleness.

### Export guard (`src/utils/exportGuard.ts`)

`getExportBlockers(proposal, rateCards, discountFloor)` returns an array of blockers. Export buttons check this before generating PDFs. Blockers include:
- Required TRB not approved/waived
- Required 5K review not complete/waived
- Stale review after financial changes
- Missing discount justification
- Markup below floor without approval

---

## 12. CRM Integration (Autotask)

The Autotask integration is an optional add-on. It requires API credentials stored in app_settings.

### Credentials (stored encrypted)

| Key | Description |
|---|---|
| `crm.username` | Autotask API username (email) |
| `crm.secret` | Autotask API secret |
| `crm.integrationCode` | API integration code |
| `crm.zoneId` | Zone number (determines API endpoint URL) |

### Key behaviours

- The generic query helper `atQuery(creds, entity, filter, fields?, max?)` is used for all queries
- **Always use `undefined` for `fields`** unless you have verified the exact field name — Autotask rejects unknown `includeFields` values and returns 400
- Account manager lookup uses `ownerResourceID` on the Company entity, resolved via entity field metadata (not `accountManagerResourceID` which doesn't exist in all versions)
- Web UI URLs use `ww{N}.autotask.net` (not `webservices{N}.autotask.net`)

### What the CRM integration provides

1. **Company search** — search Autotask companies to populate `client` field
2. **Account manager lookup** — auto-fills account manager from `ownerResourceID`
3. **Contact picker** — `AutotaskContactPicker` searches contacts by company, auto-fills `clientContact` and `clientContactEmail`
4. **Company address** — fetches the company's registered address into `clientAddress`
5. **Ticket reference** — paste an Autotask ticket number to link the proposal

---

## 13. Rich Text Editor

### Component (`src/components/ui/RichTextEditor.tsx`)

Three exports:

#### `RichTextEditor`
WYSIWYG editor built on TipTap v2 with ProseMirror.

```tsx
<RichTextEditor
  value={html}           // HTML string
  onChange={(html) => …} // called on every keystroke
  disabled={false}
  placeholder="Enter content..."
  minHeight="120px"
  minimal={false}        // true = compact toolbar (no headings, alignment, links)
  className="..."
/>
```

Extensions enabled:
- `StarterKit` (bold, italic, strike, lists, blockquote, code — headings disabled in minimal mode)
- `Underline`
- `Link` (full mode only)
- `Placeholder`
- `TextAlign` (full mode only: left/center/right/justify)

#### `RichContent`
Zero-overhead read-only renderer. Uses `dangerouslySetInnerHTML` with `@tailwindcss/typography` prose classes for consistent rendering.

```tsx
<RichContent html={content} className="..." />
```

#### `htmlToPlainText(html: string): string`
Strips HTML tags, converts `<br>`/`<p>` to newlines. Used for PDF text extraction and character count truncation.

#### `normalise(raw: string): string`
Backward-compatibility utility. If `raw` doesn't start with `<`, wraps in `<p>` tags. Used when rendering content that may have been entered before the rich text editor was added.

### Where rich text is used

| Field | Location |
|---|---|
| Statement of Work content | `SowTab.tsx` |
| Support document boilerplate sections | `SupportDocumentTab.tsx` |
| Support document extra custom sections | `SupportDocumentTab.tsx` |
| Proposal objectives / narrative fields | `ProjectSummaryTab.tsx` |
| Clause content | `Clauses.tsx` |
| Template descriptions | `Templates.tsx` |

---

## 14. PDF Generation

### Project proposals (`src/components/proposals/ProposalPdf.tsx`)

Uses `jsPDF` + `html2canvas`. Renders the proposal into a hidden DOM element, captures it as a canvas, then embeds in a PDF. Less precise but handles complex HTML layouts.

Markup percentage is **never** included in customer-facing outputs.

### Support contracts (`src/components/proposals/SupportPdf.tsx`)

Uses `@react-pdf/renderer` for proper vector PDF output. The document is defined as a React component tree using `@react-pdf` primitives (`<Document>`, `<Page>`, `<View>`, `<Text>` etc.).

```tsx
<DownloadSupportPdfButton
  proposal={proposal}
  boilerplate={boilerplate}
  bpImages={bpImages}
  // ...other doc settings
/>
```

Because `@react-pdf` cannot render HTML, all rich text content is passed through `htmlToPlainText()` before being passed to the PDF renderer.

The document structure follows a fixed 13-section layout with optional extra custom sections between §8 and §9.

### Extra document sections

Support contracts support fully custom sections via `ExtraDocSection[]` on `supportContract.extraSections`:

```typescript
interface ExtraDocSection {
  id: string;
  title: string;
  content: string;  // HTML from RichTextEditor
  image?: string;   // base64 data URL
}
```

Sections can be added, edited, reordered (up/down), and deleted in the Document tab. They appear in both the browser print view and the PDF export.

---

## 15. MCP Server (Self-hosted only)

The self-hosted backend includes a Model Context Protocol (MCP) server at `/mcp`, enabling integration with AI assistants like Microsoft Copilot.

### File: `server/src/mcp.ts`

Architecture:
- **Stateful sessions** — each MCP client connection gets its own `McpServer` + `StreamableHTTPServerTransport` instance stored in a `Map<sessionId, ...>`
- **Authentication** — service API key (Bearer token) required on all routes except `/mcp/health`
- **Session lifecycle** — `onsessioninitialized` / `onsessionclosed` callbacks manage the session map

### Available tools

| Tool | Description |
|---|---|
| `list_proposals` | List proposals with optional status/type filter |
| `get_proposal` | Get full proposal detail by ID |
| `get_proposal_financials` | Financial summary (GP, margin, totals) |
| `list_catalog_items` | Search the product/service catalogue |
| `get_rate_cards` | List current consultancy rate cards |
| `list_users` | List user accounts |
| `get_pipeline_summary` | Aggregate pipeline stats by status |
| `get_support_contracts` | List support proposals with MRR |
| `update_proposal_status` | Change a proposal's status |
| `search_proposals` | Full-text search across proposals |

### HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/mcp` | Initiate session or send message |
| `GET` | `/mcp` | SSE stream for server-sent events |
| `DELETE` | `/mcp` | Close session |
| `GET` | `/mcp/health` | Health check (no auth) |

### Using with Microsoft Copilot

Configure in Copilot Studio or Microsoft 365 Copilot:
1. Generate a service API key in Settings → Integrations
2. Register the MCP server URL: `https://your-server/mcp`
3. Set the Bearer token to the service API key

---

## 16. Branding & Theming

### BrandingContext (`src/contexts/ThemeContext.tsx`)

Loads `branding.*` settings from `GET /api/settings` and applies them as CSS variables and DOM attributes:

| Setting key | Effect |
|---|---|
| `branding.primaryColor` | Sets `--brand-primary` CSS variable |
| `branding.companyName` | Sidebar title, document `<title>` |
| `branding.companySubtitle` | Sidebar subtitle |
| `branding.logoUrl` | Sidebar logo `<img src>` |
| `branding.faviconUrl` | Dynamic favicon `<link rel="icon">` |

Default branding: ITRM Navy (`#2B3990`), company name `MSP SalesPro`.

### Dark mode

Dark mode uses Tailwind's `class` strategy. The theme is toggled by adding/removing the `dark` class on `<html>`. Preference is persisted to `localStorage`.

All components use `dark:` variant classes. Conventions:
- Backgrounds: `bg-white dark:bg-slate-800`
- Cards: `bg-gray-50 dark:bg-slate-900`
- Text: `text-gray-900 dark:text-white`
- Borders: `border-gray-200 dark:border-slate-700`
- Inputs: `bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600`
- Muted text: `text-gray-500 dark:text-slate-400`

---

## 17. Customer-Facing Views

Two unauthenticated routes serve external parties:

### Shared proposal preview (`/share/:token`)

- Token generated via `POST /api/proposals/:id/share` (admin/presales only)
- Renders a read-only, branded proposal summary
- No pricing markup shown — only customer-facing sell prices
- Component: `SharedProposalView`

### Customer sign-off portal (`/customer/:token`)

- Token generated via `POST /api/proposals/:id/customer-link`
- Customer can:
  - View the full proposal with VAT-inclusive pricing
  - Accept (sign off) or reject with optional notes
  - Their decision is recorded: `approval_status`, `signed_by_name`, `signer_ip`, `signed_at`
- **Markup % is never exposed** — the customer view has its own `calcTotals` that bakes markup into part prices
- VAT is added at 20% in the customer view only
- Component: `CustomerProposalView`

---

## 18. SCIM Provisioning

The API implements SCIM 2.0 for automated user provisioning from identity providers (e.g. Entra ID / Azure AD).

Endpoints at `/api/scim/`:
- `GET /Users` — list users
- `POST /Users` — create user
- `GET /Users/:id` — get user
- `PUT /Users/:id` — replace user
- `PATCH /Users/:id` — partial update (supports `active: false` for deprovisioning)

Deprovisioned users (`isActive: false`) cannot log in. Their proposals remain accessible to admins.

SCIM bearer token is configured in Settings and stored as a bcrypt hash in `app_settings['scim.bearerToken']`.

---

## 19. How to Add New Features

### Adding a new field to proposals

1. **Types** — add to `Proposal` in:
   - `src/types/index.ts` (frontend, both repos)
   - `api/src/types/index.ts` (Azure backend)
   - `server/src/types/index.ts` (self-hosted backend)

2. **Database** — add migration to both `db.ts` files:
   ```sql
   -- Azure (db.ts in api/src/shared/)
   IF NOT EXISTS (...) ALTER TABLE proposals ADD my_field NVARCHAR(500) NULL

   -- PostgreSQL (db.ts in server/src/shared/)
   ALTER TABLE proposals ADD COLUMN IF NOT EXISTS my_field VARCHAR(500)
   ```

3. **Repository mapper** — update `toProposal()` in both `proposalRepo.ts` files:
   ```typescript
   myField: r.my_field ?? undefined,
   ```

4. **INSERT query** — add column and parameter to both insert queries

5. **UPDATE query** — add `my_field = @myField` (Azure) or `my_field = $N` (PostgreSQL) to both update queries

6. **Frontend** — add the input to the appropriate tab component, call `onUpdate({ myField: value })`

7. **Sync frontend** — copy the changed `src/` file to the self-hosted repo

### Adding a new API endpoint (Azure)

```typescript
// api/src/functions/myFeature.ts
import { app } from '@azure/functions';
import { requireAuth } from '../shared/auth';

app.http('myAction', {
  methods: ['GET'],
  route: 'my-resource',
  authLevel: 'anonymous',
  handler: async (req, ctx) => {
    const authError = await requireAuth(req);
    if (authError) return authError;

    // ... business logic

    return { jsonBody: { data: result } };
  }
});
```

Then add the equivalent in `server/src/routes/myFeature.ts`:

```typescript
import { Router } from 'express';
import { requireAuth } from '../shared/auth';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  // ... same business logic
  res.json({ data: result });
});

export default router;
```

Register the router in `server/src/index.ts`:
```typescript
import myFeatureRouter from './routes/myFeature';
app.use('/api/my-resource', myFeatureRouter);
```

### Adding a new proposal tab

1. Create `src/components/proposals/tabs/MyTab.tsx`:
   ```tsx
   interface Props { proposal: Proposal; editable: boolean; onUpdate: (p: Partial<Proposal>) => void; }
   export default function MyTab({ proposal, editable, onUpdate }: Props) { ... }
   ```

2. Add a lazy import in `ProposalWorkspace.tsx`:
   ```typescript
   const MyTab = lazy(() => import('../components/proposals/tabs/MyTab'));
   ```

3. Add the tab name to `TABS` or `SUPPORT_TABS` array

4. Add the render condition:
   ```tsx
   {activeTab === 'My Tab' && <MyTab proposal={proposal} editable={editable} onUpdate={handleUpdate} />}
   ```

---

## 20. Two-Repo Sync Process

> **Rule**: Always make frontend changes in the Azure repo first, then copy to self-hosted.

### Copying a changed file

```bash
cp C:\Apps\ITRM-PreSales\src\path\to\file.tsx C:\Apps\ITRM-PreSales-SelfHosted\src\path\to\file.tsx
```

### After syncing

Always run the TypeScript compiler on the self-hosted repo to catch any issues:

```bash
npx tsc --noEmit --project C:\Apps\ITRM-PreSales-SelfHosted\tsconfig.json
```

### Checklist for a complete feature (both repos)

- [ ] `src/types/index.ts` — frontend type changes copied
- [ ] `api/src/types/index.ts` — Azure backend type updated
- [ ] `server/src/types/index.ts` — self-hosted backend type updated
- [ ] `api/src/shared/db.ts` — Azure migration added
- [ ] `server/src/shared/db.ts` — PostgreSQL migration added
- [ ] `api/src/repositories/proposalRepo.ts` — Azure repo updated
- [ ] `server/src/repositories/proposalRepo.ts` — self-hosted repo updated (check `$N` numbering!)
- [ ] Frontend `src/` changes copied to self-hosted repo
- [ ] Both TypeScript checks pass
- [ ] `POST /api/seed` called on both running instances to apply migrations

---

## 21. Deployment

### Azure deployment

The app deploys automatically via GitHub Actions (`.github/workflows/azure-static-web-apps.yml`) on push to `main`:
1. Builds the Vite frontend → `dist/`
2. Deploys to Azure Static Web Apps
3. The `api/` directory is deployed as Azure Functions alongside the static site

**Required Azure resources:**
- Azure Static Web App (hosts both the SPA and Functions)
- Azure SQL Database (Basic tier is sufficient for small teams)

**Required App Settings in Azure:**
```
SQL_CONNECTION_STRING = Server=...;Database=...;User=...;Password=...
SESSION_SECRET        = <random 32+ char string>
ENCRYPTION_KEY        = <64 hex chars>
VITE_SAML_ENABLED     = true  (if SAML is configured)
```

### Self-hosted deployment

```bash
# 1. Build the frontend
cd C:\Apps\ITRM-PreSales-SelfHosted
npm run build
# → dist/ contains the SPA

# 2. Serve frontend with the Express server (or a separate nginx/caddy)
# The Express server serves dist/ as static files in production

# 3. Configure environment
export DATABASE_URL="postgresql://..."
export SESSION_SECRET="..."
export ENCRYPTION_KEY="..."
export PORT=3001

# 4. Run the server
cd server && npm start
```

The Express server in production mode (`NODE_ENV=production`) serves the built `dist/` directory as static files, so the entire application runs from a single process.

---

## 22. Environment Variables Reference

### Azure (api/local.settings.json or App Settings)

| Variable | Required | Description |
|---|---|---|
| `SQL_CONNECTION_STRING` | Yes (prod) | Azure SQL connection string |
| `SESSION_SECRET` | Yes (prod) | JWT signing secret, min 32 chars |
| `ENCRYPTION_KEY` | Recommended | 64 hex chars, for AES-256-GCM secret encryption |
| `VITE_SAML_ENABLED` | No | Set `'true'` to show SSO login button |

### Self-hosted (server/.env)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `SESSION_SECRET` | Yes (prod) | JWT signing secret, min 32 chars |
| `ENCRYPTION_KEY` | Recommended | 64 hex chars, for AES-256-GCM |
| `PORT` | No | Server port, defaults to 3001 |
| `VITE_SAML_ENABLED` | No | Set `'true'` to show SSO login button |

### App settings (stored in database, editable via Settings UI)

| Key | Description |
|---|---|
| `branding.primaryColor` | Brand hex colour |
| `branding.companyName` | Company name in sidebar |
| `branding.logoUrl` | Logo image URL |
| `saml.idpUrl` | SAML IdP single sign-on URL |
| `saml.issuer` | SAML service provider entity ID |
| `saml.certificate` | SAML IdP certificate (PEM, encrypted at rest) |
| `ai.provider` | `azure_openai` \| `anthropic` \| `demo` |
| `ai.endpoint` | Azure OpenAI endpoint (if using Azure) |
| `ai.apiKey` | AI API key (encrypted at rest) |
| `system.serviceApiKey` | Bcrypt hash of service API key |
| `scim.bearerToken` | Bcrypt hash of SCIM bearer token |
| `discount.markupFloor` | Minimum markup % before discount approval needed |
| `smtp.*` | Email configuration for notifications |
| `support.doc.*` | Support document boilerplate content and images |

---

## 23. Troubleshooting

### "SQL_CONNECTION_STRING is set but SESSION_SECRET is not"
Set `SESSION_SECRET` to any random string of 32+ characters. This check prevents accidentally running in prod with auth bypassed.

### "Proposal not saving / 404 on PUT"
Check the proposal ID. In dev mode, proposals created from seed data have mock IDs that don't exist in the database — save them once to persist them.

### "Rich text content appears as raw HTML"
The field is being rendered with a plain `<p>` or `<pre>` tag. Replace with `<RichContent html={content} />` from `src/components/ui/RichTextEditor.tsx`.

### "TRB/5K review shows stale immediately after approval"
A financial field changed between the approval and the next save. Check if any auto-calculation is modifying parts, days, or rates. The fingerprint includes `markupPct`, `currency`, all part `unitPrice`/`quantity`, and all task `days`/`dayRate`/`rateMultiplier`.

### "Export is blocked but review looks approved"
Check `getExportBlockers()` output. Common causes: consultancy discount without justification text, markup below floor without discount approval, or stale status.

### "PostgreSQL INSERT failing with 'wrong number of parameters'"
When you add a new parameter to the middle of a positional parameter INSERT query, all subsequent `$N` references must be renumbered. Count from 1 and ensure no gaps.

### "Autotask company search returns 400"
The `includeFields` parameter contains a field name that Autotask doesn't recognise for that entity. Remove the `fields` argument (pass `undefined`) to return all fields instead.

### "Support PDF is blank"
The PDF renderer received HTML content where it expected plain text. Pass content through `htmlToPlainText()` before giving it to `@react-pdf` components.

### "Print view shows only a blank page"
The print isolation CSS is not matching. Ensure the document root element has `id="support-doc-root"` and the print CSS uses the visibility isolation pattern:
```css
@media print {
  body * { visibility: hidden; }
  #support-doc-root, #support-doc-root * { visibility: visible; }
  #support-doc-root { position: absolute; top: 0; left: 0; }
}
```

### Dev: changes not reflected after hot reload
The Zustand store is hydrated once on mount (and on focus/route change, throttled to 30s). If you modified data directly in the DB, force a refresh with `window.location.reload()` or wait for the next tab-focus re-fetch.
