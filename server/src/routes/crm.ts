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

// ─── GET /api/crm/tickets?companyId= ─────────────────────────────────────────

const CUSTOMER_INTEL_QUEUES = ['Account Management', 'Pre-Sales', 'Post-Sale'];

router.get('/tickets', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json([]); return; }
    const companyId = parseInt((req.query.companyId as string) ?? '');
    if (isNaN(companyId)) { res.status(400).json({ error: 'companyId required' }); return; }

    const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');

    let allQueueValues: AtPicklistValue[] = [];
    let statusValues:   AtPicklistValue[] = [];
    try {
      [allQueueValues, statusValues] = await Promise.all([
        fetchPicklist(creds, 'Tickets', 'queueID'),
        fetchPicklist(creds, 'Tickets', 'status'),
      ]);
    } catch (e) { crmLog(`  Picklist fetch failed: ${String(e)}`); }

    crmLog(`  All queue labels: ${allQueueValues.map((v: AtPicklistValue) => v.label).join(' | ')}`);

    const targetQueues = allQueueValues.filter((v: AtPicklistValue) =>
      v.isActive && CUSTOMER_INTEL_QUEUES.some(name => v.label.toLowerCase().includes(name.toLowerCase()))
    );
    const queueIds     = targetQueues.map((v: AtPicklistValue) => v.value);
    const statusMap    = Object.fromEntries(statusValues.map((v: AtPicklistValue) => [v.value, v.label]));
    const queueMap     = Object.fromEntries(allQueueValues.map((v: AtPicklistValue) => [v.value, v.label]));
    const closedStatuses = statusValues
      .filter((v: AtPicklistValue) => /complete|closed|cancelled|cancel/i.test(v.label))
      .map((v: AtPicklistValue) => v.value);

    crmLog(`  Target queue IDs: ${queueIds.join(', ')}`);

    const raw = await atQuery<Record<string, unknown>>(
      creds, 'Tickets',
      [{ field: 'companyID', op: 'eq', value: companyId }],
      undefined,
      500
    );

    crmLog(`  Raw tickets: ${raw.length}`);
    if (raw.length > 0) crmLog(`  First ticket keys: ${Object.keys(raw[0]).join(', ')}`);

    const getField = (r: Record<string, unknown>, ...names: string[]): unknown => {
      for (const name of names) {
        const key = Object.keys(r).find(k => k.toLowerCase() === name.toLowerCase());
        if (key !== undefined) return r[key];
      }
      return undefined;
    };

    const tickets = raw
      .map(r => ({
        id:         getField(r, 'id') as number,
        title:      (getField(r, 'title') as string) ?? '(no title)',
        status:     getField(r, 'status') as number,
        queueID:    getField(r, 'queueID', 'queueId') as number,
        createDate: (getField(r, 'createDate', 'createDateTime') as string | null) ?? null,
      }))
      .filter(t => {
        const inQueue   = queueIds.length === 0 || queueIds.includes(t.queueID);
        const notClosed = closedStatuses.length === 0 || !closedStatuses.includes(t.status);
        return inQueue && notClosed;
      })
      .sort((a, b) => new Date(b.createDate ?? 0).getTime() - new Date(a.createDate ?? 0).getTime())
      .slice(0, 15)
      .map(t => ({
        id:         t.id,
        title:      t.title,
        status:     statusMap[t.status]  ?? `Status ${t.status}`,
        queue:      queueMap[t.queueID]  ?? `Queue ${t.queueID}`,
        createDate: t.createDate,
        url:        `${host}/Tickets/${t.id}`,
      }));

    crmLog(`  Filtered tickets: ${tickets.length}`);
    res.json(tickets);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get('/account-manager', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json({ name: null, contactId: null }); return; }
    const companyId = parseInt((req.query.companyId as string) ?? '');
    if (isNaN(companyId)) { res.status(400).json({ error: 'companyId required' }); return; }
    const companies = await atQuery<Record<string, unknown>>(
      creds, 'Companies',
      [{ field: 'id', op: 'eq', value: companyId }],
      undefined,
      1
    );
    if (!companies[0]) { res.json({ name: null, contactId: null, _debug: 'company not found' }); return; }

    const raw = companies[0];
    const rawKeys = Object.keys(raw);
    crmLog(`  Company raw keys (${rawKeys.length}): ${rawKeys.join(', ')}`);

    const amKey = rawKeys.find(k => {
      const lk = k.toLowerCase();
      return lk === 'accountmanagerresourceid' || lk === 'accountmanagerid' || lk === 'ownerresourceid';
    });
    crmLog(`  Matched AM key: ${amKey ?? 'none'}`);

    const candidateKeys = rawKeys.filter(k => {
      const lk = k.toLowerCase();
      return lk.includes('manager') || lk.includes('owner') || lk.includes('salesrep');
    });
    crmLog(`  Candidate AM-like keys: ${candidateKeys.join(', ') || 'none'}`);

    const resourceId = amKey ? (raw[amKey] as number | null | undefined) : undefined;
    crmLog(`  Resource ID value: ${resourceId}`);

    if (!resourceId) {
      res.json({
        name: null,
        contactId: null,
        _debug: `No account manager key found. Keys checked: ${rawKeys.length}. Candidates: ${candidateKeys.join(', ') || 'none'}`,
      }); return;
    }

    const resources = await atQuery<{ id: number; firstName: string; lastName: string }>(
      creds, 'Resources',
      [{ field: 'id', op: 'eq', value: resourceId }],
      ['id', 'firstName', 'lastName'], 1
    );
    const r = resources[0];
    res.json({ name: r ? `${r.firstName} ${r.lastName}`.trim() : null, contactId: null });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// ─── Account manager field name resolver ─────────────────────────────────────

let _cachedAmField: string | null | undefined;

async function resolveAmFieldName(host: string, creds: AtCreds): Promise<string | null> {
  if (_cachedAmField !== undefined) return _cachedAmField;
  try {
    const url = `${host}/atservicesrest/v1.0/Companies/entityInformation/fields`;
    crmLog(`→ GET ${url} (AM field name lookup)`);
    const r = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'UserName': creds.username,
        'Secret': creds.secret,
        'ApiIntegrationCode': creds.integrationCode,
      },
    });
    if (!r.ok) { _cachedAmField = null; return null; }
    const data = await r.json() as { fields?: Array<{ name: string }> };
    const match = data.fields?.find((f: { name: string }) => f.name.toLowerCase() === 'accountmanagerresourceid');
    _cachedAmField = match?.name ?? null;
    crmLog(`  AM field resolved to: ${_cachedAmField}`);
    return _cachedAmField;
  } catch {
    _cachedAmField = null;
    return null;
  }
}

// ─── GET /api/crm/picklist?entity=&field= ────────────────────────────────────

interface AtPicklistValue { value: number; label: string; isActive: boolean; isDefaultValue: boolean; }

async function fetchPicklist(creds: AtCreds, entity: string, fieldName: string): Promise<AtPicklistValue[]> {
  const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
  const url  = `${host}/atservicesrest/v1.0/${entity}/entityInformation/fields`;
  crmLog(`→ GET ${url} (picklist: ${entity}.${fieldName})`);
  const r = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'UserName': creds.username,
      'Secret': creds.secret,
      'ApiIntegrationCode': creds.integrationCode,
    },
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Autotask ${entity} fields (${r.status}): ${t.slice(0, 200)}`); }
  const data = await r.json() as { fields?: Array<{ name: string; picklistValues?: AtPicklistValue[] }> };
  const field = data.fields?.find((f: { name: string }) => f.name === fieldName);
  return field?.picklistValues ?? [];
}

router.get('/picklist', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json([]); return; }
    const entity    = ((req.query.entity    as string) ?? '').trim();
    const fieldName = ((req.query.field as string) ?? '').trim();
    if (!entity || !fieldName) { res.status(400).json({ error: 'entity and field are required' }); return; }
    const values = await fetchPicklist(creds, entity, fieldName);
    res.json(values);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// ─── POST /api/crm/create-ticket ─────────────────────────────────────────────
// Creates an incident ticket in the CON:Post Sale queue when a proposal is Won.

async function getQueueId(host: string, creds: AtCreds, queueName: string): Promise<number | null> {
  try {
    const url = `${host}/atservicesrest/v1.0/Tickets/entityInformation/fields`;
    crmLog(`→ GET ${url} (queue picklist lookup)`);
    const r = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'UserName': creds.username,
        'Secret': creds.secret,
        'ApiIntegrationCode': creds.integrationCode,
      },
    });
    if (!r.ok) { crmLog(`Queue lookup failed: ${r.status}`); return null; }
    const data = await r.json() as {
      fields?: Array<{ name: string; picklistValues?: Array<{ value: number; label: string; isActive: boolean }> }>;
    };
    const queueField = data.fields?.find((f: { name: string }) => f.name === 'queueID');
    const match = queueField?.picklistValues?.find(
      (v: { isActive: boolean; label: string }) => v.isActive && v.label.toLowerCase().includes(queueName.toLowerCase())
    );
    crmLog(`  Queue "${queueName}" resolved to ID: ${match?.value ?? 'not found'}`);
    return match?.value ?? null;
  } catch (e) {
    crmLog(`Queue lookup error: ${String(e)}`);
    return null;
  }
}

router.post('/create-ticket', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.status(400).json({ error: 'CRM not configured' }); return; }
    const { title, companyID, description } = req.body as {
      title?: string; companyID?: number; description?: string;
    };
    if (!title?.trim() || !companyID) {
      res.status(400).json({ error: 'title and companyID required' }); return;
    }
    const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');

    // Load ticket config from app settings (fall back to defaults if not configured)
    const s = await getAppSettingsDirect();
    const cfgQueueId      = s['crm.autotask.ticket.queueId']      ? parseInt(s['crm.autotask.ticket.queueId'])      : null;
    const cfgTicketTypeId = s['crm.autotask.ticket.ticketTypeId'] ? parseInt(s['crm.autotask.ticket.ticketTypeId']) : null;
    const cfgPriorityId   = s['crm.autotask.ticket.priorityId']   ? parseInt(s['crm.autotask.ticket.priorityId'])   : null;
    const cfgStatusId     = s['crm.autotask.ticket.statusId']      ? parseInt(s['crm.autotask.ticket.statusId'])      : null;

    // Resolve queue: use stored config or fall back to dynamic "Post Sale" lookup
    let queueId: number | null = cfgQueueId;
    if (!queueId) {
      queueId = await getQueueId(host, creds, 'Post Sale');
      if (!queueId) {
        res.status(400).json({
          error: 'Could not find a queue matching "Post Sale" in your Autotask tenant. ' +
                 'Configure a specific queue in Settings → CRM → Ticket Export, or ensure the ' +
                 'CON:Post Sale queue exists and the API user has permission to query it.',
        }); return;
      }
    }

    const url  = `${host}/atservicesrest/v1.0/Tickets`;
    const body: Record<string, unknown> = {
      title:       title.trim(),
      companyID,
      queueID:     queueId,
      status:      cfgStatusId   ?? 1,   // New
      priority:    cfgPriorityId ?? 3,   // Medium
      description: description ?? '',
      dueDateTime: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
    if (cfgTicketTypeId) body.ticketType = cfgTicketTypeId;
    crmLog(`→ POST ${url} (create ticket)`);
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
      throw new Error(`Autotask Tickets (${r.status}): ${text.slice(0, 300)}`);
    }
    const data = await r.json() as { itemId?: number };
    const ticketId = data.itemId;
    res.json({ ticketId, url: `${host}/Tickets/${ticketId}` });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
