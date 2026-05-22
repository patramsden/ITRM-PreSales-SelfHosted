import { useState, useMemo } from 'react';
import { Search, BookOpen, ChevronRight, ExternalLink, Info, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import clsx from 'clsx';

// ─── Content types ────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  category: string;
  content: Section[];
}

type Section =
  | { type: 'p';     text: string }
  | { type: 'h2';    text: string }
  | { type: 'h3';    text: string }
  | { type: 'ul';    items: string[] }
  | { type: 'ol';    items: string[] }
  | { type: 'note';  text: string }
  | { type: 'tip';   text: string }
  | { type: 'warn';  text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

interface Category {
  id: string;
  label: string;
  icon: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  { id: 'start',      label: 'Getting Started',          icon: '🚀' },
  { id: 'proposals',  label: 'Proposals',                icon: '📄' },
  { id: 'reviews',    label: 'Reviews & Approvals',      icon: '✅' },
  { id: 'sharing',    label: 'Sharing & Exporting',      icon: '🔗' },
  { id: 'clauses',    label: 'Clause Library',           icon: '📚' },
  { id: 'crm',        label: 'CRM Integration',          icon: '🔌' },
  { id: 'admin',      label: 'Admin & Settings',         icon: '⚙️' },
];

// ─── Articles ────────────────────────────────────────────────────────────────

const ARTICLES: Article[] = [

  // ── Getting Started ────────────────────────────────────────────────────────

  {
    id: 'overview',
    title: 'App Overview',
    category: 'start',
    content: [
      { type: 'p', text: 'ITRM PreSales is a proposal management platform built for presales teams at managed service providers. It covers the full lifecycle of a commercial proposal — from first draft through internal review, client sign-off, and delivery handover.' },
      { type: 'h2', text: 'Core concepts' },
      { type: 'ul', items: [
        'Proposals — the central object. Each proposal has a project name, client, bill of materials (parts), consultancy effort (phases and tasks), a statement of work, and a commercial summary.',
        'Parts — hardware, software, and subscription line items. Each part can have multiple vendor quotes attached.',
        'Phases & Tasks — consultancy work broken down by project phase and resource role.',
        'Reviews — TRB (Technical Review Board) and 5K Commercial Review are triggered automatically once GP crosses the relevant thresholds. Discount Approval triggers when the markup % drops below the floor.',
        'Customer link — a shareable, read-only URL you can send to the client for review and sign-off without giving them app access.',
      ]},
      { type: 'h2', text: 'Navigation' },
      { type: 'ul', items: [
        'Dashboard — pipeline overview, AM leaderboard, and recent proposals.',
        'Pipeline — Kanban-style board grouped by status.',
        'Proposals — searchable list of all proposals you can access.',
        'Templates — reusable starting points for common proposal types.',
        'Catalog — your company\'s standard product and service items.',
        'Rate Cards — day and hourly rates per resource role.',
        'Clauses — reusable text blocks that can be inserted into any SoW.',
        'Users — admin-only user management.',
        'Settings — branding, AI configuration, CRM, SSO, and more.',
      ]},
    ],
  },

  {
    id: 'first-proposal',
    title: 'Creating Your First Proposal',
    category: 'start',
    content: [
      { type: 'p', text: 'Follow these steps to create and publish a proposal from scratch.' },
      { type: 'steps', items: [
        'Go to Proposals → click New Proposal. Give it a project name, select the currency, and choose an owner.',
        'On the Summary tab, fill in the client name (search your Autotask company list if CRM is connected), account manager, and the narrative fields — Objectives, Business Requirements, and Justification.',
        'On the Parts tab, add any hardware, software, or subscription line items. Set unit cost and unit price for each. Attach vendor quotes using the paperclip icon on each part.',
        'On the Consultancy tab, add phases (e.g. "Discovery", "Implementation") and tasks within each phase. Set the resource role, number of days, and day rate for each task.',
        'Review the Totals & Approval tab to check the commercial summary. The GP% alert will tell you if margin is too thin.',
        'If the proposal needs TRB or 5K review (based on GP thresholds), go to the Approvals tab and submit for review.',
        'Once approved, export to PDF or Excel using the Export button, or generate a Customer Link to share with the client.',
      ]},
      { type: 'tip', text: 'Use a Template if your company has standard proposal types. Templates pre-populate parts and consultancy tasks so you only need to adjust quantities and rates.' },
    ],
  },

  {
    id: 'roles',
    title: 'Roles & Permissions',
    category: 'start',
    content: [
      { type: 'p', text: 'The app has four roles that control what each user can see and do.' },
      { type: 'table', headers: ['Role', 'Can do'], rows: [
        ['Admin',       'Full access to everything including user management, all settings, and all proposals regardless of ownership.'],
        ['Sales Admin', 'Can edit proposals and catalog items. Cannot access user management or system settings.'],
        ['Presales',    'Can create and edit proposals they own or are a collaborator on. Can view other proposals read-only.'],
        ['Sales',       'Read-only access to proposals. Can view but not edit.'],
      ]},
      { type: 'h2', text: 'Proposal-level roles' },
      { type: 'p', text: 'Within a proposal, access is further controlled by whether you are the owner, a collaborator, or just a viewer. Only the owner (or an admin) can add or remove collaborators on the Summary tab.' },
      { type: 'note', text: 'Roles are assigned by an admin in the Users page. If you need your role changed, contact your system administrator.' },
    ],
  },

  // ── Proposals ─────────────────────────────────────────────────────────────

  {
    id: 'proposal-summary',
    title: 'Project Summary Tab',
    category: 'proposals',
    content: [
      { type: 'p', text: 'The Summary tab holds all the metadata and narrative for a proposal.' },
      { type: 'h2', text: 'Key fields' },
      { type: 'ul', items: [
        'Project Name — the internal name shown throughout the app and on exports.',
        'Client — search your Autotask company list or type a free-text name. Selecting from Autotask will auto-populate the Account Manager.',
        'Client Contact — if your Autotask company is linked, a dropdown of active contacts is shown. Otherwise, free text.',
        'Account Manager — auto-populated from the Autotask company\'s assigned resource. Use the ↺ button to re-fetch if it didn\'t fill in.',
        'Ticket Reference — link this proposal to a CRM ticket number (e.g. T-1042).',
        'Status — the lifecycle stage of the proposal.',
        'Currency — GBP, USD, or EUR. Affects all displayed values.',
        'Date of Proposal — the creation date shown on exports.',
        'Proposal Expires — when set, a warning banner appears as the expiry date approaches.',
        'Markup % — applied to Hardware and Software parts only. Consultancy has its own rate card margin.',
      ]},
      { type: 'h2', text: 'Narrative fields' },
      { type: 'p', text: 'The six narrative fields (Objectives, Business Requirements, Justification, Constraints, Assumptions, Notes) appear in both the SoW and the PDF export. Each has a placeholder that explains what to include. Notes is internal-only and never shown to the client.' },
      { type: 'h2', text: 'Collaborators' },
      { type: 'p', text: 'Search the company directory to add colleagues as collaborators. Collaborators can edit the proposal. Only the owner or an admin can manage the collaborator list.' },
    ],
  },

  {
    id: 'parts',
    title: 'Parts & Bill of Materials',
    category: 'proposals',
    content: [
      { type: 'p', text: 'The Parts tab manages all products and subscriptions included in the proposal.' },
      { type: 'h2', text: 'Part types' },
      { type: 'table', headers: ['Type', 'Description', 'Pricing cadence'], rows: [
        ['Hardware',  'Physical equipment — servers, networking, end-user devices.',  'One-off / upfront'],
        ['Software',  'Licences, OS, on-premise applications.',                        'One-off / upfront'],
        ['Monthly',   'Cloud subscriptions, SaaS, monthly managed services.',          'Per month'],
        ['Annual',    'Annual licences, support contracts.',                           'Per year'],
      ]},
      { type: 'h2', text: 'Adding parts from the Catalog' },
      { type: 'p', text: 'Click the shopping cart icon at the top of any part section to search the Catalog and add pre-configured items in bulk. Catalog items carry default costs and sell prices that you can override per-proposal.' },
      { type: 'h2', text: 'Vendor quotes' },
      { type: 'p', text: 'Each part can have multiple vendor quotes attached (click the quote icon on any part row). Mark one quote as selected — its cost will be used in the GP calculation instead of the default unit cost. Quotes have a validUntil date: the app will warn you when selected quotes are within 14 days of expiry or have already expired.' },
      { type: 'h2', text: 'Markup' },
      { type: 'p', text: 'The Markup % on the Summary tab is applied to the total sell value of Hardware and Software parts only. Monthly and Annual subscriptions are excluded from markup. The resulting markup amount is shown as its own line in the commercial summary.' },
      { type: 'tip', text: 'Use the Catalog to build a library of commonly-sold products. Pre-setting costs and prices on Catalog items saves time and ensures consistency across proposals.' },
    ],
  },

  {
    id: 'consultancy',
    title: 'Consultancy & Professional Services',
    category: 'proposals',
    content: [
      { type: 'p', text: 'The Consultancy tab structures your professional services effort into phases and tasks.' },
      { type: 'h2', text: 'Phases' },
      { type: 'p', text: 'Phases group related tasks together (e.g. "Phase 1 – Discovery", "Phase 2 – Implementation"). They appear as sections in the customer-facing proposal and PDF.' },
      { type: 'h2', text: 'Tasks' },
      { type: 'p', text: 'Each task has a name, resource role, effort (days or hours), day rate, and an optional rate multiplier for overtime/out-of-hours work.' },
      { type: 'table', headers: ['Field', 'Description'], rows: [
        ['Name',             'A brief description of the work, e.g. "Requirements Workshop" or "Server Build".'],
        ['Role',             'The resource type doing the work. Must match a Rate Card entry for cost to be calculated correctly.'],
        ['Unit',             'Days (default) or hours. Hours are converted to days internally (÷7) for all calculations.'],
        ['Day Rate',         'The sell rate for this role. Pre-populated from the Rate Card if one exists.'],
        ['Rate Multiplier',  '1× standard, 1.5× time-and-a-half, or 2× double time for out-of-hours work.'],
      ]},
      { type: 'h2', text: 'Project Management uplift' },
      { type: 'p', text: 'Project Management is automatically added at 20% of the total consultancy sell value. This is calculated and shown separately in the Totals tab — you do not need to add a PM task manually.' },
      { type: 'h2', text: 'Rate card costs' },
      { type: 'p', text: 'By default, cost is estimated at 70% of sell for each task. If you want to use the actual cost rates from your Rate Cards, tick "Use rate card cost in GP calculation" on the Totals tab.' },
    ],
  },

  {
    id: 'billing',
    title: 'Billing Milestones',
    category: 'proposals',
    content: [
      { type: 'p', text: 'The Billing tab lets you split the proposal value into payment milestones — useful for phased invoicing.' },
      { type: 'h2', text: 'How milestones work' },
      { type: 'p', text: 'Each milestone is defined as a percentage of the Grand Total. The app calculates the £ amount for you. Milestone percentages should add up to 100% for a complete billing schedule, but this is not enforced.' },
      { type: 'table', headers: ['Field', 'Description'], rows: [
        ['Name',        'e.g. "Project Kickoff", "30% Completion", "Go-live", "Final Acceptance"'],
        ['%',           'Percentage of Grand Total due at this milestone.'],
        ['Due Date',    'Optional target invoice date.'],
        ['Phase',       'Optionally link to a consultancy phase for context on the customer-facing view.'],
        ['Notes',       'Internal notes about the milestone.'],
        ['Status',      'Pending → Invoiced → Paid. Updated as you progress through delivery.'],
      ]},
      { type: 'tip', text: 'A standard structure is 30% on project start, 40% at a mid-point milestone, and 30% on completion. Adjust to match your contract terms.' },
    ],
  },

  {
    id: 'sow',
    title: 'Statement of Work',
    category: 'proposals',
    content: [
      { type: 'p', text: 'The Statement of Work (SoW) tab contains the detailed project scope document that accompanies the proposal.' },
      { type: 'h2', text: 'AI generation' },
      { type: 'p', text: 'Click Generate to produce a structured SoW draft based on the narrative fields, parts, and consultancy tasks. The app supports Azure OpenAI (recommended for Microsoft 365 environments) and Anthropic Claude. The active AI provider is shown as a badge in the SoW header.' },
      { type: 'note', text: 'The AI generates a starting draft based on what\'s in the proposal. Always review and edit the output before sending it to a client.' },
      { type: 'h2', text: 'Inserting clauses' },
      { type: 'p', text: 'Click "Insert Clause" to open the Clause Library picker. Search or browse by category, preview the clause on the right, then click Insert to append it to the SoW. See the Clause Library section for how to manage your clause library.' },
      { type: 'h2', text: 'Manual editing' },
      { type: 'p', text: 'The SoW editor is a plain-text area. You can write or paste content directly without using the AI generator. Click Save SoW to persist your changes.' },
      { type: 'tip', text: 'Use Regenerate (shown once you have a draft) to refresh the AI content without losing your edits — it replaces the text area, so copy anything you want to keep first.' },
    ],
  },

  {
    id: 'totals',
    title: 'Totals, Margin Alerts & Status',
    category: 'proposals',
    content: [
      { type: 'p', text: 'The Totals & Approval tab shows the commercial summary, margin health, and the proposal status pipeline.' },
      { type: 'h2', text: 'Commercial Summary' },
      { type: 'p', text: 'The table breaks down cost, GP, and total sell by category — Hardware, Software, Monthly, Annual, and Consultancy. The 1st Year TCO row rolls everything together including 12 months of monthly subscriptions and one full annual subscription cycle.' },
      { type: 'h2', text: 'Margin alerts' },
      { type: 'p', text: 'The Avg GP% in the Quick Stats card uses colour coding to flag margin health:' },
      { type: 'table', headers: ['Threshold', 'Indicator', 'Meaning'], rows: [
        ['≥ 25%', 'Green',           'Healthy margin'],
        ['15–24%', 'Amber — Thin margin', 'Review with account manager before sending'],
        ['< 15%',  'Red — Low margin',    'Likely requires discount approval or re-pricing'],
      ]},
      { type: 'p', text: 'Individual categories (Hardware, Software, Consultancy) also show their own alerts if their GP% is below threshold.' },
      { type: 'h2', text: 'Win/Loss tracking' },
      { type: 'p', text: 'When you move a proposal to Won or Lost, a modal asks you to record the primary reason, any competitor involved, and optional notes. This data is stored and visible back on the Totals tab — and feeds the account manager leaderboard on the Dashboard.' },
      { type: 'h2', text: 'Status pipeline' },
      { type: 'p', text: 'The status flow is: Draft → In Progress → Approved → With Account Manager → Won (or Lost). Click a status node to move the proposal forward. Moving to In Progress shows a confirmation dialog. Moving to Won or Lost shows the Win/Loss capture modal.' },
      { type: 'h2', text: 'Autotask project creation' },
      { type: 'p', text: 'Once a proposal is marked Won and a CRM company is linked, a "Create Autotask Project" button appears. Clicking it creates a project in Autotask using the proposal name, company, and objectives, and stores the project ID.' },
    ],
  },

  {
    id: 'win-loss',
    title: 'Win/Loss Reason Capture',
    category: 'proposals',
    content: [
      { type: 'p', text: 'Recording why each deal was won or lost builds a searchable archive that helps the team improve future proposals.' },
      { type: 'h2', text: 'How it works' },
      { type: 'steps', items: [
        'In the Totals & Approval tab, click the Won or Lost node in the status pipeline.',
        'A modal appears asking for the primary reason, competitor (if applicable), and free-text notes.',
        'The reason options for Won are: Price/Value, Relationship, Technical fit, Speed to deliver, Other.',
        'The reason options for Lost are: Price, Competitor, Timing, Budget, Technical fit, No decision, Other.',
        'After submission the data is stored on the proposal and displayed on the Totals tab.',
      ]},
      { type: 'tip', text: 'The account manager leaderboard on the Dashboard is built from Won proposal data. Keeping win/loss records accurate gives you better pipeline intelligence.' },
    ],
  },

  // ── Reviews & Approvals ───────────────────────────────────────────────────

  {
    id: 'trb',
    title: 'TRB Review',
    category: 'reviews',
    content: [
      { type: 'p', text: 'The Technical Review Board (TRB) review is required for all proposals with GP over £750. It is an asynchronous review — you send the proposal link to the TRB and they record their decision in the app.' },
      { type: 'h2', text: 'Submitting for TRB review' },
      { type: 'steps', items: [
        'Go to the Approvals tab.',
        'In the TRB section, enter the reviewer\'s email address (optional).',
        'Click Send Email — this opens your email client with a pre-filled message and a direct link to the proposal.',
        'The TRB status changes to "Sent for review".',
      ]},
      { type: 'h2', text: 'Recording the decision' },
      { type: 'p', text: 'A banner appears at the top of the proposal workspace (visible to all users) when TRB review is in flight. Any user can expand the banner to approve or reject. Rejection requires a note.' },
      { type: 'h2', text: 'Re-review after changes' },
      { type: 'p', text: 'If you edit the proposal\'s commercial data (parts, consultancy tasks, markup, or currency) after TRB approval, the status automatically changes to "Re-review required". You must re-submit for TRB before you can export.' },
      { type: 'warn', text: 'TRB approval is required before you can export or share the proposal. The Export button will show a blocker if TRB is still pending.' },
    ],
  },

  {
    id: 'fivek',
    title: '5K Commercial Review',
    category: 'reviews',
    content: [
      { type: 'p', text: 'The 5K Commercial Review is required for proposals with GP over £5,000. It requires a scheduled Teams or Outlook meeting rather than an async email review.' },
      { type: 'h2', text: 'Booking the review' },
      { type: 'steps', items: [
        'Go to the Approvals tab.',
        'In the 5K Review section, click "Book in Teams" to open a pre-filled 60-minute Teams meeting invite, or "Outlook" to open an Outlook calendar invite.',
        'The status changes to "Meeting booked".',
        'Record the meeting date, attendees, and meeting notes after the review.',
        'Set the status to "Review complete" using the status buttons.',
      ]},
      { type: 'h2', text: 'Re-review after changes' },
      { type: 'p', text: 'Like TRB, if you edit commercial data after the 5K review is marked complete, the status reverts to "Re-review required". A new meeting must be held.' },
    ],
  },

  {
    id: 'discount',
    title: 'Discount Approval',
    category: 'reviews',
    content: [
      { type: 'p', text: 'Discount Approval is triggered automatically when the proposal\'s Markup % drops below the company floor (default 10%). It ensures below-floor pricing is reviewed before the proposal goes out.' },
      { type: 'h2', text: 'How it works' },
      { type: 'steps', items: [
        'Set the Markup % below the floor on the Summary tab.',
        'The Discount Approval section appears in the Approvals tab with status "Approval required".',
        'A senior approver enters notes and clicks Approve (or Waive).',
        'The status changes to Approved / Waived and export is unblocked.',
      ]},
      { type: 'note', text: 'The markup floor is configured in Settings. Ask your admin if you need it changed.' },
      { type: 'h2', text: 'Re-approval after changes' },
      { type: 'p', text: 'If the markup changes after approval, the status reverts to "Re-approval needed". A new approval is required.' },
    ],
  },

  {
    id: 'export-guard',
    title: 'Export Guard Rails',
    category: 'reviews',
    content: [
      { type: 'p', text: 'The Export button checks several conditions before allowing export. If any are unmet, a dialog lists the blockers.' },
      { type: 'table', headers: ['Blocker', 'When it applies', 'How to resolve'], rows: [
        ['TRB review pending',             'GP > £750 and TRB status is not Approved or Waived', 'Submit for TRB and get approval'],
        ['TRB re-review required',         'TRB was approved but commercial data changed since', 'Reset to pending and re-submit for TRB'],
        ['5K review not complete',         'GP > £5,000 and 5K status is not Complete or Waived', 'Hold and record the 5K meeting'],
        ['5K re-review required',          '5K was complete but commercial data changed since', 'Reset and hold a new 5K meeting'],
        ['Discount approval required',     'Markup below floor, discount status is pending', 'Get a senior approver to approve in the Approvals tab'],
        ['Discount re-approval required',  'Markup was approved but then changed again', 'Get re-approval in the Approvals tab'],
      ]},
      { type: 'tip', text: 'You can Waive any review if you have the right role and understand the commercial risk. Waivers are recorded and visible on the Approvals tab.' },
    ],
  },

  // ── Sharing & Exporting ───────────────────────────────────────────────────

  {
    id: 'customer-link',
    title: 'Customer-Facing Proposal Links',
    category: 'sharing',
    content: [
      { type: 'p', text: 'A customer link gives your client a read-only, branded view of the proposal — including commercial summary, BOM, consultancy breakdown, and SoW — without needing app access.' },
      { type: 'h2', text: 'Creating a link' },
      { type: 'steps', items: [
        'Click the Share button in the top-right of any proposal.',
        'Set an optional expiry date for the link.',
        'Click Create Link — a URL is generated. Copy it and send it to your client.',
      ]},
      { type: 'h2', text: 'What the client sees' },
      { type: 'p', text: 'The customer view is a branded page (using your logo and primary colour from Settings) showing the cover page, executive summary, commercial breakdown by category, bill of materials, professional services by phase and task, SoW, and a sign-off section.' },
      { type: 'h2', text: 'Sign-off' },
      { type: 'p', text: 'The client can approve or reject the proposal directly from their link. They enter their name, optional notes, and click Approve or Reject. The decision (with timestamp and IP address) is recorded and visible in the Approvals tab → Customer Decision section.' },
      { type: 'h2', text: 'Managing links' },
      { type: 'p', text: 'The Approvals tab → Customer Decision section shows all links created for a proposal, their expiry dates, and the current approval status.' },
      { type: 'warn', text: 'Customer links are public URLs — anyone with the link can view the proposal. Set an expiry date and revoke links that should no longer be accessible.' },
    ],
  },

  {
    id: 'export',
    title: 'Exporting to PDF & Excel',
    category: 'sharing',
    content: [
      { type: 'p', text: 'Use the Export button in the top bar to download the proposal as a PDF or Excel workbook.' },
      { type: 'h2', text: 'PDF export' },
      { type: 'p', text: 'The PDF uses your company branding (logo, colours) and the layout configured in Settings → Proposal Layout. It includes all enabled sections: cover, executive summary, commercial summary, BOM, consultancy, milestones, SoW, and terms.' },
      { type: 'h2', text: 'Excel export' },
      { type: 'p', text: 'The Excel export contains separate sheets for: commercial summary, hardware, software, monthly subscriptions, annual subscriptions, consultancy by phase, billing milestones, and a TCO model.' },
      { type: 'note', text: 'Export requires all relevant reviews to be approved or waived. If the Export button is greyed out or shows blockers, see the Export Guard Rails article.' },
    ],
  },

  {
    id: 'expiry',
    title: 'Proposal Expiry',
    category: 'sharing',
    content: [
      { type: 'p', text: 'Setting an expiry date on a proposal makes it clear to all parties when the pricing and scope is no longer valid.' },
      { type: 'h2', text: 'Setting an expiry date' },
      { type: 'p', text: 'Go to the Summary tab and set the Proposal Expires date. This is typically 30 days from the date of the proposal for hardware quotes (vendor quotes expire), or longer for consultancy-only proposals.' },
      { type: 'h2', text: 'Warning banners' },
      { type: 'p', text: 'Once a proposal is within 7 days of expiry, an amber banner appears at the top of the workspace. Once it has expired, the banner turns red. These are warnings only — the proposal is not locked or archived automatically.' },
      { type: 'tip', text: 'If a client comes back after expiry, update the Proposal Expires date and re-check vendor quote validity before re-sending.' },
    ],
  },

  // ── Clause Library ────────────────────────────────────────────────────────

  {
    id: 'clause-library',
    title: 'Managing the Clause Library',
    category: 'clauses',
    content: [
      { type: 'p', text: 'The Clause Library is a central store of reusable text blocks — assumptions, exclusions, terms, warranty statements, GDPR notes, SLA definitions — that can be inserted into any Statement of Work.' },
      { type: 'h2', text: 'Adding a clause' },
      { type: 'steps', items: [
        'Go to Clauses (sidebar nav).',
        'Click New Clause.',
        'Give it a title (e.g. "Standard Project Assumptions"), a category (e.g. "Assumptions"), and write the content.',
        'Click Add Clause to save.',
      ]},
      { type: 'h2', text: 'Categories' },
      { type: 'p', text: 'Common categories are pre-suggested: General, Assumptions, Exclusions, Terms, Warranties, GDPR & Data, SLA, Commercial. You can type any category name — it\'s free text.' },
      { type: 'h2', text: 'Editing and deleting' },
      { type: 'p', text: 'Hover over any clause card to reveal the Edit (pencil) and Delete (bin) icons. Click Edit to open the inline editor. Changes apply immediately.' },
    ],
  },

  {
    id: 'clause-insert',
    title: 'Inserting Clauses into a SoW',
    category: 'clauses',
    content: [
      { type: 'p', text: 'You can insert any clause from the library directly into a proposal\'s Statement of Work.' },
      { type: 'steps', items: [
        'Open a proposal and go to the Statement of Work tab.',
        'Click the Insert Clause button (book icon) in the header.',
        'Search for a clause by title, content, or category.',
        'Select a clause from the left panel to preview it on the right.',
        'Click Insert Clause — the content is appended to the end of the current SoW with a blank line separator.',
      ]},
      { type: 'tip', text: 'You can insert multiple clauses in sequence. Each insertion appends to the existing content, so insert them in the order you want them to appear.' },
      { type: 'note', text: 'Inserting a clause copies its text into the SoW at that moment. Later edits to the clause in the Clause Library do not update proposals that have already inserted it.' },
    ],
  },

  // ── CRM Integration ───────────────────────────────────────────────────────

  {
    id: 'crm-setup',
    title: 'Connecting to Autotask',
    category: 'crm',
    content: [
      { type: 'p', text: 'The CRM integration connects to Autotask PSA to search for companies, look up contacts, and auto-populate the account manager.' },
      { type: 'h2', text: 'Configuration (admin only)' },
      { type: 'steps', items: [
        'Go to Settings → CRM.',
        'Enter the Autotask API username (the email address of your API user).',
        'Click Detect Zone — the app will auto-discover the correct Autotask data centre URL.',
        'Enter the API Secret (the API user\'s password).',
        'Enter the Integration Code from Autotask (Admin → Integrations → API Integration → Tracking Identifier).',
        'Click Test Connection to verify. A green success message confirms connectivity.',
        'Click Save.',
      ]},
      { type: 'warn', text: 'Use a dedicated API user in Autotask, not a personal account. The API user must have sufficient permissions to query Companies, Contacts, and Resources.' },
    ],
  },

  {
    id: 'crm-usage',
    title: 'Using the CRM in Proposals',
    category: 'crm',
    content: [
      { type: 'p', text: 'Once the CRM is connected, several fields in proposals become CRM-aware.' },
      { type: 'h2', text: 'Client field' },
      { type: 'p', text: 'The Client field on the Summary tab searches Autotask companies as you type. Select a result and a blue "CRM" badge appears — this means the proposal is linked to the Autotask company ID, which unlocks contact lookup.' },
      { type: 'h2', text: 'Account Manager auto-population' },
      { type: 'p', text: 'When you select a company from Autotask, the app immediately looks up the account manager resource assigned to that company and fills the Account Manager field. If it doesn\'t appear, use the ↺ button next to the field to retry the lookup.' },
      { type: 'p', text: 'Status messages below the Account Manager field tell you what happened: "Set from CRM" (success), "No account manager assigned" (company has no AM in Autotask), or an error message if the lookup failed.' },
      { type: 'h2', text: 'Client Contact' },
      { type: 'p', text: 'When the client is linked to an Autotask company, the Client Contact field shows a dropdown of active contacts for that company. Select the primary contact for this proposal.' },
      { type: 'h2', text: 'Autotask project creation' },
      { type: 'p', text: 'When a proposal is marked Won and the client is linked to an Autotask company, a "Create Autotask Project" button appears in the Totals tab. This creates a new project in Autotask with the proposal name and stores the project ID.' },
    ],
  },

  // ── Admin & Settings ──────────────────────────────────────────────────────

  {
    id: 'user-management',
    title: 'User Management',
    category: 'admin',
    content: [
      { type: 'p', text: 'The Users page (admin only) lets you create, edit, deactivate, and manage roles for all app users.' },
      { type: 'h2', text: 'Creating a user' },
      { type: 'steps', items: [
        'Go to Users → click New User.',
        'Enter the user\'s name, email, department, and job title.',
        'Assign a role: Admin, Sales Admin, Presales, or Sales.',
        'Choose authentication method: Local (password) or SSO (SAML).',
        'For local users, set a temporary password. The user should change it on first login.',
      ]},
      { type: 'h2', text: 'SCIM provisioning' },
      { type: 'p', text: 'If your organisation uses Entra ID, users can be provisioned automatically via SCIM. Configure the SCIM endpoint and token in Settings → Provisioning. SCIM provisions user name, email, job title, and active status. New SCIM users are created with the Sales role and SSO authentication.' },
      { type: 'h2', text: 'Deactivating users' },
      { type: 'p', text: 'Rather than deleting users (which would break proposal ownership records), deactivate them with the toggle on their row. Deactivated users cannot log in but their proposals remain intact.' },
    ],
  },

  {
    id: 'settings-branding',
    title: 'Branding & Appearance',
    category: 'admin',
    content: [
      { type: 'p', text: 'Branding settings control how the app looks for all users and how exported proposals and customer links are styled.' },
      { type: 'h2', text: 'Configurable branding elements' },
      { type: 'ul', items: [
        'Company Logo — shown in the sidebar, login page, customer links, and PDF exports. SVG or PNG recommended.',
        'Favicon — browser tab icon.',
        'Primary Colour — used for the sidebar, buttons, table headers, and branded elements. Enter a hex code (e.g. #2B3990).',
        'Company Name — shown in the sidebar and footer of customer links.',
        'Subtitle — small tagline under the logo in the sidebar.',
      ]},
      { type: 'h2', text: 'Proposal layout' },
      { type: 'p', text: 'Settings → Proposal Layout controls which sections appear in the PDF and customer-facing link, their order, and their labels. You can disable sections you don\'t want to show (e.g. Terms & Conditions if you include them separately).' },
    ],
  },

  {
    id: 'settings-ai',
    title: 'AI Configuration',
    category: 'admin',
    content: [
      { type: 'p', text: 'The SoW generator uses an AI provider to draft Statement of Work content. Three providers are supported.' },
      { type: 'table', headers: ['Provider', 'Best for', 'Required credentials'], rows: [
        ['Azure OpenAI', 'Microsoft 365 environments with existing Azure OpenAI deployments', 'Endpoint URL, deployment name, API version, and API key'],
        ['Claude (Anthropic)', 'Teams without Azure OpenAI', 'Anthropic API key'],
        ['Demo', 'Testing the app without an AI provider', 'None — returns a structured template'],
      ]},
      { type: 'h2', text: 'Setting up Azure OpenAI' },
      { type: 'steps', items: [
        'In the Azure portal, create an Azure OpenAI resource and deploy a GPT-4o model.',
        'In Settings → AI Provider, select Azure OpenAI.',
        'Enter the Endpoint URL, Deployment Name (e.g. gpt-4o), and API Version.',
        'Enter the API Key and click Save.',
        'Click Generate on any proposal\'s SoW tab to test.',
      ]},
      { type: 'note', text: 'API keys are stored encrypted at rest. They are write-only — you cannot read them back out of the settings page once saved.' },
    ],
  },

  {
    id: 'sso',
    title: 'SSO / SAML Configuration',
    category: 'admin',
    content: [
      { type: 'p', text: 'The app supports SAML 2.0 single sign-on, tested with Microsoft Entra ID (Azure AD). Users can log in with their work accounts without a separate password.' },
      { type: 'h2', text: 'Setup (Entra ID)' },
      { type: 'steps', items: [
        'In Entra ID, create a new Enterprise Application → Non-gallery app.',
        'In the app\'s Single Sign-On settings, configure: Entity ID as the app URL, Reply URL as https://your-app/api/auth/saml/callback.',
        'Download the Federation Metadata XML URL from Entra.',
        'In the app Settings → SSO, paste the metadata URL and click Save. The app will auto-fetch the certificate.',
        'Set the SSO Entry Point to the Login URL from the Entra app\'s SSO settings.',
        'Enable SSO and save.',
      ]},
      { type: 'h2', text: 'Logging in with SSO' },
      { type: 'p', text: 'On the login page, click "Login with Microsoft" (or your configured identity provider name). You will be redirected to Entra to authenticate, then returned to the app.' },
      { type: 'note', text: 'Users provisioned via SCIM are automatically set to SSO authentication. Local password users can switch to SSO once it is configured.' },
    ],
  },

  {
    id: 'backup',
    title: 'Backup & Restore',
    category: 'admin',
    content: [
      { type: 'p', text: 'The Backup & Restore feature (admin only, in Settings) lets you export and re-import all application data as a JSON archive.' },
      { type: 'h2', text: 'Creating a backup' },
      { type: 'steps', items: [
        'Go to Settings → Backup & Restore.',
        'Click Export Backup.',
        'A JSON file is downloaded containing all proposals, users, catalog items, rate cards, templates, clauses, and settings.',
      ]},
      { type: 'h2', text: 'Restoring from backup' },
      { type: 'steps', items: [
        'Go to Settings → Backup & Restore.',
        'Click Choose File and select a previously exported backup JSON.',
        'Click Restore — all existing data is replaced with the backup contents.',
      ]},
      { type: 'warn', text: 'Restore is destructive — it replaces all current data. There is no undo. Only perform a restore if you are certain, and always create a fresh backup beforehand.' },
    ],
  },

  {
    id: 'version-history',
    title: 'Version History',
    category: 'admin',
    content: [
      { type: 'p', text: 'Every time you navigate away from a proposal, a version snapshot is saved automatically. You can use version history to view and restore previous states.' },
      { type: 'h2', text: 'Viewing history' },
      { type: 'steps', items: [
        'Open a proposal and click the History icon (clock) in the top bar.',
        'A side panel shows all saved versions with the date and who saved them.',
        'Click a version to open a read-only comparison view showing what changed.',
        'Click Restore to roll the proposal back to that version.',
      ]},
      { type: 'note', text: 'Version history is read-only viewing — restoring a version creates a new save rather than modifying the version log. All previous versions remain accessible.' },
    ],
  },
];

// ─── Article renderer ────────────────────────────────────────────────────────

function renderSection(s: Section, i: number) {
  switch (s.type) {
    case 'p':
      return <p key={i} className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">{s.text}</p>;

    case 'h2':
      return <h2 key={i} className="text-base font-bold text-gray-900 dark:text-slate-100 mt-6 mb-2 pt-4 border-t border-gray-100 dark:border-slate-700 first:border-0 first:pt-0">{s.text}</h2>;

    case 'h3':
      return <h3 key={i} className="text-sm font-semibold text-gray-800 dark:text-slate-200 mt-4 mb-1">{s.text}</h3>;

    case 'ul':
      return (
        <ul key={i} className="space-y-1.5 my-1">
          {s.items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-300">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol key={i} className="space-y-1.5 my-1">
          {s.items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-slate-300">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case 'steps':
      return (
        <ol key={i} className="space-y-3 my-2">
          {s.items.map((item, j) => (
            <li key={j} className="flex items-start gap-3 text-sm text-gray-700 dark:text-slate-300">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
              <span className="flex-1 pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      );

    case 'note':
      return (
        <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 my-2">
          <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-200">{s.text}</p>
        </div>
      );

    case 'tip':
      return (
        <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 my-2">
          <Lightbulb size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 dark:text-green-200"><strong>Tip: </strong>{s.text}</p>
        </div>
      );

    case 'warn':
      return (
        <div key={i} className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 my-2">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200"><strong>Warning: </strong>{s.text}</p>
        </div>
      );

    case 'table':
      return (
        <div key={i} className="overflow-x-auto my-3 rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700/50">
                {s.headers.map((h, j) => (
                  <th key={j} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide border-b border-gray-200 dark:border-slate-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {s.rows.map((row, j) => (
                <tr key={j} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                  {row.map((cell, k) => (
                    <td key={k} className={clsx('px-4 py-2.5 text-gray-700 dark:text-slate-300', k === 0 && 'font-medium')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Help() {
  useDocumentTitle('Help');
  const [activeId, setActiveId] = useState<string>('overview');
  const [search, setSearch]     = useState('');

  const article = ARTICLES.find(a => a.id === activeId) ?? ARTICLES[0];

  const filteredArticles = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return ARTICLES.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.content.some(s => {
        if (s.type === 'p' || s.type === 'note' || s.type === 'tip' || s.type === 'warn') return s.text.toLowerCase().includes(q);
        if (s.type === 'ul' || s.type === 'ol' || s.type === 'steps') return s.items.some(i => i.toLowerCase().includes(q));
        return false;
      })
    );
  }, [search]);

  return (
    <div className="flex h-full min-h-0">

      {/* ── Left sidebar ────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col">

        {/* Search */}
        <div className="p-4 border-b border-gray-100 dark:border-slate-700">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search help…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Search results */}
        {filteredArticles && (
          <div className="flex-1 overflow-y-auto p-2">
            {filteredArticles.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-6">No results</p>
            ) : (
              filteredArticles.map(a => {
                const cat = CATEGORIES.find(c => c.id === a.category);
                return (
                  <button
                    key={a.id}
                    onClick={() => { setActiveId(a.id); setSearch(''); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 mb-0.5"
                  >
                    <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{a.title}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{cat?.label}</div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Category tree */}
        {!filteredArticles && (
          <nav className="flex-1 overflow-y-auto py-3">
            {CATEGORIES.map(cat => {
              const articles = ARTICLES.filter(a => a.category === cat.id);
              return (
                <div key={cat.id} className="mb-1">
                  <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <span>{cat.icon}</span> {cat.label}
                  </div>
                  {articles.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setActiveId(a.id)}
                      className={clsx(
                        'w-full text-left px-4 py-2 text-sm flex items-center justify-between group transition-colors',
                        activeId === a.id
                          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-medium'
                          : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-slate-100',
                      )}
                    >
                      <span className="truncate">{a.title}</span>
                      {activeId === a.id && <ChevronRight size={14} className="flex-shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        )}
      </aside>

      {/* ── Article content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-8 py-8">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 mb-4">
            <BookOpen size={12} />
            <span>{CATEGORIES.find(c => c.id === article.category)?.label}</span>
            <ChevronRight size={12} />
            <span className="text-gray-600 dark:text-slate-400">{article.title}</span>
          </div>

          {/* Article header */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-6">{article.title}</h1>

          {/* Content */}
          <div className="space-y-3">
            {article.content.map((s, i) => renderSection(s, i))}
          </div>

          {/* Footer nav */}
          <div className="mt-10 pt-6 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
            {(() => {
              const allArticles = ARTICLES;
              const idx = allArticles.findIndex(a => a.id === activeId);
              const prev = idx > 0 ? allArticles[idx - 1] : null;
              const next = idx < allArticles.length - 1 ? allArticles[idx + 1] : null;
              return (
                <>
                  {prev ? (
                    <button onClick={() => setActiveId(prev.id)} className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline">
                      ← {prev.title}
                    </button>
                  ) : <span />}
                  {next ? (
                    <button onClick={() => setActiveId(next.id)} className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline">
                      {next.title} →
                    </button>
                  ) : <span />}
                </>
              );
            })()}
          </div>

          {/* Helpful? */}
          <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center gap-3">
            <CheckCircle2 size={16} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
            <span className="text-sm text-gray-500 dark:text-slate-400 flex-1">Was this article helpful? Raise a ticket or speak to your system administrator for further support.</span>
            <ExternalLink size={14} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
          </div>

        </div>
      </main>
    </div>
  );
}
