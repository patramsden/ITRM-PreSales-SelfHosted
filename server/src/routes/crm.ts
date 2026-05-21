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

// ─── Autotask query helper ────────────────────────────────────────────────────

async function atQuery<T>(creds: AtCreds, entity: string, filter: unknown[], fields?: string[], max = 25): Promise<T[]> {
  // Strip any /atservicesrest path that may already be present in the stored
  // zone URL (zone detection returns the full API base on some tenants) so we
  // always construct the URL from the bare hostname.
  const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
  const body: Record<string, unknown> = { filter, maxRecords: max };
  if (fields?.length) body.includeFields = fields;

  const res = await fetch(`${host}/atservicesrest/v1.0/${entity}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'UserName': creds.username,
      'Secret': creds.secret,
      'ApiIntegrationCode': creds.integrationCode,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 401) {
      throw new Error(
        `Autotask authentication failed (401). Please verify: ` +
        `(1) Username is the full email address of the Autotask API user, ` +
        `(2) Secret matches the API user's password/key in Autotask, ` +
        `(3) ApiIntegrationCode is correct and active, ` +
        `(4) the API user's zone matches the Zone URL. ` +
        `Raw response: ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`,
      );
    }
    throw new Error(`Autotask ${entity} (${res.status}): ${text}`);
  }
  const data = await res.json() as { items?: T[] };
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

    const items = await atQuery(creds, 'Companies', [{ field: 'isActive', op: 'eq', value: true }], ['id', 'companyName'], 1);
    res.json({ success: true, message: `Connected to Autotask successfully.${items.length ? ' Companies found.' : ''}`, zoneUrl: creds.zoneUrl, username: creds.username });
  } catch (e) {
    res.json({ success: false, message: e instanceof Error ? e.message : String(e) });
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

export default router;
