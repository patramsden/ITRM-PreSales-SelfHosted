import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAppSettingsDirect } from '../repositories/settingsRepo';

const router = Router();

// ─── Autotask credentials ─────────────────────────────────────────────────────

interface AtCreds {
  zoneUrl: string; username: string; secret: string; integrationCode: string;
}

async function getCreds(): Promise<AtCreds | null> {
  const s = await getAppSettingsDirect();
  const zoneUrl         = (s['crm.autotask.zoneUrl']         ?? '').trim();
  const username        = (s['crm.autotask.username']        ?? '').trim();
  const secret          = (s['crm.autotask.secret']          ?? '').trim();
  const integrationCode = (s['crm.autotask.integrationCode'] ?? '').trim();
  if (!zoneUrl || !username || !secret || !integrationCode) return null;
  return { zoneUrl, username, secret, integrationCode };
}

// ─── Verbose logger (always on for CRM — helps diagnose auth issues) ─────────

function crmLog(msg: string, ...args: unknown[]) {
  console.log(`[CRM] ${new Date().toISOString()} ${msg}`, ...args);
}

// ─── Autotask query helper ────────────────────────────────────────────────────

async function atQuery<T>(creds: AtCreds, entity: string, filter: unknown[], fields?: string[], max = 25): Promise<T[]> {
  // Strip any /atservicesrest path that may already be present in the stored
  // zone URL (zone detection returns the full API base on some tenants) so we
  // always construct the URL from the bare hostname.
  const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
  const url  = `${host}/atservicesrest/v1.0/${entity}/query`;
  const requestBody: Record<string, unknown> = { filter, maxRecords: max };
  if (fields?.length) requestBody.includeFields = fields;

  crmLog(`→ POST ${url}`);
  crmLog(`  UserName:           ${creds.username}`);
  crmLog(`  ApiIntegrationCode: ${creds.integrationCode}`);
  crmLog(`  Secret length:      ${creds.secret.length} chars`);
  crmLog(`  Secret first/last:  ${creds.secret.slice(0, 2)}…${creds.secret.slice(-2)}`);
  crmLog(`  Request body:       ${JSON.stringify(requestBody)}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'UserName': creds.username,
      'Secret': creds.secret,
      'ApiIntegrationCode': creds.integrationCode,
    },
    body: JSON.stringify(requestBody),
  });

  crmLog(`← ${res.status} ${res.statusText}`);
  crmLog(`  Response headers: ${JSON.stringify(Object.fromEntries(res.headers.entries()))}`);

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    crmLog(`  Response body: ${text.slice(0, 500)}`);

    if (res.status === 401) {
      const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const hint = stripped
        ? `Autotask responded: ${stripped.slice(0, 200)}`
        : `The request reached Autotask but was rejected with no detail — ` +
          `this almost always means the Integration Code or Secret is wrong. ` +
          `In Autotask go to Admin → Integrations → Tracking Identifiers and ` +
          `copy the exact code shown there. Also re-enter the API user's password ` +
          `in the Secret field and save before testing again.`;
      throw new Error(`Autotask 401 — ${hint}`);
    }
    throw new Error(`Autotask ${entity} (${res.status}): ${text}`);
  }

  const data = await res.json() as { items?: T[] };
  crmLog(`  Items returned: ${data.items?.length ?? 0}`);
  return data.items ?? [];
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/status', requireAuth, async (_req, res) => {
  const creds = await getCreds().catch(() => null);
  res.json({ configured: !!creds });
});

router.post('/detect-zone', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username } = req.body as { username?: string };
    if (!username?.trim()) { res.status(400).json({ error: 'username required' }); return; }
    const r = await fetch(
      `https://webservices2.autotask.net/atservicesrest/v1.0/zoneInformation?user=${encodeURIComponent(username)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (!r.ok) throw new Error(`Zone lookup failed (${r.status})`);
    const data = await r.json() as { url?: string };
    if (!data.url) throw new Error('No zone URL returned');
    // Store just the bare hostname — atservicesrest path is added at query time
    const zoneUrl = data.url.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
    res.json({ zoneUrl });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.post('/test', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json({ success: false, message: 'CRM credentials not configured.' }); return; }

    // Pre-flight: re-detect the zone and warn if it differs from what is stored
    let detectedZone: string | null = null;
    let zoneMismatch = false;
    try {
      const zr = await fetch(
        `https://webservices2.autotask.net/atservicesrest/v1.0/zoneInformation?user=${encodeURIComponent(creds.username)}`,
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (zr.ok) {
        const zd = await zr.json() as { url?: string };
        if (zd.url) {
          detectedZone = zd.url.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
          zoneMismatch = detectedZone.toLowerCase() !== creds.zoneUrl.toLowerCase();
        }
      }
    } catch { /* zone lookup failure is non-fatal */ }

    if (zoneMismatch) {
      res.json({
        success: false,
        message: `Zone URL mismatch. Stored: "${creds.zoneUrl}" but your username resolves to "${detectedZone}". Click "Detect Zone" and save to fix this.`,
        zoneUrl: creds.zoneUrl,
        detectedZone,
        username: creds.username,
      }); return;
    }

    const mask = (s: string) => s.length <= 8 ? '••••' : `${s.slice(0, 4)}${'•'.repeat(Math.min(s.length - 8, 8))}${s.slice(-4)}`;
    const items = await atQuery(creds, 'Companies', [{ field: 'isActive', op: 'eq', value: true }], ['id', 'companyName'], 1);
    res.json({ success: true, message: `Connected to Autotask successfully.${items.length ? ' Companies found.' : ''}`, zoneUrl: creds.zoneUrl, username: creds.username, integrationCodeHint: mask(creds.integrationCode) });
  } catch (e) {
    const cr = await getCreds().catch(() => null);
    const mask = (s: string) => s.length <= 8 ? '••••' : `${s.slice(0, 4)}${'•'.repeat(Math.min(s.length - 8, 8))}${s.slice(-4)}`;
    res.json({ success: false, message: e instanceof Error ? e.message : String(e), ...(cr ? { zoneUrl: cr.zoneUrl, username: cr.username, integrationCodeHint: mask(cr.integrationCode) } : {}) });
  }
});

router.get('/companies', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json([]); return; }
    const search = ((req.query.search as string) ?? '').trim();
    if (search.length < 2) { res.json([]); return; }
    const items = await atQuery<{ id: number; companyName: string; phone?: string; city?: string }>(
      creds, 'Companies',
      [{ field: 'isActive', op: 'eq', value: true }, { field: 'companyName', op: 'contains', value: search }],
      ['id', 'companyName', 'phone', 'city'], 20
    );
    res.json(items);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get('/contacts', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json([]); return; }
    const companyId = parseInt((req.query.companyId as string) ?? '');
    if (isNaN(companyId)) { res.status(400).json({ error: 'companyId required' }); return; }
    const items = await atQuery<{ id: number; firstName: string; lastName: string; emailAddress?: string; title?: string }>(
      creds, 'Contacts',
      [{ field: 'companyID', op: 'eq', value: companyId }, { field: 'isActive', op: 'eq', value: true }],
      ['id', 'firstName', 'lastName', 'emailAddress', 'title'], 100
    );
    res.json(items);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get('/account-manager', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json({ name: null, contactId: null }); return; }
    const companyId = parseInt((req.query.companyId as string) ?? '');
    if (isNaN(companyId)) { res.status(400).json({ error: 'companyId required' }); return; }
    // Account manager is a Resource on the Company, not a Contact
    const companies = await atQuery<{ id: number; accountManagerResourceID?: number }>(
      creds, 'Companies',
      [{ field: 'id', op: 'eq', value: companyId }],
      ['id', 'accountManagerResourceID'], 1
    );
    const resourceId = companies[0]?.accountManagerResourceID;
    if (!resourceId) { res.json({ name: null, contactId: null }); return; }

    const resources = await atQuery<{ id: number; firstName: string; lastName: string }>(
      creds, 'Resources',
      [{ field: 'id', op: 'eq', value: resourceId }],
      ['id', 'firstName', 'lastName'], 1
    );
    const r = resources[0];
    res.json({ name: r ? `${r.firstName} ${r.lastName}`.trim() : null, contactId: null });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// ─── POST /api/crm/create-project ─────────────────────────────────────────────

router.post('/create-project', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.status(400).json({ error: 'CRM not configured' }); return; }
    const { projectName, companyID, description } = req.body as {
      projectName?: string; companyID?: number; description?: string;
    };
    if (!projectName?.trim() || !companyID) {
      res.status(400).json({ error: 'projectName and companyID required' }); return;
    }
    const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
    const url  = `${host}/atservicesrest/v1.0/Projects`;
    const body = {
      projectName: projectName.trim(),
      companyID,
      status: 1,
      description: description ?? '',
      startDateTime: new Date().toISOString(),
      estimatedTime: 0,
    };
    crmLog(`→ POST ${url} (create project)`);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'UserName': creds.username,
        'Secret': creds.secret,
        'ApiIntegrationCode': creds.integrationCode,
      },
      body: JSON.stringify(body),
    });
    crmLog(`← ${r.status} ${r.statusText}`);
    if (!r.ok) {
      const text = await r.text().catch(() => r.statusText);
      throw new Error(`Autotask Projects (${r.status}): ${text.slice(0, 300)}`);
    }
    const data = await r.json() as { itemId?: number };
    const projectId = data.itemId;
    res.json({ projectId, url: `${host}/Projects/${projectId}` });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
