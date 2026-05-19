import { query } from '../shared/db';

const SERVER_ONLY_KEYS = new Set([
  'sso.idpCert', 'ai.azure.key', 'ai.anthropic.key', 'system.serviceApiKey',
]);

export const SETTING_KEYS = {
  AI_PROVIDER:       'ai.provider',
  AI_AZURE_ENDPOINT: 'ai.azure.endpoint',
  AI_AZURE_DEPLOY:   'ai.azure.deployment',
  AI_AZURE_VERSION:  'ai.azure.apiVersion',
  AI_AZURE_KEY:      'ai.azure.key',
  AI_ANTHROPIC_KEY:  'ai.anthropic.key',
  SSO_ENABLED:       'sso.enabled',
  SSO_ENTRY_POINT:   'sso.entryPoint',
  SSO_ISSUER:        'sso.issuer',
  SSO_IDP_CERT:      'sso.idpCert',
  APP_URL:           'sso.appUrl',
  SLACK_WEBHOOK:     'notifications.slackWebhook',
  TEAMS_WEBHOOK:     'notifications.teamsWebhook',
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
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function updateAppSettings(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    if (value === '***') continue;
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }
}
