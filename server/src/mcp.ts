/**
 * MCP (Model Context Protocol) server for ITRM PreSales.
 *
 * Exposes proposal, pipeline, catalog and contract data as MCP tools so
 * Microsoft Copilot (and any other MCP-compatible AI client) can query
 * live data in natural language.
 *
 * Transport: Streamable HTTP (stateful sessions).
 * Auth:      Service API key — set one in Settings → System and pass it
 *            as `Authorization: Bearer <key>` on every request.
 *
 * Mount point (added in index.ts): /mcp
 *
 * Copilot Studio connector:
 *   URL:   https://<your-host>/mcp
 *   Auth:  API key — key name: Authorization, key value: Bearer <key>
 */

import { McpServer }                      from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport }  from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router }                         from 'express';
import { z }                              from 'zod';
import { randomUUID }                     from 'crypto';

import { getAllProposals, getProposalById } from './repositories/proposalRepo';
import { getAllCatalogItems }              from './repositories/catalogRepo';
import { getAllRateCards }                 from './repositories/rateCardRepo';
import { getAppSettingsDirect }           from './repositories/settingsRepo';
import { verifyToken }                    from './shared/crypto';
import type { Proposal, SupportContract } from './types/index';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const DEV_BYPASS = !process.env.SESSION_SECRET;

async function checkServiceKey(token: string): Promise<boolean> {
  try {
    const cfg = await getAppSettingsDirect();
    // Check named multi-key list first
    const keysJson = (cfg['system.serviceApiKeys'] ?? '').trim();
    if (keysJson && keysJson !== '[]') {
      try {
        const keys = JSON.parse(keysJson) as Array<{ id: string; keyHash: string }>;
        for (const k of keys) {
          if (k.keyHash && await verifyToken(token, k.keyHash)) return true;
        }
      } catch { /* fall through */ }
    }
    // Legacy single key fallback
    const legacy = (cfg['system.serviceApiKey'] ?? '').trim();
    if (legacy && await verifyToken(token, legacy)) return true;
    return false;
  } catch { return false; }
}

// ─── Financial helpers ────────────────────────────────────────────────────────

const HOURS_PER_DAY = 8;
const PM_UPLIFT     = 1.2;

function calcProjectTotals(p: Proposal) {
  const currency = p.currency ?? 'GBP';
  const sym      = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  const fmt      = (n: number) => `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

  const partsSell = p.parts.reduce((s, pt) => s + pt.unitPrice * pt.quantity, 0);
  const markup    = partsSell * (p.markupPct / 100);

  const consultBase = p.phases
    .flatMap(ph => ph.tasks)
    .reduce((s, t) => {
      const mult = t.rateMultiplier ?? 1;
      return t.unit === 'hours'
        ? s + (t.days * HOURS_PER_DAY) * (t.dayRate / HOURS_PER_DAY) * mult
        : s + t.days * t.dayRate * mult;
    }, 0);
  const consultSell = consultBase * PM_UPLIFT;

  const discountVal = (p.consultancyDiscountAmount ?? 0) > 0
    ? p.consultancyDiscountType === 'percentage'
      ? consultSell * (p.consultancyDiscountAmount! / 100)
      : p.consultancyDiscountAmount!
    : 0;

  const grandTotal = partsSell + markup + (consultSell - discountVal);
  const partsCost  = p.parts.reduce((s, pt) => s + pt.unitCost * pt.quantity, 0);
  const gp         = grandTotal - partsCost - (consultBase * 0.7); // rough cost
  const gpPct      = grandTotal > 0 ? (gp / grandTotal) * 100 : 0;

  return { partsSell, markup, consultSell, grandTotal, gpPct: Math.round(gpPct), fmt };
}

function calcSupportMRR(sc: SupportContract): number {
  const discountedBase = sc.pricePerSeat * (1 - (sc.termDiscountPct ?? 0) / 100);
  const full   = discountedBase * sc.seats;
  const part   = discountedBase * 0.5 * (sc.partTimeSeats ?? 0);
  const addons = (sc.addOns ?? []).reduce(
    (s, a) => s + (a.priceType === 'per_seat' ? a.price * sc.seats : a.price), 0);
  return full + part + addons;
}

function fmtMoney(n: number, currency = 'GBP'): string {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  return `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

// ─── Proposal summaries ───────────────────────────────────────────────────────

interface ProposalSummary {
  id: string;
  projectName: string;
  client: string;
  status: string;
  type: string;
  accountManager: string;
  dateModified: string;
  currency: string;
  // project-specific
  grandTotal?: string;
  gpPct?: string;
  // support-specific
  mrr?: string;
  arr?: string;
  tcv?: string;
  term?: string;
}

function toSummary(p: Proposal): ProposalSummary {
  const type = p.proposalType ?? 'project';
  const base: ProposalSummary = {
    id: p.id,
    projectName: p.projectName,
    client: p.client,
    status: p.status,
    type,
    accountManager: p.accountManager ?? '',
    dateModified: p.dateModified,
    currency: p.currency,
  };

  if (type === 'support' && p.supportContract) {
    const sc   = p.supportContract;
    const mrr  = calcSupportMRR(sc);
    const term = sc.term === 12 ? '1 year' : sc.term === 36 ? '3 years' : '5 years';
    return {
      ...base,
      mrr:  fmtMoney(mrr, p.currency),
      arr:  fmtMoney(mrr * 12, p.currency),
      tcv:  fmtMoney(mrr * sc.term, p.currency),
      term,
    };
  }

  const { grandTotal, gpPct, fmt } = calcProjectTotals(p);
  return { ...base, grandTotal: fmt(grandTotal), gpPct: `${gpPct}%` };
}

function toDetail(p: Proposal): object {
  const summary = toSummary(p);
  const type    = p.proposalType ?? 'project';

  if (type === 'support' && p.supportContract) {
    const sc = p.supportContract;
    return {
      ...summary,
      contract: {
        supportHours: sc.supportHours,
        pricePerSeat: fmtMoney(sc.pricePerSeat, p.currency),
        seats: sc.seats,
        partTimeSeats: sc.partTimeSeats ?? 0,
        billingCycle: sc.billingCycle,
        termDiscountPct: sc.termDiscountPct ?? 0,
        onboardingCost: sc.onboardingCost ? fmtMoney(sc.onboardingCost, p.currency) : null,
        addOns: (sc.addOns ?? []).map(a => ({
          name: a.name,
          price: fmtMoney(a.price, p.currency),
          type: a.priceType,
        })),
      },
      notes: { objectives: p.objectives, businessRequirements: p.businessRequirements },
    };
  }

  const { fmt, partsSell, consultSell, grandTotal } = calcProjectTotals(p);
  return {
    ...summary,
    financials: {
      partsSell: fmt(partsSell),
      consultancySell: fmt(consultSell),
      grandTotal: fmt(grandTotal),
      markupPct: `${p.markupPct}%`,
      discount: (p.consultancyDiscountAmount ?? 0) > 0
        ? `${p.consultancyDiscountType === 'percentage' ? p.consultancyDiscountAmount + '%' : fmt(p.consultancyDiscountAmount!)} — ${p.consultancyDiscountNote ?? ''}`
        : null,
    },
    parts: p.parts.map(pt => ({
      description: pt.description,
      sku: pt.sku,
      qty: pt.quantity,
      unitPrice: fmt(pt.unitPrice),
    })),
    phases: p.phases.map(ph => ({
      name: ph.name,
      tasks: ph.tasks.map(t => ({
        name: t.name,
        role: t.role,
        days: t.days,
        unit: t.unit ?? 'days',
        rate: fmt(t.dayRate),
      })),
    })),
    notes: {
      objectives: p.objectives,
      businessRequirements: p.businessRequirements,
      justification: p.justification,
      constraints: p.constraints,
      notes: p.notes,
    },
  };
}

// ─── MCP server factory ───────────────────────────────────────────────────────

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name:    'itrm-presales',
    version: '1.0.0',
  });

  // ── 1. list_proposals ────────────────────────────────────────────────────
  server.registerTool('list_proposals', {
    description:
      'List proposals with optional filters. Returns summaries including status, ' +
      'client, account manager and key financials. Use this for pipeline views ' +
      'and status overviews.',
    inputSchema: {
      status:  z.string().optional().describe(
        'Filter by exact status: New, In Progress, Waiting Approval, Approved, ' +
        'Sent to Customer, Won, or Lost'),
      type:    z.enum(['project', 'support']).optional().describe(
        'project = one-off project proposals; support = managed service contracts'),
      client:  z.string().optional().describe('Partial client name to search for'),
      limit:   z.number().optional().describe('Maximum results (default 50)'),
    },
  }, async ({ status, type, client, limit = 50 }) => {
    let proposals = await getAllProposals();

    if (status) {
      const s = status.toLowerCase();
      proposals = proposals.filter(p => p.status.toLowerCase() === s);
    }
    if (type) {
      proposals = proposals.filter(p => (p.proposalType ?? 'project') === type);
    }
    if (client) {
      const c = client.toLowerCase();
      proposals = proposals.filter(p => p.client.toLowerCase().includes(c));
    }

    // Most recently modified first
    proposals.sort((a, b) =>
      new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime()
    );

    const items = proposals.slice(0, limit).map(toSummary);
    return {
      content: [{
        type:  'text',
        text:  JSON.stringify({ count: items.length, proposals: items }, null, 2),
      }],
    };
  });

  // ── 2. get_proposal ──────────────────────────────────────────────────────
  server.registerTool('get_proposal', {
    description:
      'Get full details of a single proposal by ID, including all parts, ' +
      'consultancy phases, financials and narrative fields.',
    inputSchema: {
      id: z.string().describe('Proposal UUID'),
    },
  }, async ({ id }) => {
    const p = await getProposalById(id);
    if (!p) {
      return { content: [{ type: 'text', text: `Proposal ${id} not found.` }], isError: true };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(toDetail(p), null, 2) }],
    };
  });

  // ── 3. search_proposals ──────────────────────────────────────────────────
  server.registerTool('search_proposals', {
    description:
      'Full-text search across proposal project names and client names. ' +
      'Returns matching summaries sorted by relevance (exact match first).',
    inputSchema: {
      query: z.string().describe('Search term — matched against project name and client'),
      limit: z.number().optional().describe('Maximum results (default 20)'),
    },
  }, async ({ query, limit = 20 }) => {
    const q = query.toLowerCase();
    const all = await getAllProposals();

    const exact  = all.filter(p =>
      p.projectName.toLowerCase() === q || p.client.toLowerCase() === q);
    const starts = all.filter(p =>
      !exact.includes(p) && (
        p.projectName.toLowerCase().startsWith(q) ||
        p.client.toLowerCase().startsWith(q)
      ));
    const contains = all.filter(p =>
      !exact.includes(p) && !starts.includes(p) && (
        p.projectName.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q)
      ));

    const results = [...exact, ...starts, ...contains].slice(0, limit).map(toSummary);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ query, count: results.length, proposals: results }, null, 2),
      }],
    };
  });

  // ── 4. get_pipeline_summary ──────────────────────────────────────────────
  server.registerTool('get_pipeline_summary', {
    description:
      'Returns a snapshot of the full sales pipeline: proposal counts and ' +
      'total values broken down by status stage. Also includes overall totals ' +
      'and a won/lost rate.',
  }, async () => {
    const all = await getAllProposals();

    const STAGES = [
      'New', 'In Progress', 'Waiting Approval',
      'Approved', 'Sent to Customer', 'Won', 'Lost',
    ];

    const byStage = STAGES.map(stage => {
      const proposals = all.filter(p => p.status === stage);
      const totalValue = proposals.reduce((s, p) => {
        if ((p.proposalType ?? 'project') === 'support' && p.supportContract) {
          return s + calcSupportMRR(p.supportContract) * 12; // ARR
        }
        return s + calcProjectTotals(p).grandTotal;
      }, 0);
      return {
        stage,
        count: proposals.length,
        value: fmtMoney(totalValue),
        valueRaw: totalValue,
      };
    });

    const active = byStage
      .filter(s => !['Won', 'Lost'].includes(s.stage))
      .reduce((s, b) => s + b.valueRaw, 0);
    const won  = byStage.find(s => s.stage === 'Won')!;
    const lost = byStage.find(s => s.stage === 'Lost')!;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          stages: byStage.map(({ valueRaw: _, ...s }) => s),
          summary: {
            activeProposals:  all.filter(p => !['Won','Lost'].includes(p.status)).length,
            activePipelineValue: fmtMoney(active),
            wonCount:  won.count,
            lostCount: lost.count,
            winRate: won.count + lost.count > 0
              ? `${Math.round((won.count / (won.count + lost.count)) * 100)}%`
              : 'n/a',
          },
        }, null, 2),
      }],
    };
  });

  // ── 5. list_support_contracts ────────────────────────────────────────────
  server.registerTool('list_support_contracts', {
    description:
      'List all support / managed-service proposals with their recurring ' +
      'revenue figures (MRR, ARR, TCV). Useful for recurring revenue ' +
      'reporting and contract renewals overview.',
    inputSchema: {
      status: z.string().optional().describe(
        'Filter by proposal status (e.g. "Won" for live contracts)'),
    },
  }, async ({ status }) => {
    let proposals = await getAllProposals();
    proposals = proposals.filter(p => (p.proposalType ?? 'project') === 'support');
    if (status) {
      const s = status.toLowerCase();
      proposals = proposals.filter(p => p.status.toLowerCase() === s);
    }

    const results = proposals.map(p => {
      const sc  = p.supportContract!;
      const mrr = calcSupportMRR(sc);
      return {
        id:             p.id,
        client:         p.client,
        projectName:    p.projectName,
        status:         p.status,
        accountManager: p.accountManager,
        term:           sc.term === 12 ? '1 year' : sc.term === 36 ? '3 years' : '5 years',
        seats:          sc.seats + (sc.partTimeSeats ?? 0),
        supportHours:   sc.supportHours ?? 'standard',
        billingCycle:   sc.billingCycle,
        mrr:  fmtMoney(mrr, p.currency),
        arr:  fmtMoney(mrr * 12, p.currency),
        tcv:  fmtMoney(mrr * sc.term, p.currency),
        onboarding: sc.onboardingCost ? fmtMoney(sc.onboardingCost, p.currency) : null,
        addOns: (sc.addOns ?? []).map(a => a.name),
        commencementDate: sc.commencementDate ?? null,
      };
    });

    const totalMRR = proposals.reduce((s, p) =>
      s + (p.supportContract ? calcSupportMRR(p.supportContract) : 0), 0);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count:    results.length,
          totalMRR: fmtMoney(totalMRR),
          totalARR: fmtMoney(totalMRR * 12),
          contracts: results,
        }, null, 2),
      }],
    };
  });

  // ── 6. get_financial_summary ─────────────────────────────────────────────
  server.registerTool('get_financial_summary', {
    description:
      'Returns high-level financial metrics across the entire proposal book: ' +
      'total pipeline value, won revenue, active MRR from support contracts, ' +
      'and average deal size.',
  }, async () => {
    const all = await getAllProposals();

    let pipelineValue = 0, wonValue = 0, supportMRR = 0;
    const activeStatuses = ['In Progress','Waiting Approval','Approved','Sent to Customer'];

    for (const p of all) {
      const isSupport = (p.proposalType ?? 'project') === 'support';
      const value = isSupport && p.supportContract
        ? calcSupportMRR(p.supportContract) * 12
        : calcProjectTotals(p).grandTotal;

      if (activeStatuses.includes(p.status)) pipelineValue += value;
      if (p.status === 'Won') {
        wonValue += value;
        if (isSupport && p.supportContract) {
          supportMRR += calcSupportMRR(p.supportContract);
        }
      }
    }

    const activeCount = all.filter(p => activeStatuses.includes(p.status)).length;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          activePipelineValue: fmtMoney(pipelineValue),
          activeProposalCount: activeCount,
          averageDealSize:     activeCount > 0 ? fmtMoney(pipelineValue / activeCount) : '£0',
          wonTotalRevenue:     fmtMoney(wonValue),
          wonProposalCount:    all.filter(p => p.status === 'Won').length,
          lostProposalCount:   all.filter(p => p.status === 'Lost').length,
          activeSupportMRR:    fmtMoney(supportMRR),
          activeSupportARR:    fmtMoney(supportMRR * 12),
          supportContractCount: all.filter(p =>
            p.status === 'Won' && (p.proposalType ?? 'project') === 'support').length,
        }, null, 2),
      }],
    };
  });

  // ── 7. list_proposals_for_client ─────────────────────────────────────────
  server.registerTool('list_proposals_for_client', {
    description:
      'Returns all proposals (any status) associated with a named client. ' +
      'Use this for account reviews and renewal planning.',
    inputSchema: {
      client: z.string().describe('Client name — partial match supported'),
    },
  }, async ({ client }) => {
    const c = client.toLowerCase();
    const matched = (await getAllProposals())
      .filter(p => p.client.toLowerCase().includes(c))
      .sort((a, b) => new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime());

    const clients = [...new Set(matched.map(p => p.client))];
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          matchedClients: clients,
          count: matched.length,
          proposals: matched.map(toSummary),
        }, null, 2),
      }],
    };
  });

  // ── 8. get_catalog_items ─────────────────────────────────────────────────
  server.registerTool('get_catalog_items', {
    description:
      'Search the product/service catalog. Returns item descriptions, ' +
      'SKUs, list prices and vendor information.',
    inputSchema: {
      search: z.string().optional().describe(
        'Partial match on description, SKU or vendor name'),
      limit:  z.number().optional().describe('Maximum results (default 50)'),
    },
  }, async ({ search, limit = 50 }) => {
    let items = await getAllCatalogItems();
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(i =>
        i.description.toLowerCase().includes(s) ||
        (i.sku ?? '').toLowerCase().includes(s) ||
        (i.defaultVendor ?? '').toLowerCase().includes(s)
      );
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: items.length,
          items: items.slice(0, limit).map(i => ({
            id:          i.id,
            description: i.description,
            sku:         i.sku,
            vendor:      i.defaultVendor,
            listPrice:   fmtMoney(i.listPrice),
            category:    i.category,
            isSupportAddon: i.isSupportAddon,
          })),
        }, null, 2),
      }],
    };
  });

  // ── 9. get_rate_cards ────────────────────────────────────────────────────
  server.registerTool('get_rate_cards', {
    description:
      'Returns all consultancy rate cards — roles, sell rates and cost rates. ' +
      'Use this when asked about day rates, consultancy pricing or staffing costs.',
  }, async () => {
    const rcs = await getAllRateCards();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: rcs.length,
          rateCards: rcs.map(rc => ({
            role:           rc.role,
            sellRatePerDay: fmtMoney(rc.sellRate),
            costRatePerDay: fmtMoney(rc.costRate),
            marginPct:      rc.sellRate > 0
              ? `${Math.round(((rc.sellRate - rc.costRate) / rc.sellRate) * 100)}%`
              : 'n/a',
            overtimeEnabled: rc.overtimeEnabled,
          })),
        }, null, 2),
      }],
    };
  });

  // ── 10. get_recent_activity ──────────────────────────────────────────────
  server.registerTool('get_recent_activity', {
    description:
      'Returns the most recently modified proposals — useful for a daily ' +
      'briefing or "what changed today" query.',
    inputSchema: {
      limit: z.number().optional().describe('Number of proposals to return (default 10)'),
      days:  z.number().optional().describe(
        'Only include proposals modified within this many days (default: no limit)'),
    },
  }, async ({ limit = 10, days }) => {
    let proposals = await getAllProposals();

    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      proposals = proposals.filter(p =>
        new Date(p.dateModified) >= cutoff
      );
    }

    proposals.sort((a, b) =>
      new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime()
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: Math.min(proposals.length, limit),
          asOf:  new Date().toISOString(),
          proposals: proposals.slice(0, limit).map(p => ({
            ...toSummary(p),
            lastModifiedBy: p.lastModifiedBy,
          })),
        }, null, 2),
      }],
    };
  });

  return server;
}

// ─── Session store ────────────────────────────────────────────────────────────

interface McpSession {
  server:    McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, McpSession>();

function isInitializeRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null &&
    'method' in body &&
    (body as { method: unknown }).method === 'initialize'
  );
}

// ─── Express router ───────────────────────────────────────────────────────────

export function createMcpRouter(): Router {
  const router = Router();

  // ── Authentication middleware ──────────────────────────────────────────
  router.use(async (req, res, next) => {
    if (DEV_BYPASS) return next();

    const header = req.headers.authorization;
    const token  = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token || !(await checkServiceKey(token))) {
      res.status(401).json({
        jsonrpc: '2.0', id: null,
        error: { code: -32001, message: 'Unauthorized — provide a valid service API key as Bearer token' },
      });
      return;
    }
    next();
  });

  // ── POST /mcp — initialize + tool calls ───────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId) {
        // Existing session — route to its transport
        const session = sessions.get(sessionId);
        if (!session) {
          res.status(404).json({
            jsonrpc: '2.0', id: null,
            error: { code: -32001, message: `Session ${sessionId} not found or expired` },
          });
          return;
        }
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        // Non-initialise request with no session — reject
        res.status(400).json({
          jsonrpc: '2.0', id: null,
          error: { code: -32000, message: 'Bad Request: include Mcp-Session-Id header or send an initialize request' },
        });
        return;
      }

      // New session
      const mcpServer = buildMcpServer();
      let newSessionId = '';

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          newSessionId = id;
          sessions.set(id, { server: mcpServer, transport });
          console.log(`[mcp] Session opened: ${id} (active: ${sessions.size})`);
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
          console.log(`[mcp] Session closed: ${id} (active: ${sessions.size})`);
        },
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('[mcp] POST error:', e);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0', id: null,
          error: { code: -32603, message: 'Internal server error' },
        });
      }
    }
  });

  // ── GET /mcp — SSE stream for ongoing notifications ───────────────────
  router.get('/', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing Mcp-Session-Id header' }); return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: `Session ${sessionId} not found` }); return;
    }
    try {
      await session.transport.handleRequest(req, res);
    } catch (e) {
      console.error('[mcp] GET/SSE error:', e);
      if (!res.headersSent) res.status(500).end();
    }
  });

  // ── DELETE /mcp — explicit session teardown ───────────────────────────
  router.delete('/', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing Mcp-Session-Id header' }); return;
    }
    const session = sessions.get(sessionId);
    if (session) {
      try { await session.transport.close(); } catch { /* already closed */ }
      sessions.delete(sessionId);
    }
    res.status(204).end();
  });

  // ── GET /mcp/health — liveness probe (no auth) ────────────────────────
  router.get('/health', (_req, res) => {
    res.json({
      status:       'ok',
      server:       'itrm-presales-mcp',
      version:      '1.0.0',
      activeSessions: sessions.size,
      timestamp:    new Date().toISOString(),
    });
  });

  return router;
}
