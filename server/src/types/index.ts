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
  totpEnabled?: boolean;
  /** False when the account has been deprovisioned via SCIM. Defaults to true. */
  isActive?: boolean;
  /** SAML NameID — used to look up the user on subsequent SAML logins. Server-only; never sent to the frontend. */
  samlNameId?: string;
}

// ─── Proposal roles ──────────────────────────────────────────────────────────

export type ProposalRole = 'owner' | 'collaborator' | 'reader' | 'admin';
export type ProposalStatus = 'New' | 'In Progress' | 'Waiting Approval' | 'Approved' | 'Sent to Customer' | 'Won' | 'Lost';
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

// ─── Billing milestones ───────────────────────────────────────────────────────

export type MilestoneStatus = 'pending' | 'invoiced' | 'paid';

export interface BillingMilestone {
  id: string;
  name: string;
  percentage: number;
  dueDate?: string;
  status: MilestoneStatus;
  notes?: string;
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

  // 5K review enrichment
  fiveKAttendees?: string[];   // list of attendee names
  fiveKNotes?: string;         // meeting notes
  fiveKMeetingDate?: string;   // ISO date string

  // Billing milestones
  milestones?: BillingMilestone[];

  // CRM
  /** Name of the primary contact at the client company */
  clientContact?: string;
  /** Email address of the primary contact (populated from CRM) */
  clientContactEmail?: string;
  /** Postal address of the client (populated from CRM company record) */
  clientAddress?: string;
  /** Autotask company ID — enables contact lookup within the proposal */
  crmCompanyId?: string;

  /** When true, consultancy GP uses the actual rate card costRate instead of the default 70% of sell */
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
  atOpportunityId?: string;
  atOpportunityUrl?: string;

  // ── Consultancy discount ──────────────────────────────────────────────────
  consultancyDiscountType?: 'monetary' | 'percentage';
  consultancyDiscountAmount?: number;
  consultancyDiscountNote?: string;

  // ── Support / managed-service contract ───────────────────────────────────
  proposalType?: 'project' | 'support';
  supportContract?: SupportContract;
}

// ─── Support / managed-service contract ──────────────────────────────────────

export type SupportHours = 'standard' | 'extended' | 'premium';

export interface SupportAddOn {
  id: string;
  name: string;
  priceType: 'per_seat' | 'flat';
  price: number;
}

export interface SupportScopeItem {
  id: string;
  service: string;
  included: boolean;
}

export interface ExtraDocSection {
  id: string;
  title: string;
  content: string;
  image?: string;
}

export interface SupportContract {
  supportHours?: SupportHours;
  pricePerSeat: number;
  seats: number;
  partTimeSeats?: number;
  term: 12 | 36 | 60;
  termDiscountPct?: number;
  billingCycle: 'monthly' | 'quarterly' | 'annually';
  tier?: string;
  tierDescription?: string;
  addOns: SupportAddOn[];
  inclusions: string[];
  exclusions: string[];
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactMobile?: string;
  contactAddress?: string;
  clientContactName?: string;
  commencementDate?: string;
  noticePeriod?: string;
  paymentTermsText?: string;
  site?: string;
  slaCriticalHours?: number;
  slaStandardHours?: number;
  slaServiceRequestHours?: number;
  onboardingCost?: number;
  scopeOfServices?: SupportScopeItem[];
  documentVersion?: string;
  extraSections?: ExtraDocSection[];
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
  isSupportAddon?: boolean;
  supportAddonPriceType?: 'per_seat' | 'flat';
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
