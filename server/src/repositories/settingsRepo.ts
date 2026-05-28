import { query } from '../shared/db';
import { encrypt, decrypt, hashToken } from '../shared/crypto';

const SERVER_ONLY_KEYS = new Set([
  'sso.idpCert', 'ai.azure.key', 'ai.anthropic.key',
  'system.serviceApiKey',   // legacy single key — kept for backward compat
  'system.serviceApiKeys',  // named multi-key list (JSON array, encrypted)
  'crm.autotask.secret', 'scim.token', 'email.password', 'email.graph.clientSecret',
]);

// AES-256-GCM encrypted at rest (value must be recoverable to use)
const ENCRYPT_KEYS = new Set([
  'ai.azure.key', 'ai.anthropic.key', 'crm.autotask.secret', 'email.password', 'sso.idpCert',
  'email.graph.clientSecret',
  'system.serviceApiKeys',  // JSON array of hashed named keys — encrypted at rest
]);

// bcrypt-hashed (only verified, never reconstructed)
const HASH_KEYS = new Set(['system.serviceApiKey', 'scim.token']);

export const SETTING_KEYS = {
  AI_PROVIDER:       'ai.provider',
  AI_AZURE_ENDPOINT: 'ai.azure.endpoint',
  AI_AZURE_DEPLOY:   'ai.azure.deployment',
  AI_AZURE_VERSION:  'ai.azure.apiVersion',
  AI_AZURE_KEY:      'ai.azure.key',
  AI_ANTHROPIC_KEY:  'ai.anthropic.key',
  SSO_ENABLED:        'sso.enabled',
  SSO_ENTRY_POINT:    'sso.entryPoint',
  SSO_ISSUER:         'sso.issuer',
  SSO_IDP_CERT:       'sso.idpCert',          // server-only (cached/manual cert)
  SSO_METADATA_URL:   'sso.metadataUrl',       // federation metadata URL for auto-refresh
  SSO_CERT_REFRESHED: 'sso.certLastRefreshed', // epoch ms of last successful metadata fetch
  APP_URL:            'sso.appUrl',
  SLACK_WEBHOOK:           'notifications.slackWebhook',
  TEAMS_WEBHOOK:           'notifications.teamsWebhook',
  REQUIRE_MFA:             'security.requireMfa',
  SESSION_TIMEOUT_HOURS:   'security.sessionTimeoutHours',
  SSO_LOGOUT_URL:          'sso.logoutUrl',
  EMAIL_ENABLED:           'email.enabled',
  EMAIL_HOST:              'email.host',
  EMAIL_PORT:              'email.port',
  EMAIL_SECURE:            'email.secure',
  EMAIL_USER:              'email.user',
  EMAIL_PASSWORD:          'email.password',
  EMAIL_FROM:              'email.from',
  PROPOSAL_LAYOUT:         'proposal.layout',
} as const;

export async function getAppSettings(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (SERVER_ONLY_KEYS.has(row.key)) {
      out[row.key + '.configured'] = row.value ? 'true' : 'false';
    } else {
      out[row.key] = row.value;
    }
  }
  return out;
}

export async function getAppSettingsDirect(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = ENCRYPT_KEYS.has(row.key) ? decrypt(row.value) : row.value;
  }
  return result;
}

export async function updateAppSettings(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    if (value === '***') continue;
    // Skip synthetic *.configured indicator keys — they are computed from the
    // real key's value at read-time and must never be persisted as their own rows.
    if (key.endsWith('.configured')) continue;
    // Don't blank out a server-only secret with an empty value — the frontend
    // never receives the real value so it sends nothing; preserve what's in DB.
    if (value === '' && SERVER_ONLY_KEYS.has(key)) continue;
    let storedValue = value;
    if (ENCRYPT_KEYS.has(key)) storedValue = encrypt(value);
    else if (HASH_KEYS.has(key)) storedValue = await hashToken(value);
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, storedValue],
    );
  }
}
