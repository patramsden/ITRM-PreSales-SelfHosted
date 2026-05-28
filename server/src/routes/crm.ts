import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAppSettingsDirect } from '../repositories/settingsRepo';
import { getProposalById, updateProposal as updateProposalRepo } from '../repositories/proposalRepo';
import { log } from '../shared/logger';

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

// ─── Autotask web UI URL helper ───────────────────────────────────────────────
function atWebUrl(apiHost: string, ticketId: number): string {
  const webHost = apiHost.replace(/webservices(\d+)/i, 'ww$1');
  return `${webHost}/Autotask/views/ticket/viewticket.aspx?ticketID=${ticketId}`;
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

// ─── GET /crm/company-address?id= ────────────────────────────────────────────

router.get('/company-address', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json({}); return; }
    const id = parseInt((req.query.id as string) ?? '');
    if (isNaN(id)) { res.status(400).json({ error: 'id required' }); return; }

    const companies = await atQuery<Record<string, unknown>>(
      creds, 'Companies',
      [{ field: 'id', op: 'eq', value: id }],
      undefined, 1
    );
    if (!companies[0]) { res.json({}); return; }

    const raw = companies[0];
    const getField = (...names: string[]): string | undefined => {
      for (const name of names) {
        const key = Object.keys(raw).find(k => k.toLowerCase() === name.toLowerCase());
        if (key && raw[key]) return String(raw[key]);
      }
      return undefined;
    };

    res.json({
      address1:   getField('address1'),
      address2:   getField('address2'),
      city:       getField('city'),
      state:      getField('state'),
      postalCode: getField('postalCode', 'zipCode', 'postalcode', 'zipcode'),
      country:    getField('country', 'countryID'),
    });
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

    // Load panel config from settings
    const appSettings = await getAppSettingsDirect();
    const configuredQueueIds = (appSettings['crm.tickets.queueIds'] ?? '')
      .split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));
    const daysBack = parseInt(appSettings['crm.tickets.daysBack'] ?? '90') || 90;

    let queueIds: number[] = configuredQueueIds;
    let queueMap:  Record<number, string> = {};
    let statusMap: Record<number, string> = {};
    try {
      const [queueValues, statusValues] = await Promise.all([
        fetchPicklist(creds, 'Tickets', 'queueID'),
        fetchPicklist(creds, 'Tickets', 'status'),
      ]);
      queueMap  = Object.fromEntries(queueValues.map((v: AtPicklistValue) => [v.value, v.label]));
      statusMap = Object.fromEntries(statusValues.map((v: AtPicklistValue) => [v.value, v.label]));
      if (queueIds.length === 0) {
        const targets = queueValues.filter((v: AtPicklistValue) =>
          v.isActive && CUSTOMER_INTEL_QUEUES.some(n => v.label.toLowerCase().includes(n.toLowerCase()))
        );
        queueIds = targets.map((v: AtPicklistValue) => v.value);
        crmLog(`  Queues resolved by name: ${targets.map((v: AtPicklistValue) => `${v.label}=${v.value}`).join(', ')}`);
      } else {
        crmLog(`  Queues from settings: ${queueIds.join(', ')}`);
      }
    } catch (e) { crmLog(`  Picklist error: ${String(e)}`); }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const filter: unknown[] = [
      { field: 'companyID',  op: 'eq',  value: companyId },
      { field: 'createDate', op: 'gte', value: cutoff.toISOString() },
    ];
    if (queueIds.length > 0) filter.push({ field: 'queueID', op: 'in', value: queueIds });

    const raw = await atQuery<Record<string, unknown>>(creds, 'Tickets', filter, undefined, 25);
    crmLog(`  Tickets returned: ${raw.length}`);
    if (raw.length === 0) { res.json([]); return; }

    const getField = (r: Record<string, unknown>, ...names: string[]): unknown => {
      for (const name of names) {
        const key = Object.keys(r).find(k => k.toLowerCase() === name.toLowerCase());
        if (key !== undefined) return r[key];
      }
      return undefined;
    };

    const tickets = raw
      .map(r => ({
        id:           getField(r, 'id') as number,
        ticketNumber: (getField(r, 'ticketNumber', 'number', 'ticketNo') as string | null) ?? null,
        title:        (getField(r, 'title') as string) ?? '(no title)',
        statusNum:    getField(r, 'status') as number,
        queueNum:     getField(r, 'queueID', 'queueId') as number,
        createDate:   (getField(r, 'createDate', 'createDateTime') as string | null) ?? null,
      }))
      .sort((a, b) => new Date(b.createDate ?? 0).getTime() - new Date(a.createDate ?? 0).getTime())
      .map(t => ({
        id:           t.id,
        ticketNumber: t.ticketNumber,
        title:        t.title,
        status:       statusMap[t.statusNum] ?? `Status ${t.statusNum}`,
        queue:        queueMap[t.queueNum]   ?? `Queue ${t.queueNum}`,
        createDate:   t.createDate,
        url:          atWebUrl(host, t.id),
      }));

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
// Prefer /api/crm/picklists-batch when fetching multiple fields from the
// same entity — it hits Autotask only once instead of once per field.

interface AtPicklistValue { value: number; label: string; isActive: boolean; isDefaultValue: boolean; }

type EntityFieldsResult = Array<{ name: string; picklistValues?: AtPicklistValue[] }>;

// In-process cache: prevents concurrent requests hitting the 3-thread limit
const _fieldsCache = new Map<string, { fields: EntityFieldsResult; expiresAt: number }>();
const _fieldsPending = new Map<string, Promise<EntityFieldsResult>>();
const FIELDS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchEntityFields(creds: AtCreds, entity: string): Promise<EntityFieldsResult> {
  const cacheKey = `${creds.username}::${entity}`;

  const cached = _fieldsCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.fields;

  const pending = _fieldsPending.get(cacheKey);
  if (pending) return pending;

  const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
  const url  = `${host}/atservicesrest/v1.0/${entity}/entityInformation/fields`;
  crmLog(`→ GET ${url} (entity fields cache miss)`);

  const promise = fetch(url, {
    headers: {
      'Content-Type':       'application/json',
      'UserName':           creds.username,
      'Secret':             creds.secret,
      'ApiIntegrationCode': creds.integrationCode,
    },
  }).then(async r => {
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Autotask ${entity} fields (${r.status}): ${t.slice(0, 300)}`);
    }
    const data = await r.json() as { fields?: EntityFieldsResult };
    const fields = data.fields ?? [];
    _fieldsCache.set(cacheKey, { fields, expiresAt: Date.now() + FIELDS_CACHE_TTL_MS });
    return fields;
  }).finally(() => {
    _fieldsPending.delete(cacheKey);
  });

  _fieldsPending.set(cacheKey, promise);
  return promise;
}

async function fetchPicklist(creds: AtCreds, entity: string, fieldName: string): Promise<AtPicklistValue[]> {
  const fields = await fetchEntityFields(creds, entity);
  const field  = fields.find(f => f.name === fieldName);
  return field?.picklistValues ?? [];
}

router.get('/picklist', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json([]); return; }
    const entity    = ((req.query.entity as string) ?? '').trim();
    const fieldName = ((req.query.field  as string) ?? '').trim();
    if (!entity || !fieldName) { res.status(400).json({ error: 'entity and field are required' }); return; }
    const values = await fetchPicklist(creds, entity, fieldName);
    res.json(values);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// ─── GET /api/crm/picklists-batch?entity=&fields=f1,f2,f3 ────────────────────
// Fetches multiple picklists for one entity in a single Autotask API call.

router.get('/picklists-batch', requireAuth, async (req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json({}); return; }
    const entity      = ((req.query.entity as string) ?? '').trim();
    const fieldsParam = ((req.query.fields as string) ?? '').trim();
    if (!entity || !fieldsParam) { res.status(400).json({ error: 'entity and fields are required' }); return; }
    const fieldNames  = fieldsParam.split(',').map((f: string) => f.trim()).filter(Boolean);
    const allFields   = await fetchEntityFields(creds, entity);
    const result: Record<string, AtPicklistValue[]> = {};
    for (const name of fieldNames) {
      const field = allFields.find(f => f.name === name);
      result[name] = field?.picklistValues ?? [];
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// ─── Opportunity creation ─────────────────────────────────────────────────────

// Per-name cache for account manager resource ID lookups (10 min TTL).
const _amResourceIdCache = new Map<string, { id: number; expiresAt: number }>();

/** Looks up the Autotask Resource ID for a given full name (e.g. "Jane Smith").
 *  Splits into firstName / lastName and queries the Resources entity. */
async function getResourceIdForAccountManager(creds: AtCreds, fullName: string): Promise<number | null> {
  const key = fullName.trim().toLowerCase();
  const cached = _amResourceIdCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.id;

  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) {
    crmLog(`Cannot resolve resource ID: "${fullName}" is not a full name`);
    return null;
  }
  const firstName = parts[0];
  const lastName  = parts.slice(1).join(' ');

  try {
    crmLog(`→ Resource lookup for "${firstName} ${lastName}"`);
    const items = await atQuery<{ id: number }>(
      creds, 'Resources',
      [
        { field: 'firstName', op: 'eq', value: firstName },
        { field: 'lastName',  op: 'eq', value: lastName  },
      ],
      ['id'], 1,
    );
    const id = items[0]?.id ?? null;
    if (id) {
      crmLog(`  Resolved resource ID for "${fullName}": ${id}`);
      _amResourceIdCache.set(key, { id, expiresAt: Date.now() + 10 * 60 * 1000 });
    } else {
      crmLog(`  No Resource found for "${fullName}"`);
      log('warn', 'crm', `No Autotask Resource found for account manager "${fullName}" — ensure they are an active resource in Autotask`);
    }
    return id;
  } catch (e) {
    crmLog(`Resource lookup error for "${fullName}": ${String(e)}`);
    return null;
  }
}

function atOpportunityWebUrl(apiHost: string, oppId: number): string {
  const webHost = apiHost.replace(/webservices(\d+)/i, 'ww$1');
  return `${webHost}/Autotask/views/opportunity/viewopportunity.aspx?opportunityID=${oppId}`;
}

/** Called by proposals.ts after a new proposal is saved.
 *  Returns null when feature is disabled or no company linked (silent skip).
 *  Throws a descriptive Error for any condition the user should fix. */
export async function maybeCreateOpportunity(
  proposalId: string,
  projectName: string,
  client: string,
  accountManager: string,
  crmCompanyId: string | undefined,
): Promise<{ opportunityId: string; url: string } | null> {
  const s = await getAppSettingsDirect();
  if (s['crm.autotask.opportunity.enabled'] !== 'true') return null;
  if (!crmCompanyId) return null;

  const creds = await getCreds();
  if (!creds) throw new Error('Autotask credentials are not configured — check Settings → CRM');

  const stageId = s['crm.autotask.opportunity.stageId'] ? parseInt(s['crm.autotask.opportunity.stageId']) : null;
  if (!stageId) {
    log('warn', 'crm', `Opportunity creation skipped for "${projectName}": no stage configured`, { details: { proposalId } });
    throw new Error('No opportunity stage configured — select one in Settings → CRM → Opportunity');
  }

  const probability   = parseInt(s['crm.autotask.opportunity.probability']   ?? '50');
  const closeDateDays = parseInt(s['crm.autotask.opportunity.closeDateDays'] ?? '30');
  const titleTemplate = (s['crm.autotask.opportunity.titleTemplate'] ?? '{projectName}').trim() || '{projectName}';
  const title = titleTemplate
    .replace('{projectName}', projectName)
    .replace('{client}', client)
    .replace('{accountManager}', accountManager || '');

  const ownerResourceID = accountManager
    ? await getResourceIdForAccountManager(creds, accountManager)
    : null;
  if (!ownerResourceID) {
    const who = accountManager || 'account manager';
    log('warn', 'crm', `Opportunity creation skipped for "${projectName}": could not resolve resource ID for "${who}"`, { details: { proposalId, accountManager } });
    throw new Error(`Could not find an Autotask Resource record for "${who}" — ensure they are an active resource in Autotask`);
  }

  const closeDate = new Date(Date.now() + closeDateDays * 86400000).toISOString();
  const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
  const body = {
    accountID: parseInt(crmCompanyId), title, ownerResourceID,
    stage: stageId, status: 1, probability: isNaN(probability) ? 50 : probability, closeDate,
  };

  crmLog(`→ POST ${host}/atservicesrest/v1.0/Opportunities (proposal ${proposalId})`);
  const r = await fetch(`${host}/atservicesrest/v1.0/Opportunities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'UserName': creds.username, 'Secret': creds.secret, 'ApiIntegrationCode': creds.integrationCode },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => r.statusText);
    const msg = `Autotask API error ${r.status}: ${t.slice(0, 300)}`;
    log('warn', 'crm', `Opportunity creation failed for "${projectName}": ${msg}`, { details: { proposalId, crmCompanyId } });
    throw new Error(msg);
  }

  const data = await r.json() as { itemId?: number };
  const opportunityId = data.itemId;
  if (!opportunityId) {
    log('warn', 'crm', `Opportunity creation returned no itemId for "${projectName}"`, { details: { proposalId } });
    throw new Error('Autotask returned no opportunity ID — the record may not have been created');
  }

  crmLog(`  Opportunity created: ID ${opportunityId}`);
  return { opportunityId: String(opportunityId), url: atOpportunityWebUrl(host, opportunityId) };
}

/** Called by proposals.ts on every PUT.
 *  PATCHes the linked Autotask opportunity's title (and amount if provided).
 *  Silent on failure — never throws. */
export async function maybeUpdateOpportunity(
  opportunityId: string,
  projectName: string,
  client: string,
  accountManager: string,
  amount?: number,
): Promise<void> {
  try {
    const s = await getAppSettingsDirect();
    if (s['crm.autotask.opportunity.enabled'] !== 'true') return;
    const creds = await getCreds();
    if (!creds) return;
    const titleTemplate = (s['crm.autotask.opportunity.titleTemplate'] ?? '{projectName}').trim() || '{projectName}';
    const title = titleTemplate
      .replace('{projectName}', projectName)
      .replace('{client}', client)
      .replace('{accountManager}', accountManager || '');
    const host = creds.zoneUrl.replace(/\/atservicesrest.*$/i, '').replace(/\/$/, '');
    const body: Record<string, unknown> = { id: parseInt(opportunityId, 10), title };
    if (amount !== undefined && amount > 0) body.amount = amount;
    crmLog(`→ PATCH ${host}/atservicesrest/v1.0/Opportunities (update ID ${opportunityId})`);
    const r = await fetch(`${host}/atservicesrest/v1.0/Opportunities`, {
      method: 'PATCH',
      headers: {
        'Content-Type':       'application/json',
        'UserName':           creds.username,
        'Secret':             creds.secret,
        'ApiIntegrationCode': creds.integrationCode,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => r.statusText);
      crmLog(`Opportunity update failed (${r.status}): ${t.slice(0, 300)}`);
    } else {
      crmLog(`  Opportunity ${opportunityId} updated`);
    }
  } catch (e) {
    crmLog(`Opportunity update error: ${String(e)}`);
  }
}

router.post('/create-opportunity', requireAuth, async (req, res) => {
  try {
    const { proposalId, projectName, client, accountManager, crmCompanyId } = req.body as {
      proposalId?: string; projectName?: string; client?: string; accountManager?: string; crmCompanyId?: string;
    };
    if (!projectName?.trim() || !crmCompanyId) { res.status(400).json({ error: 'projectName and crmCompanyId are required' }); return; }
    const result = await maybeCreateOpportunity(proposalId ?? '', projectName, client ?? '', accountManager ?? '', crmCompanyId);
    if (!result) { res.status(400).json({ error: 'Opportunity creation failed — check CRM configuration (Settings → CRM)' }); return; }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// ─── POST /api/crm/sync-opportunity ──────────────────────────────────────────
// Called by the frontend Save button and on proposal exit.
// Looks up the proposal in DB, then creates or updates the linked opportunity.

router.post('/sync-opportunity', requireAuth, async (req, res) => {
  try {
    const body = req.body as {
      proposalId?: string;
      projectName?: string;
      client?: string;
      accountManager?: string;
      crmCompanyId?: string;
      atOpportunityId?: string;
    };
    if (!body.proposalId) { res.status(400).json({ error: 'proposalId is required' }); return; }

    // Merge DB record with fresher values from the request body
    const dbProposal = await getProposalById(body.proposalId);
    if (!dbProposal) { res.sendStatus(404); return; }

    const projectName     = body.projectName     ?? dbProposal.projectName     ?? '';
    const client          = body.client          ?? dbProposal.client          ?? '';
    const accountManager  = body.accountManager  ?? dbProposal.accountManager  ?? '';
    const crmCompanyId    = body.crmCompanyId    ?? dbProposal.crmCompanyId;
    const atOpportunityId = body.atOpportunityId ?? dbProposal.atOpportunityId;

    if (atOpportunityId) {
      await maybeUpdateOpportunity(atOpportunityId, projectName, client, accountManager);
      log('info', 'crm', `Opportunity ${atOpportunityId} synced for proposal "${projectName}"`);
      res.json({ opportunityId: atOpportunityId, url: dbProposal.atOpportunityUrl ?? '' });
      return;
    }

    if (!crmCompanyId) {
      log('warn', 'crm', `Sync skipped for proposal "${projectName}" — no CRM company linked`, { details: { proposalId: body.proposalId } });
      res.status(400).json({ error: 'Proposal has no CRM company linked — set one on the Summary tab first' });
      return;
    }

    let opp: { opportunityId: string; url: string } | null;
    try {
      opp = await maybeCreateOpportunity(body.proposalId, projectName, client, accountManager, crmCompanyId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ error: msg }); return;
    }
    if (!opp) {
      res.status(400).json({ error: 'Opportunity feature is disabled — enable it in Settings → CRM → Opportunity' }); return;
    }

    await updateProposalRepo(body.proposalId, { ...dbProposal, atOpportunityId: opp.opportunityId, atOpportunityUrl: opp.url });
    log('info', 'crm', `Opportunity created for proposal "${projectName}"`, { details: { proposalId: body.proposalId, opportunityId: opp.opportunityId } });
    res.json(opp);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

router.get('/opportunity-stages', requireAuth, async (_req, res) => {
  try {
    const creds = await getCreds();
    if (!creds) { res.json([]); return; }
    const values = await fetchPicklist(creds, 'Opportunities', 'stage');
    res.json(values.filter((v: AtPicklistValue) => v.isActive));
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
    res.json({ ticketId, url: atWebUrl(host, ticketId as number) });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
