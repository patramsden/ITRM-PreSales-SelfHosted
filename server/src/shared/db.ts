import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
  _pool = new Pool({ connectionString: DATABASE_URL });
  _pool.on('error', (err) => console.error('[pg] idle client error', err));
  return _pool;
}

/** Convenience wrapper — returns typed row array. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function generateProposalReference(createdAt: Date): Promise<string> {
  const rows = await query<{ n: string }>(`SELECT nextval('proposal_ref_seq') AS n`);
  const n = parseInt(rows[0].n, 10);
  const d = createdAt;
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `P${yyyymmdd}-${String(n).padStart(4, '0')}`;
}

// ─── Schema bootstrap ─────────────────────────────────────────────────────────
// Called once via POST /api/seed. Creates all tables and runs additive migrations.

export async function ensureSchema(): Promise<void> {
  const pool = getPool();

  // ── Core tables (idempotent CREATE IF NOT EXISTS) ──────────────────────────
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id            VARCHAR(100)  NOT NULL PRIMARY KEY,
      name          VARCHAR(255)  NOT NULL,
      email         VARCHAR(255)  NOT NULL,
      department    VARCHAR(100),
      app_role      VARCHAR(20)   NOT NULL DEFAULT 'user',
      auth_provider VARCHAR(20)   NOT NULL DEFAULT 'local',
      password_hash VARCHAR(500),
      saml_name_id  VARCHAR(500),
      totp_secret   VARCHAR(100),
      job_title     VARCHAR(200),
      avatar_data   TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS proposals (
      id                    VARCHAR(100)  NOT NULL PRIMARY KEY,
      project_name          VARCHAR(500)  NOT NULL,
      client                VARCHAR(255)  NOT NULL,
      account_manager       VARCHAR(255),
      status                VARCHAR(50)   NOT NULL DEFAULT 'Draft',
      currency              VARCHAR(10)   NOT NULL DEFAULT 'GBP',
      date_created          DATE          NOT NULL,
      date_modified         DATE          NOT NULL,
      ticket_ref            VARCHAR(100),
      markup_pct            NUMERIC(5,2)  NOT NULL DEFAULT 15,
      objectives            TEXT,
      business_requirements TEXT,
      justification         TEXT,
      constraints           TEXT,
      assumptions           TEXT,
      notes                 TEXT,
      owner_id              VARCHAR(100)  NOT NULL,
      collaborator_ids      TEXT          NOT NULL DEFAULT '[]',
      sow_content           TEXT,
      planner_url           VARCHAR(500),
      template_id           VARCHAR(100),
      trb_status            VARCHAR(50),
      trb_review_notes      TEXT,
      trb_reviewed_by       VARCHAR(255),
      trb_reviewed_at       TIMESTAMPTZ,
      five_k_status         VARCHAR(50)
    )`,

    `CREATE TABLE IF NOT EXISTS parts (
      id          VARCHAR(100)  NOT NULL PRIMARY KEY,
      proposal_id VARCHAR(100)  NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      description VARCHAR(500)  NOT NULL,
      sku         VARCHAR(100),
      quantity    INTEGER       NOT NULL DEFAULT 1,
      unit_cost   NUMERIC(18,2) NOT NULL DEFAULT 0,
      unit_price  NUMERIC(18,2) NOT NULL DEFAULT 0,
      part_type   VARCHAR(50)   NOT NULL DEFAULT 'Hardware',
      sort_order  INTEGER       NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS vendor_quotes (
      id              VARCHAR(100)  NOT NULL PRIMARY KEY,
      part_id         VARCHAR(100)  NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
      vendor          VARCHAR(255),
      reference       VARCHAR(255),
      cost            NUMERIC(18,2) NOT NULL DEFAULT 0,
      valid_until     DATE,
      notes           TEXT,
      is_selected     BOOLEAN       NOT NULL DEFAULT FALSE,
      attachment_name VARCHAR(500),
      attachment_mime VARCHAR(100),
      attachment_data TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS phases (
      id          VARCHAR(100) NOT NULL PRIMARY KEY,
      proposal_id VARCHAR(100) NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      name        VARCHAR(255) NOT NULL,
      sort_order  INTEGER      NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS tasks (
      id              VARCHAR(100)  NOT NULL PRIMARY KEY,
      phase_id        VARCHAR(100)  NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
      name            VARCHAR(255)  NOT NULL,
      role            VARCHAR(255),
      days            NUMERIC(5,1)  NOT NULL DEFAULT 1,
      day_rate        NUMERIC(18,2) NOT NULL DEFAULT 0,
      unit            VARCHAR(10)   NOT NULL DEFAULT 'days',
      rate_multiplier NUMERIC(3,1)  NOT NULL DEFAULT 1,
      sort_order      INTEGER       NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS templates (
      id           VARCHAR(100) NOT NULL PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      description  VARCHAR(1000),
      owner_id     VARCHAR(100) NOT NULL,
      date_created DATE         NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS template_parts (
      id          VARCHAR(100)  NOT NULL PRIMARY KEY,
      template_id VARCHAR(100)  NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      description VARCHAR(500)  NOT NULL,
      sku         VARCHAR(100),
      quantity    INTEGER       NOT NULL DEFAULT 1,
      unit_cost   NUMERIC(18,2) NOT NULL DEFAULT 0,
      unit_price  NUMERIC(18,2) NOT NULL DEFAULT 0,
      part_type   VARCHAR(50)   NOT NULL DEFAULT 'Hardware',
      sort_order  INTEGER       NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS template_phases (
      id          VARCHAR(100) NOT NULL PRIMARY KEY,
      template_id VARCHAR(100) NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      name        VARCHAR(255) NOT NULL,
      sort_order  INTEGER      NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS template_tasks (
      id              VARCHAR(100)  NOT NULL PRIMARY KEY,
      phase_id        VARCHAR(100)  NOT NULL REFERENCES template_phases(id) ON DELETE CASCADE,
      name            VARCHAR(255)  NOT NULL,
      role            VARCHAR(255),
      days            NUMERIC(5,1)  NOT NULL DEFAULT 1,
      day_rate        NUMERIC(18,2) NOT NULL DEFAULT 0,
      unit            VARCHAR(10)   NOT NULL DEFAULT 'days',
      rate_multiplier NUMERIC(3,1)  NOT NULL DEFAULT 1,
      sort_order      INTEGER       NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS catalog_items (
      id             VARCHAR(100)  NOT NULL PRIMARY KEY,
      sku            VARCHAR(100)  NOT NULL,
      description    VARCHAR(500)  NOT NULL,
      category       VARCHAR(100),
      default_vendor VARCHAR(255),
      cost_price     NUMERIC(18,2) NOT NULL DEFAULT 0,
      list_price     NUMERIC(18,2) NOT NULL DEFAULT 0,
      part_type      VARCHAR(50)   NOT NULL DEFAULT 'Hardware',
      related_ids    TEXT          NOT NULL DEFAULT '[]'
    )`,

    `CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_items_sku ON catalog_items(sku)`,

    `CREATE TABLE IF NOT EXISTS rate_cards (
      id               VARCHAR(100)  NOT NULL PRIMARY KEY,
      role             VARCHAR(255)  NOT NULL,
      cost_rate        NUMERIC(18,2) NOT NULL DEFAULT 0,
      sell_rate        NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency         VARCHAR(10)   NOT NULL DEFAULT 'GBP',
      effective_from   DATE          NOT NULL,
      effective_to     DATE,
      overtime_enabled BOOLEAN       NOT NULL DEFAULT FALSE
    )`,

    `CREATE TABLE IF NOT EXISTS lookups (
      key   VARCHAR(100) NOT NULL PRIMARY KEY,
      value TEXT         NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS sessions (
      token      VARCHAR(100) NOT NULL PRIMARY KEY,
      user_id    VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ  NOT NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS auth_codes (
      code       VARCHAR(100) NOT NULL PRIMARY KEY,
      user_id    VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ  NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS app_settings (
      key   VARCHAR(100) NOT NULL PRIMARY KEY,
      value TEXT         NOT NULL DEFAULT ''
    )`,

    `CREATE TABLE IF NOT EXISTS proposal_versions (
      id          VARCHAR(100) NOT NULL PRIMARY KEY,
      proposal_id VARCHAR(100) NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      snapshot    TEXT         NOT NULL,
      saved_by    VARCHAR(255) NOT NULL DEFAULT 'system',
      saved_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS proposal_shares (
      token       VARCHAR(100) NOT NULL PRIMARY KEY,
      proposal_id VARCHAR(100) NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      created_by  VARCHAR(255) NOT NULL DEFAULT 'system',
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ
    )`,

    `CREATE TABLE IF NOT EXISTS totp_challenges (
      token      VARCHAR(100) NOT NULL PRIMARY KEY,
      user_id    VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ  NOT NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token      VARCHAR(100) NOT NULL PRIMARY KEY,
      user_id    VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ  NOT NULL,
      used       BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`,
  ];

  for (const stmt of tables) {
    await pool.query(stmt);
  }

  // ── Additive column migrations (idempotent ADD COLUMN IF NOT EXISTS) ─────────
  // These handle the case where a table already existed before a column was added.
  const migrations = [
    // users columns — SCIM provisioning
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
    // proposals columns — CRM integration
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_contact  VARCHAR(255)`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS crm_company_id  VARCHAR(100)`,
    // proposals columns — billing milestones
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS milestones TEXT NOT NULL DEFAULT '[]'`,
    // catalog_items columns added after initial release
    `ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS cost_price  NUMERIC(18,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS part_type   VARCHAR(50)   NOT NULL DEFAULT 'Hardware'`,
    `ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS related_ids TEXT          NOT NULL DEFAULT '[]'`,
    // proposals columns added over time
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS trb_status       VARCHAR(50)`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS trb_review_notes TEXT`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS trb_reviewed_by  VARCHAR(255)`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS trb_reviewed_at  TIMESTAMPTZ`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS five_k_status    VARCHAR(50)`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS planner_url      VARCHAR(500)`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS template_id      VARCHAR(100)`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sow_content      TEXT`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ticket_ref       VARCHAR(100)`,
    // Status rename: 'In Review' → 'In Progress'
    `UPDATE proposals SET status = 'In Progress' WHERE status = 'In Review'`,
    // MFA enforcement — enrollment token table
    `CREATE TABLE IF NOT EXISTS mfa_enrollment_tokens (
       token      VARCHAR(100)  NOT NULL PRIMARY KEY,
       user_id    VARCHAR(100)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       expires_at TIMESTAMPTZ   NOT NULL,
       created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
     )`,
    // Rate card cost toggle
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS use_rate_card_cost BOOLEAN NOT NULL DEFAULT FALSE`,
    // Last modified tracking on proposals
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255)`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ`,
    // 4-tier role model — migrate existing 'user' rows to 'sales', then update constraint
    `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_app_role_check`,
    `UPDATE users SET app_role = 'sales' WHERE app_role = 'user'`,
    `ALTER TABLE users ADD CONSTRAINT users_app_role_check
       CHECK (app_role IN ('admin','sales_admin','presales','sales'))`,

    // Proposal reference number
    `CREATE SEQUENCE IF NOT EXISTS proposal_ref_seq START 1`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS reference VARCHAR(30)`,

    // Customer-facing signed links
    `CREATE TABLE IF NOT EXISTS customer_links (
      token           VARCHAR(100)  NOT NULL PRIMARY KEY,
      proposal_id     VARCHAR(100)  NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      created_by      VARCHAR(255)  NOT NULL DEFAULT 'system',
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ   NULL,
      default_theme   VARCHAR(10)   NOT NULL DEFAULT 'light',
      approval_status VARCHAR(20)   NOT NULL DEFAULT 'pending',
      signed_at       TIMESTAMPTZ   NULL,
      signed_by_name  VARCHAR(255)  NULL,
      signer_ip       VARCHAR(100)  NULL,
      signer_notes    TEXT          NULL
    )`,

    // 5K review enrichment columns
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS five_k_attendees TEXT`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS five_k_notes TEXT`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS five_k_meeting_date DATE`,

    // Review fingerprints — captures financial state at approval/completion so
    // subsequent edits can auto-detect that re-review is required (status 'stale')
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS trb_approved_fingerprint   TEXT`,
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS five_k_approved_fingerprint TEXT`,
  ];

  for (const stmt of migrations) {
    await pool.query(stmt);
  }
}
