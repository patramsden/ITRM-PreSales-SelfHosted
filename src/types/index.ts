// ─── Users & Auth ───────────────────────────────────────────────────────────

export type AppRole = 'admin' | 'sales_admin' | 'presales' | 'sales';
export type AuthProvider = 'local' | 'saml';

export interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  jobTitle?: string;
  /** Base64 data URL of the user's profile photo */
  avatar?: string;
  appRole: AppRole;
  authProvider: AuthProvider;
  /** True if the user has enrolled TOTP (returned by the admin list endpoint) */
  totpEnabled?: boolean;
  /** False when the account has been deprovisioned via SCIM. Defaults to true. */
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
  /** Original filename of the attached quote document */
  attachmentName?: string;
  /** MIME type of the attachment */
  attachmentMime?: string;
  /** Base64-encoded file content (omitted in list views, populated on demand) */
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
  /** Commercial category — drives the TCO breakdown. Defaults to Hardware. */
  partType?: PartType;
}

// ─── Consultancy ─────────────────────────────────────────────────────────────

export interface ConsultancyTask {
  id: string;
  name: string;
  role: string;
  /** Always stored in days (fractional OK). Use `unit` to control display. */
  days: number;
  dayRate: number;
  /** Input/display unit. Default 'days'. */
  unit?: 'days' | 'hours';
  /** Overtime multiplier applied to the day rate. Default 1 (standard). */
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
  /** Percentage of the proposal grand total (0–100). Amount is derived. */
  percentage: number;
  /** Optional due date (ISO date string) */
  dueDate?: string;
  /** Optional link to a consultancy phase — displayed for context */
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

  // narrative
  objectives?: string;
  businessRequirements?: string;
  justification?: string;
  constraints?: string;
  assumptions?: string;
  notes?: string;

  // people
  ownerId: string;
  collaboratorIds: string[];

  // content
  parts: Part[];
  phases: ConsultancyPhase[];

  // SoW
  sowContent?: string;

  // external links
  plannerUrl?: string;

  // template source
  templateId?: string;

  // Billing milestones
  milestones?: BillingMilestone[];

  // CRM
  /** Name of the primary contact at the client company */
  clientContact?: string;
  /** Autotask company ID — enables contact lookup within the proposal */
  crmCompanyId?: string;

  // Approval reviews (driven by GP thresholds)
  trbStatus?: 'pending' | 'sent' | 'approved' | 'rejected' | 'waived' | 'stale';
  trbReviewNotes?: string;
  trbReviewedBy?: string;
  trbReviewedAt?: string;
  fiveKStatus?: 'pending' | 'booked' | 'complete' | 'waived' | 'stale';

  // 5K review enrichment
  fiveKAttendees?: string[];   // list of attendee names
  fiveKNotes?: string;         // meeting notes
  fiveKMeetingDate?: string;   // ISO date string

  /** When true, consultancy GP uses the actual rate card costRate instead of the default 70% of sell */
  useRateCardCost?: boolean;

  lastModifiedBy?: string;
  lastModifiedAt?: string;

  reference?: string;

  /**
   * Fingerprint of financially-relevant fields (parts, phases, markupPct, currency)
   * captured at the moment TRB was approved. If the proposal is subsequently edited
   * and the new fingerprint differs, trbStatus is automatically set to 'stale'.
   */
  trbApprovedFingerprint?: string;
  /** Same as trbApprovedFingerprint but for the 5K review completion. */
  fiveKApprovedFingerprint?: string;

  // ── Win/Loss capture ──────────────────────────────────────────────────────
  wonLostReason?: 'Price' | 'Competitor' | 'Timing' | 'Budget' | 'Technical fit' | 'Relationship' | 'No decision' | 'Other';
  competitorName?: string;
  wonLostNote?: string;
  wonLostAt?: string;

  // ── Expiry ────────────────────────────────────────────────────────────────
  /** ISO date string — show warning when ≤7 days away or past */
  expiresAt?: string;

  // ── Discount approval ─────────────────────────────────────────────────────
  discountStatus?: 'not_required' | 'pending' | 'approved' | 'waived' | 'stale';
  discountApprovedBy?: string;
  discountApprovedAt?: string;
  discountApprovalNote?: string;

  // ── Autotask project link ─────────────────────────────────────────────────
  atProjectId?: string;

  // ── Consultancy discount (customer-facing) ────────────────────────────────
  /** 'monetary' = fixed £ amount off consultancy; 'percentage' = % off consultancy */
  consultancyDiscountType?: 'monetary' | 'percentage';
  /** Discount value — £ amount or %, depending on type. 0 = no discount. */
  consultancyDiscountAmount?: number;
  consultancyDiscountNote?: string;

  // ── Support / managed-service contract ───────────────────────────────────
  /** Discriminator — 'project' is the default behaviour */
  proposalType?: 'project' | 'support';
  supportContract?: SupportContract;
}

// ─── Support / managed-service contract ──────────────────────────────────────

export interface SupportAddOn {
  id: string;
  name: string;
  /** 'per_seat' multiplies by seats; 'flat' is a fixed monthly amount */
  priceType: 'per_seat' | 'flat';
  price: number;
}

export interface SupportContract {
  /** Service tier label displayed to the client (e.g. "Gold Managed Service") */
  tier: string;
  /** Per-seat monthly price for the base tier */
  pricePerSeat: number;
  /** Number of users covered */
  seats: number;
  /** Contract length in months */
  term: 12 | 24 | 36;
  /** How often the client is invoiced */
  billingCycle: 'monthly' | 'quarterly' | 'annually';
  /** Optional short description of what the tier covers */
  tierDescription?: string;
  /** Additional services layered on top of the base tier */
  addOns: SupportAddOn[];
  /** Bullet-point inclusions shown in the proposal */
  inclusions: string[];
  /** Bullet-point exclusions shown in the proposal */
  exclusions: string[];
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface ProposalComment {
  id: string;
  proposalId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

// ─── Clause library ───────────────────────────────────────────────────────────

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
  /** Default buy / cost price — used as unitCost when the item is added to a quote. */
  costPrice: number;
  /** Default sell / list price — used as unitPrice when the item is added to a quote. */
  listPrice: number;
  /** Billing / commercial type — drives which section the item lands in when added to a quote. */
  partType?: PartType;
  /** IDs of related catalog items shown as "frequently bought together" when added to a quote. */
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
  /** Whether 1.5× and 2× overtime rates are available for this role. */
  overtimeEnabled?: boolean;
}

// ─── Version history ─────────────────────────────────────────────────────────

export interface ProposalVersion {
  id: string;
  proposalId: string;
  savedBy: string;
  savedAt: string;
}

// ─── Shareable links ─────────────────────────────────────────────────────────

export interface ProposalShare {
  token: string;
  proposalId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
}

// ─── Derived helpers ─────────────────────────────────────────────────────────

export interface ProposalTotals {
  partsCost: number;
  partsSell: number;
  /** Sum of all authored phases (excludes Project Management). */
  baseConsultancySell: number;
  /** Auto-calculated: 20% of baseConsultancySell. */
  pmValue: number;
  /** baseConsultancySell + pmValue (pre-discount) */
  consultancySell: number;
  /** Computed £ discount applied to consultancy (0 if none). */
  consultancyDiscountValue: number;
  /** consultancySell minus the discount — what the customer pays for consultancy. */
  consultancyDiscountedSell: number;
  consultancyCost: number;
  markupAmount: number;
  grandTotal: number;
  marginPct: number;
}
