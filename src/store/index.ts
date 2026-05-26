import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type {
  Proposal, Template, CatalogItem, RateCard, User,
  ProposalStatus, Currency, Part, ConsultancyPhase,
} from '../types';
import { computeReviewFingerprint, financiallyChangedSince } from '../utils/reviewFingerprint';

// ─── Seed data ───────────────────────────────────────────────────────────────

export const SEED_USERS: User[] = [
  { id: 'u1', name: 'Pat Ramsden',  email: 'pat.ramsden@company.com',  department: 'PreSales',   appRole: 'admin', authProvider: 'local' },
  { id: 'u2', name: 'Sarah Chen',   email: 'sarah.chen@company.com',   department: 'PreSales',   appRole: 'presales',    authProvider: 'local' },
  { id: 'u3', name: 'James Wright', email: 'james.wright@company.com', department: 'Sales',      appRole: 'sales',       authProvider: 'local' },
  { id: 'u4', name: 'Priya Patel',  email: 'priya.patel@company.com',  department: 'PreSales',   appRole: 'presales',    authProvider: 'local' },
  { id: 'u5', name: 'Tom Nguyen',   email: 'tom.nguyen@company.com',   department: 'Management', appRole: 'admin',       authProvider: 'local' },
  { id: 'u6', name: 'Laura Singh',  email: 'laura.singh@company.com',  department: 'Finance',    appRole: 'sales_admin', authProvider: 'local' },
  { id: 'u7', name: 'David Okafor', email: 'david.okafor@company.com', department: 'Sales',      appRole: 'sales',       authProvider: 'local' },
];

const SEED_PROPOSALS: Proposal[] = [
  {
    id: 'p1',
    projectName: 'Network Refresh – Acme Corp',
    client: 'Acme Corporation',
    accountManager: 'James Wright',
    status: 'Approved',
    currency: 'GBP',
    dateCreated: '2026-03-10',
    dateModified: '2026-04-02',
    ticketRef: 'CRM-1042',
    markupPct: 15,
    objectives: 'Upgrade ageing core switching and firewall estate to support 10Gb distribution.',
    businessRequirements: 'Zero downtime cutover, full HA across two data centres.',
    justification: 'Current equipment is end-of-life and support contract expires in Q3.',
    constraints: 'Works must be completed outside business hours.',
    assumptions: 'Customer will provide out-of-hours access to server rooms.',
    notes: 'Preferred vendor is Cisco, but open to Juniper alternative.',
    ownerId: 'u2',
    collaboratorIds: ['u4'],
    parts: [
      {
        id: 'pt1', description: 'Cisco Catalyst 9300 48-port', sku: 'C9300-48P-A',
        quantity: 4, unitCost: 8200, unitPrice: 10500, partType: 'Hardware' as const,
        quotes: [
          { id: 'q1', vendor: 'Ingram Micro', reference: 'IM-2026-4421', cost: 8200, validUntil: '2026-06-30', selected: true },
          { id: 'q2', vendor: 'TD Synnex', reference: 'TDS-89201', cost: 8450, validUntil: '2026-06-15', selected: false },
        ],
      },
      {
        id: 'pt2', description: 'Cisco Firepower 2140', sku: 'FPR2140-NGFW-K9',
        quantity: 2, unitCost: 22000, unitPrice: 28000, partType: 'Hardware' as const,
        quotes: [
          { id: 'q3', vendor: 'Ingram Micro', reference: 'IM-2026-4422', cost: 22000, validUntil: '2026-06-30', selected: true },
        ],
      },
    ],
    phases: [
      {
        id: 'ph1', name: 'Discovery & Design',
        tasks: [
          { id: 't1', name: 'Network audit', role: 'Network Architect', days: 3, dayRate: 1200 },
          { id: 't2', name: 'HLD / LLD production', role: 'Network Architect', days: 5, dayRate: 1200 },
        ],
      },
      {
        id: 'ph2', name: 'Build & Test',
        tasks: [
          { id: 't3', name: 'Lab build and test', role: 'Senior Network Engineer', days: 4, dayRate: 950 },
          { id: 't4', name: 'Pre-staging config', role: 'Senior Network Engineer', days: 2, dayRate: 950 },
        ],
      },
      {
        id: 'ph3', name: 'Cutover',
        tasks: [
          { id: 't5', name: 'On-site cutover (x2 nights)', role: 'Senior Network Engineer', days: 2, dayRate: 950 },
          { id: 't6', name: 'Post-migration validation', role: 'Network Engineer', days: 1, dayRate: 750 },
        ],
      },
    ],
    sowContent: '',
    plannerUrl: '',
  },
  {
    id: 'p2',
    projectName: 'M365 Migration – TechStart Ltd',
    client: 'TechStart Limited',
    accountManager: 'David Okafor',
    status: 'In Progress',
    currency: 'GBP',
    dateCreated: '2026-04-15',
    dateModified: '2026-05-08',
    ticketRef: 'CRM-1089',
    markupPct: 12,
    objectives: 'Migrate 250 users from on-prem Exchange and file shares to Microsoft 365.',
    businessRequirements: 'Minimal disruption to end users; phased approach by department.',
    justification: 'Reduce on-prem infrastructure cost and enable remote working.',
    constraints: 'GDPR compliance required for all data movements.',
    assumptions: 'Customer has active Azure AD tenant.',
    notes: '',
    ownerId: 'u2',
    collaboratorIds: [],
    parts: [
      {
        id: 'pt3', description: 'Microsoft 365 Business Premium (annual, per user)',
        sku: 'AAA-10624', quantity: 250, unitCost: 18.00, unitPrice: 22.00, partType: 'Annual' as const,
        quotes: [
          { id: 'q4', vendor: 'Microsoft CSP', reference: 'CSP-26042', cost: 18.00, validUntil: '2026-12-31', selected: true },
        ],
      },
    ],
    phases: [
      {
        id: 'ph4', name: 'Assessment',
        tasks: [
          { id: 't7', name: 'Environment assessment', role: 'Modern Workplace Consultant', days: 2, dayRate: 1100 },
        ],
      },
      {
        id: 'ph5', name: 'Migration',
        tasks: [
          { id: 't8', name: 'Email migration (batched)', role: 'Modern Workplace Engineer', days: 8, dayRate: 850 },
          { id: 't9', name: 'SharePoint provisioning', role: 'Modern Workplace Engineer', days: 4, dayRate: 850 },
          { id: 't10', name: 'Teams adoption workshop', role: 'Modern Workplace Consultant', days: 2, dayRate: 1100 },
        ],
      },
    ],
    sowContent: '',
  },
  {
    id: 'p3',
    projectName: 'SD-WAN Rollout – GlobalBev',
    client: 'GlobalBev PLC',
    accountManager: 'Sarah Chen',
    status: 'Won',
    currency: 'GBP',
    dateCreated: '2026-01-20',
    dateModified: '2026-03-01',
    ticketRef: 'CRM-0981',
    markupPct: 18,
    objectives: 'Replace MPLS with SD-WAN across 12 UK sites.',
    businessRequirements: 'SLA of 99.9% uptime per site; dual-ISP failover.',
    justification: 'MPLS renewal cost prohibitive; SD-WAN reduces WAN opex by ~40%.',
    constraints: 'Go-live before Q2 start.',
    assumptions: 'ISP circuits already ordered by customer.',
    notes: 'Won – reference opportunity for similar manufacturing clients.',
    ownerId: 'u1',
    collaboratorIds: ['u2', 'u4'],
    parts: [],
    phases: [],
    sowContent: '',
  },
  {
    id: 'p4',
    projectName: 'Security Assessment – FinCo',
    client: 'FinCo Services',
    accountManager: 'Priya Patel',
    status: 'Lost',
    currency: 'GBP',
    dateCreated: '2026-02-05',
    dateModified: '2026-03-20',
    ticketRef: 'CRM-1010',
    markupPct: 10,
    objectives: 'External penetration test and vulnerability assessment.',
    justification: 'Regulatory requirement under FCA guidelines.',
    constraints: '',
    assumptions: '',
    notes: 'Lost on price – competitor came in ~15% lower. Consider for future with adjusted rate card.',
    ownerId: 'u4',
    collaboratorIds: [],
    parts: [],
    phases: [
      {
        id: 'ph6', name: 'External Penetration Test',
        tasks: [
          { id: 't11', name: 'Scoping call & documentation', role: 'Security Consultant', days: 1, dayRate: 1300 },
          { id: 't12', name: 'External pentest', role: 'Security Consultant', days: 5, dayRate: 1300 },
          { id: 't13', name: 'Report writing', role: 'Security Consultant', days: 2, dayRate: 1300 },
        ],
      },
    ],
    sowContent: '',
  },
  {
    id: 'p5',
    projectName: 'Azure Landing Zone – RetailCo',
    client: 'RetailCo Group',
    accountManager: 'James Wright',
    status: 'Draft',
    currency: 'GBP',
    dateCreated: '2026-05-10',
    dateModified: '2026-05-12',
    ticketRef: '',
    markupPct: 15,
    objectives: 'Design and deploy a CAF-aligned Azure Landing Zone for new application workloads.',
    businessRequirements: '',
    justification: '',
    constraints: '',
    assumptions: '',
    notes: '',
    ownerId: 'u1',
    collaboratorIds: [],
    parts: [],
    phases: [
      {
        id: 'ph7', name: 'Discovery',
        tasks: [
          { id: 't14', name: 'Cloud readiness assessment', role: 'Cloud Architect', days: 3, dayRate: 1400 },
        ],
      },
    ],
    sowContent: '',
  },
];

const SEED_TEMPLATES: Template[] = [
  {
    id: 'tmpl1',
    name: 'Standard Network Refresh',
    description: 'Core switching, firewall and cabling refresh for a mid-size office.',
    ownerId: 'u1',
    dateCreated: '2025-11-01',
    parts: [
      { id: 'tp1', description: 'Core Switch (48-port)', sku: '', quantity: 2, unitCost: 8000, unitPrice: 10000, quotes: [] },
      { id: 'tp2', description: 'Firewall (HA pair)', sku: '', quantity: 2, unitCost: 18000, unitPrice: 23000, quotes: [] },
    ],
    phases: [
      {
        id: 'tph1', name: 'Discovery & Design',
        tasks: [
          { id: 'tt1', name: 'Network audit', role: 'Network Architect', days: 2, dayRate: 1200 },
          { id: 'tt2', name: 'HLD / LLD', role: 'Network Architect', days: 4, dayRate: 1200 },
        ],
      },
      {
        id: 'tph2', name: 'Cutover',
        tasks: [
          { id: 'tt3', name: 'Out-of-hours cutover', role: 'Senior Network Engineer', days: 2, dayRate: 950 },
        ],
      },
    ],
  },
  {
    id: 'tmpl2',
    name: 'Microsoft 365 Migration',
    description: 'Exchange Online, SharePoint, Teams – up to 500 seats.',
    ownerId: 'u1',
    dateCreated: '2025-12-15',
    parts: [
      { id: 'tp3', description: 'M365 Business Premium (per user/yr)', sku: 'AAA-10624', quantity: 100, unitCost: 18, unitPrice: 22, quotes: [] },
    ],
    phases: [
      {
        id: 'tph3', name: 'Assessment',
        tasks: [{ id: 'tt4', name: 'Environment assessment', role: 'Modern Workplace Consultant', days: 2, dayRate: 1100 }],
      },
      {
        id: 'tph4', name: 'Migration',
        tasks: [
          { id: 'tt5', name: 'Email migration', role: 'Modern Workplace Engineer', days: 6, dayRate: 850 },
          { id: 'tt6', name: 'SharePoint / Teams setup', role: 'Modern Workplace Engineer', days: 3, dayRate: 850 },
        ],
      },
    ],
  },
];

const SEED_CATALOG: CatalogItem[] = [
  { id: 'c1', sku: 'C9300-48P-A',     description: 'Cisco Catalyst 9300 48P PoE+',               category: 'Switching', defaultVendor: 'Cisco',     costPrice: 8400,   listPrice: 11200 },
  { id: 'c2', sku: 'C9300-24P-A',     description: 'Cisco Catalyst 9300 24P PoE+',               category: 'Switching', defaultVendor: 'Cisco',     costPrice: 5850,   listPrice: 7800  },
  { id: 'c3', sku: 'FPR2140-NGFW-K9', description: 'Cisco Firepower 2140 NGFW',                  category: 'Security',  defaultVendor: 'Cisco',     costPrice: 21375,  listPrice: 28500 },
  { id: 'c4', sku: 'AAA-10624',       description: 'Microsoft 365 Business Premium (per user/yr)', category: 'Software', defaultVendor: 'Microsoft', costPrice: 16.50,  listPrice: 22    },
  { id: 'c5', sku: 'EX4300-48P',      description: 'Juniper EX4300 48P PoE',                     category: 'Switching', defaultVendor: 'Juniper',   costPrice: 7200,   listPrice: 9600  },
  { id: 'c6', sku: 'SRX345-SYS-JB',  description: 'Juniper SRX345 Services Gateway',             category: 'Security',  defaultVendor: 'Juniper',   costPrice: 3150,   listPrice: 4200  },
  { id: 'c7', sku: 'VNX-2000',        description: 'Veeam Backup & Replication (per socket)',     category: 'Software',  defaultVendor: 'Veeam',     costPrice: 1390,   listPrice: 1850  },
];

const SEED_RATE_CARDS: RateCard[] = [
  { id: 'r1', role: 'Cloud Architect', costRate: 980, sellRate: 1400, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r2', role: 'Network Architect', costRate: 840, sellRate: 1200, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r3', role: 'Senior Network Engineer', costRate: 665, sellRate: 950, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r4', role: 'Network Engineer', costRate: 525, sellRate: 750, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r5', role: 'Modern Workplace Consultant', costRate: 770, sellRate: 1100, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r6', role: 'Modern Workplace Engineer', costRate: 595, sellRate: 850, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r7', role: 'Security Consultant', costRate: 910, sellRate: 1300, currency: 'GBP', effectiveFrom: '2026-01-01' },
  { id: 'r8', role: 'Project Manager', costRate: 700, sellRate: 1000, currency: 'GBP', effectiveFrom: '2026-01-01' },
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

export interface AppLookups {
  catalogCategories: string[];
  departments: string[];
}

const SEED_LOOKUPS: AppLookups = {
  catalogCategories: ['Compute', 'Licensing', 'Networking', 'Security', 'Software', 'Storage', 'Switching'],
  departments: ['Engineering', 'Finance', 'Management', 'Marketing', 'Operations', 'PreSales', 'Sales'],
};

// ─── Store ────────────────────────────────────────────────────────────────────

interface AppStore {
  users: User[];
  proposals: Proposal[];
  templates: Template[];
  catalog: CatalogItem[];
  rateCards: RateCard[];
  clauses: import('../types').Clause[];

  // Discount approval floor (from app_settings, default 10)
  discountMarkupFloor: number;
  setDiscountMarkupFloor: (floor: number) => void;

  // Users
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;

  // Proposals
  addProposal: (proposal: Proposal) => void;
  updateProposal: (id: string, updates: Partial<Proposal>, modifiedBy?: string) => void;
  deleteProposal: (id: string) => void;
  cloneProposal: (id: string) => string;

  // Templates
  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;

  // Catalog
  addCatalogItem: (item: CatalogItem) => void;
  updateCatalogItem: (id: string, updates: Partial<CatalogItem>) => void;
  deleteCatalogItem: (id: string) => void;

  // Rate cards
  addRateCard: (card: RateCard) => void;
  updateRateCard: (id: string, updates: Partial<RateCard>) => void;
  deleteRateCard: (id: string) => void;

  // Clauses
  addClause: (clause: import('../types').Clause) => void;
  updateClause: (id: string, clause: import('../types').Clause) => void;
  deleteClause: (id: string) => void;

  // Lookups
  lookups: AppLookups;
  updateLookup: (key: keyof AppLookups, values: string[]) => void;

  // API sync state
  initialized: boolean;
  apiError: string | null;
  initFromApi: (data: {
    proposals: Proposal[];
    users: User[];
    templates: Template[];
    catalog: CatalogItem[];
    rateCards: RateCard[];
    lookups: AppLookups;
  }) => void;
}

// Lazy API import — avoids circular dependency, only loaded when needed
const sync = {
  proposals:  () => import('../lib/api').then(m => m.proposalApi),
  users:      () => import('../lib/api').then(m => m.userApi),
  templates:  () => import('../lib/api').then(m => m.templateApi),
  catalog:    () => import('../lib/api').then(m => m.catalogApi),
  rateCards:  () => import('../lib/api').then(m => m.rateCardApi),
  lookups:    () => import('../lib/api').then(m => m.lookupsApi),
  clauses:    () => import('../lib/api').then(m => m.clauseApi),
};

const today = () => new Date().toISOString().split('T')[0];

/**
 * Called when a background API sync fails. Logs to console and surfaces a
 * dismissible banner so users know their change may not have been saved —
 * rather than silently losing it.
 */
const onErr = (label: string) => (e: unknown) => {
  console.error(`[store] ${label} API sync failed:`, e);
  // Dispatch a custom event that the UI can listen to and show a toast
  window.dispatchEvent(new CustomEvent('store:sync-error', {
    detail: { label, message: e instanceof Error ? e.message : String(e) },
  }));
};

// Seed bundles exported so StoreInitializer can use them as a dev fallback
// when the API is unreachable. Never shown to users in production.
export const SEED_DATA = {
  users:     SEED_USERS,
  proposals: SEED_PROPOSALS,
  templates: SEED_TEMPLATES,
  catalog:   SEED_CATALOG,
  rateCards: SEED_RATE_CARDS,
  lookups:   SEED_LOOKUPS,
};

export const useStore = create<AppStore>()((set, get) => ({
  // Start empty — populated by StoreInitializer from the API.
  // Seed data is intentionally NOT the default so it can never leak into
  // a production session or race with a background refresh.
  users: [],
  proposals: [],
  templates: [],
  catalog: [],
  rateCards: [],
  clauses: [],
  lookups: { catalogCategories: [], departments: [] },
  discountMarkupFloor: 10,
  initialized: false,
  apiError: null,

  setDiscountMarkupFloor: (floor) => set({ discountMarkupFloor: floor }),

  // ── Bulk init from API (called once on app load) ──────────────────────────
  initFromApi: (data) => set({
    ...data,
    initialized: true,
    apiError: null,
  }),

  // ── Users ─────────────────────────────────────────────────────────────────
  addUser: (user) => {
    set(s => ({ users: [...s.users, user] }));
    sync.users().then(a => a.create(user)).catch(onErr('addUser'));
  },
  updateUser: (id, updates) => {
    set(s => ({ users: s.users.map(u => u.id === id ? { ...u, ...updates } : u) }));
    const updated = get().users.find(u => u.id === id);
    if (updated) sync.users().then(a => a.update(id, updated)).catch(onErr('updateUser'));
  },
  deleteUser: (id) => {
    set(s => ({ users: s.users.filter(u => u.id !== id) }));
    sync.users().then(a => a.delete(id)).catch(onErr('deleteUser'));
  },

  // ── Proposals ─────────────────────────────────────────────────────────────
  addProposal: (p) => {
    set(s => ({ proposals: [p, ...s.proposals] }));
    sync.proposals().then(a => a.create(p)).catch(onErr('addProposal'));
  },
  updateProposal: (id, updates, modifiedBy) => {
    const now = new Date().toISOString();
    const existing = get().proposals.find(p => p.id === id);

    // ── Review re-trigger logic ──────────────────────────────────────────────
    // Financial keys — changes to these may invalidate an existing approval.
    const FINANCIAL_KEYS: (keyof Proposal)[] = ['parts', 'phases', 'markupPct', 'currency', 'consultancyDiscountAmount', 'consultancyDiscountType'];
    const isFinancialUpdate = existing && FINANCIAL_KEYS.some(k => k in updates);

    const reviewExtra: Partial<Proposal> = {};

    if (existing) {
      // When TRB is being approved: capture fingerprint of the current state
      if (updates.trbStatus === 'approved') {
        reviewExtra.trbApprovedFingerprint = computeReviewFingerprint({ ...existing, ...updates });
      }
      // When 5K is being marked complete: capture fingerprint
      if (updates.fiveKStatus === 'complete') {
        reviewExtra.fiveKApprovedFingerprint = computeReviewFingerprint({ ...existing, ...updates });
      }

      // Consultancy discount: any non-zero discount mandates TRB
      if ('consultancyDiscountAmount' in updates && !('trbStatus' in updates)) {
        const newAmt = (updates.consultancyDiscountAmount ?? 0) as number;
        const currentTrb = existing.trbStatus;
        if (newAmt > 0 && currentTrb !== 'sent' && currentTrb !== 'approved' && currentTrb !== 'waived') {
          reviewExtra.trbStatus = 'pending';
        }
      }

      // When making a financial edit: check whether an existing approval is now stale.
      // Only fires when the update is NOT itself a review-status change.
      if (isFinancialUpdate && !('trbStatus' in updates) && !('fiveKStatus' in updates) && !('discountStatus' in updates)) {
        const merged = { ...existing, ...updates } as Proposal;

        if (existing.trbStatus === 'approved' && existing.trbApprovedFingerprint) {
          if (financiallyChangedSince(merged, existing.trbApprovedFingerprint)) {
            reviewExtra.trbStatus = 'stale';
          }
        }
        if (existing.fiveKStatus === 'complete' && existing.fiveKApprovedFingerprint) {
          if (financiallyChangedSince(merged, existing.fiveKApprovedFingerprint)) {
            reviewExtra.fiveKStatus = 'stale';
          }
        }

        // Discount approval: if markupPct changed, re-evaluate requirement
        if ('markupPct' in updates) {
          const floor = get().discountMarkupFloor;
          const newMarkup = (updates.markupPct as number);
          const prevDiscount = existing.discountStatus;
          if (newMarkup < floor) {
            // Below floor
            if (prevDiscount === 'approved') reviewExtra.discountStatus = 'stale';
            else if (!prevDiscount || prevDiscount === 'not_required') reviewExtra.discountStatus = 'pending';
          } else {
            // Above floor — clear requirement if not yet approved
            if (prevDiscount === 'pending' || prevDiscount === 'stale') {
              reviewExtra.discountStatus = 'not_required';
            }
          }
        }
      }
    }

    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? {
          ...p,
          ...updates,
          ...reviewExtra,
          dateModified: today(),
          ...(modifiedBy ? { lastModifiedBy: modifiedBy, lastModifiedAt: now } : {}),
        } : p
      ),
    }));
    const updated = get().proposals.find(p => p.id === id);
    if (updated) sync.proposals().then(a => a.update(id, updated)).catch(onErr('updateProposal'));
  },
  deleteProposal: (id) => {
    set(s => ({ proposals: s.proposals.filter(p => p.id !== id) }));
    sync.proposals().then(a => a.delete(id)).catch(onErr('deleteProposal'));
  },
  cloneProposal: (id) => {
    const original = get().proposals.find(p => p.id === id);
    if (!original) return '';
    const newId = uuid();
    const today2 = today();
    const cloned: Proposal = {
      ...original,
      id: newId,
      projectName: `Copy of ${original.projectName}`,
      status: 'Draft',
      dateCreated: today2,
      dateModified: today2,
      sowContent: undefined,
      trbStatus: undefined, trbReviewNotes: undefined, trbReviewedBy: undefined, trbReviewedAt: undefined,
      trbApprovedFingerprint: undefined,
      fiveKStatus: undefined, fiveKApprovedFingerprint: undefined,
      parts: original.parts.map(pt => ({
        ...pt, id: uuid(),
        quotes: pt.quotes.map(q => ({ ...q, id: uuid() })),
      })),
      phases: original.phases.map(ph => ({
        ...ph, id: uuid(),
        tasks: ph.tasks.map(t => ({ ...t, id: uuid() })),
      })),
    };
    set(s => ({ proposals: [cloned, ...s.proposals] }));
    sync.proposals().then(a => a.create(cloned)).catch(onErr('cloneProposal'));
    return newId;
  },

  // ── Templates ─────────────────────────────────────────────────────────────
  addTemplate: (t) => {
    set(s => ({ templates: [t, ...s.templates] }));
    sync.templates().then(a => a.create(t)).catch(onErr('addTemplate'));
  },
  updateTemplate: (id, updates) => {
    set(s => ({ templates: s.templates.map(t => t.id === id ? { ...t, ...updates } : t) }));
    const updated = get().templates.find(t => t.id === id);
    if (updated) sync.templates().then(a => a.update(id, updated)).catch(onErr('updateTemplate'));
  },
  deleteTemplate: (id) => {
    set(s => ({ templates: s.templates.filter(t => t.id !== id) }));
    sync.templates().then(a => a.delete(id)).catch(onErr('deleteTemplate'));
  },

  // ── Catalog ───────────────────────────────────────────────────────────────
  addCatalogItem: (item) => {
    set(s => ({ catalog: [item, ...s.catalog] }));
    sync.catalog().then(a => a.create(item)).catch(onErr('addCatalogItem'));
  },
  updateCatalogItem: (id, updates) => {
    set(s => ({ catalog: s.catalog.map(c => c.id === id ? { ...c, ...updates } : c) }));
    const updated = get().catalog.find(c => c.id === id);
    if (updated) sync.catalog().then(a => a.update(id, updated)).catch(onErr('updateCatalogItem'));
  },
  deleteCatalogItem: (id) => {
    set(s => ({ catalog: s.catalog.filter(c => c.id !== id) }));
    sync.catalog().then(a => a.delete(id)).catch(onErr('deleteCatalogItem'));
  },

  // ── Rate Cards ────────────────────────────────────────────────────────────
  addRateCard: (card) => {
    set(s => ({ rateCards: [card, ...s.rateCards] }));
    sync.rateCards().then(a => a.create(card)).catch(onErr('addRateCard'));
  },
  updateRateCard: (id, updates) => {
    set(s => ({ rateCards: s.rateCards.map(r => r.id === id ? { ...r, ...updates } : r) }));
    const updated = get().rateCards.find(r => r.id === id);
    if (updated) sync.rateCards().then(a => a.update(id, updated)).catch(onErr('updateRateCard'));
  },
  deleteRateCard: (id) => {
    set(s => ({ rateCards: s.rateCards.filter(r => r.id !== id) }));
    sync.rateCards().then(a => a.delete(id)).catch(onErr('deleteRateCard'));
  },

  // ── Clauses ───────────────────────────────────────────────────────────────
  addClause: (clause) => {
    set(s => ({ clauses: [...s.clauses, clause] }));
    sync.clauses().then(a => a.create({ title: clause.title, category: clause.category, content: clause.content, createdBy: clause.createdBy })).catch(onErr('addClause'));
  },
  updateClause: (id, clause) => {
    set(s => ({ clauses: s.clauses.map(c => c.id === id ? clause : c) }));
    sync.clauses().then(a => a.update(id, clause)).catch(onErr('updateClause'));
  },
  deleteClause: (id) => {
    set(s => ({ clauses: s.clauses.filter(c => c.id !== id) }));
    sync.clauses().then(a => a.delete(id)).catch(onErr('deleteClause'));
  },

  // ── Lookups ───────────────────────────────────────────────────────────────
  updateLookup: (key, values) => {
    set(s => ({ lookups: { ...s.lookups, [key]: values } }));
    const updated = get().lookups;
    sync.lookups().then(a => a.update(updated)).catch(onErr('updateLookup'));
  },
}));

// ─── Factory helpers ──────────────────────────────────────────────────────────

export function createProposalFromTemplate(
  template: Template,
  projectName: string,
  client: string,
  currency: Currency,
  ownerId: string
): Proposal {
  const cloneParts = (parts: Part[]): Part[] =>
    parts.map(p => ({ ...p, id: uuid(), quotes: p.quotes.map(q => ({ ...q, id: uuid() })) }));
  const clonePhases = (phases: ConsultancyPhase[]): ConsultancyPhase[] =>
    phases.map(ph => ({ ...ph, id: uuid(), tasks: ph.tasks.map(t => ({ ...t, id: uuid() })) }));

  return {
    id: uuid(),
    projectName,
    client,
    accountManager: '',
    status: 'Draft' as ProposalStatus,
    currency,
    dateCreated: new Date().toISOString().split('T')[0],
    dateModified: new Date().toISOString().split('T')[0],
    markupPct: 15,
    ownerId,
    collaboratorIds: [],
    parts: cloneParts(template.parts),
    phases: clonePhases(template.phases),
    templateId: template.id,
  };
}

export function createBlankProposal(
  projectName: string,
  client: string,
  currency: Currency,
  ownerId: string
): Proposal {
  return {
    id: uuid(),
    projectName,
    client,
    accountManager: '',
    status: 'Draft' as ProposalStatus,
    currency,
    dateCreated: new Date().toISOString().split('T')[0],
    dateModified: new Date().toISOString().split('T')[0],
    markupPct: 15,
    ownerId,
    collaboratorIds: [],
    parts: [],
    phases: [],
  };
}
