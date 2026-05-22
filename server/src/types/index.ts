// ─── Shared types used by both the API and the frontend ──────────────────────
// Keep in sync with src/types/index.ts

// ─── Users & Auth ────────────────────────────────────────────────────────────

export type AppRole = 'admin' | 'sales_admin' | 'presales' | 'sales';
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
  /** False when deprovisioned via SCIM. Defaults to true. */
  isActive?: boolean;
}

// ─── Proposal roles ──────────────────────────────────────────────────────────

export type ProposalRole = 'owner' | 'collaborator' | 'reader' | 'admin';
export type ProposalStatus = 'Draft' | 'In Progress' | 'Approved' | 'With Account Manager' | 'Won' | 'Lost';
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

// ─── Billing milestones ──────────────────────────────────────────────────────

export type MilestoneStatus = 'pending' | 'invoiced' | 'paid';

export interface BillingMilestone {
  id: string;
  name: string;
  percentage: number;
  dueDate?: string;
  phaseId?: string;
  notes?: string;
  status: MilestoneStatus;
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
  trbStatus?: 'pending' | 'sent' | 'approved' | 'rejected' | 'waived' | 'stale';
  trbReviewNotes?: string;
  trbReviewedBy?: string;
  trbReviewedAt?: string;
  fiveKStatus?: 'pending' | 'booked' | 'complete' | 'waived' | 'stale';
  fiveKAttendees?: string[];
  fiveKNotes?: string;
  fiveKMeetingDate?: string;
  milestones?: BillingMilestone[];
  clientContact?: string;
  crmCompanyId?: string;
  useRateCardCost?: boolean;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  reference?: string;
  trbApprovedFingerprint?: string;
  fiveKApprovedFingerprint?: string;
  wonLostReason?: string;
  competitorName?: string;
  wonLostNote?: string;
  wonLostAt?: string;
  expiresAt?: string;
  discountStatus?: 'not_required' | 'pending' | 'approved' | 'waived' | 'stale';
  discountApprovedBy?: string;
  discountApprovedAt?: string;
  discountApprovalNote?: string;
  atProjectId?: string;
}

export interface ProposalComment {
  id: string;
  proposalId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface Clause {
  id: string;
  title: string;
  category: string;
  content: string;
  createdBy: string;
  createdAt: string;
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
