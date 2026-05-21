// ─── Shared types used by both the API and the frontend ──────────────────────
// Keep in sync with src/types/index.ts

// ─── Users & Auth ────────────────────────────────────────────────────────────

export type AppRole = 'admin' | 'user';
export type AuthProvider = 'local' | 'saml';

export interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  jobTitle?: string;
  avatar?: string;
  appRole: AppRole;
  authProvider: AuthProvider;
  /** SAML NameID — used to look up the user on subsequent SAML logins. Server-only; never sent to the frontend. */
  samlNameId?: string;
}

// ─── Proposal roles ──────────────────────────────────────────────────────────

export type ProposalRole = 'owner' | 'collaborator' | 'reader' | 'admin';
export type ProposalStatus = 'Draft' | 'In Review' | 'Approved' | 'Won' | 'Lost';
export type Currency = 'GBP' | 'USD' | 'EUR';

// ─── Vendor Quotes ───────────────────────────────────────────────────────────

export interface VendorQuote {
  id: string;
  vendor: string;
  reference: string;
  cost: number;
  validUntil: string;
  notes?: string;
  selected: boolean;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentData?: string;
}

// ─── Parts ───────────────────────────────────────────────────────────────────

export type PartType = 'Hardware' | 'Software' | 'Monthly' | 'Annual';

export interface Part {
  id: string;
  description: string;
  sku?: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  quotes: VendorQuote[];
  partType?: PartType;
}

// ─── Consultancy ─────────────────────────────────────────────────────────────

export interface ConsultancyTask {
  id: string;
  name: string;
  role: string;
  days: number;
  dayRate: number;
  unit?: 'days' | 'hours';
  rateMultiplier?: 1 | 1.5 | 2;
}

export interface ConsultancyPhase {
  id: string;
  name: string;
  tasks: ConsultancyTask[];
}

// ─── Proposal ────────────────────────────────────────────────────────────────

export interface Proposal {
  id: string;
  projectName: string;
  client: string;
  accountManager: string;
  status: ProposalStatus;
  currency: Currency;
  dateCreated: string;
  dateModified: string;
  ticketRef?: string;
  markupPct: number;
  objectives?: string;
  businessRequirements?: string;
  justification?: string;
  constraints?: string;
  assumptions?: string;
  notes?: string;
  ownerId: string;
  collaboratorIds: string[];
  parts: Part[];
  phases: ConsultancyPhase[];
  sowContent?: string;
  plannerUrl?: string;
  templateId?: string;
  trbStatus?: 'pending' | 'sent' | 'approved' | 'rejected' | 'waived';
  trbReviewNotes?: string;
  trbReviewedBy?: string;
  trbReviewedAt?: string;
  fiveKStatus?: 'pending' | 'booked' | 'complete' | 'waived';
  clientContact?: string;
  crmCompanyId?: string;
}

// ─── Template ────────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  dateCreated: string;
  parts: Part[];
  phases: ConsultancyPhase[];
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  sku: string;
  description: string;
  category: string;
  defaultVendor?: string;
  costPrice: number;
  listPrice: number;
  partType?: PartType;
  relatedIds?: string[];
}

// ─── Rate Cards ──────────────────────────────────────────────────────────────

export interface RateCard {
  id: string;
  role: string;
  costRate: number;
  sellRate: number;
  currency: Currency;
  effectiveFrom: string;
  effectiveTo?: string;
  overtimeEnabled?: boolean;
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export interface AppLookups {
  catalogCategories: string[];
  departments: string[];
}
