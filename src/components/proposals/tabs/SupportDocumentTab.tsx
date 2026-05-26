/**
 * SupportDocumentTab — renders a full IT Managed Service Agreement document.
 *
 * Structure (mirrors the ITRM MSA PDF format):
 *   Cover page → TOC → §1 Confidential / Contact → §2 Intro → §3 Background
 *   → §4 Staff → §5 Certifications → §6 Service Requirements
 *   → §7 Business Requirements → §8 Contractual Requirements
 *   → §9 Schedule 1 (scope + pricing) → §10 Terms → §11 Contract → §12 Signatures
 *
 * Boilerplate sections (§2–§8) are stored in app_settings and editable by admins.
 * Contract-specific sections pull from proposal.supportContract and are editable
 * by any user with edit rights.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Printer, Pencil, Check, X, Plus, Trash2, GripVertical, Info, ImagePlus } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useBranding } from '../../../contexts/BrandingContext';
import { useAuth } from '../../../contexts/AuthContext';
import { canAccessAdmin } from '../../../utils/permissions';
import { settingsApi } from '../../../lib/api';
import type { AppSettings } from '../../../lib/api';
import type { Proposal, SupportContract, SupportScopeItem } from '../../../types';

// ─── Default boilerplate text ─────────────────────────────────────────────────

const DEFAULTS: Record<string, string> = {
  intro: `We are a managed service provider ('MSP') delivering a comprehensive range of IT managed services and project services across key technology areas.

Our support agreements are tailored specifically to your requirements, ensuring that the service you receive is appropriate to your budget and the needs and demands of your business. We take a proactive approach to the management of your IT infrastructure to ensure your business continues to prosper.

We employ a dedicated service desk team to provide telephone, remote access support and onsite support as and when required. Your call will be answered by a technical service desk engineer who will be able to provide initial troubleshooting immediately. The majority of problems are usually resolved remotely and carried out with little or no impact to end users.`,

  background: `We have supported organisations across the UK and internationally since our founding. Our company is built around key service pillars:

• IT Support & Helpdesk
• IT Consultancy & Advisory Services
• Cloud & Infrastructure Solutions
• Network & Security Management
• Application & Web Development

We provide services across many verticals including finance, legal and professional services, media, recruitment, membership organisations, and education. With the use of key management systems and global partner relationships, there is an ability to automate, self-heal and report on major elements of a client's infrastructure.`,

  staff: `Our teams hold various qualifications across different industry-leading vendors and bodies including Microsoft, VMware, Cisco, ITIL, CompTIA, and Prince2.

The majority of our technical engineers, consultants and architects are Microsoft Certified Professionals. We have a comprehensive Competency Development Framework in place to assist with the continued development of staff at all levels, ensuring both their technical and soft skills are continually developed and enhanced to deliver service excellence to our customers.

We do not currently employ any outside contractors. All staff are subject to full employment screening including reference checks, right-to-work verification, and DBS checks where required.`,

  certifications: `We hold industry-recognised certifications and accreditations that demonstrate our commitment to excellence and quality in service delivery.

Our certifications and partnerships include:
• Microsoft Partner
• Cyber Essentials Certified
• ISO 27001 aligned processes
• ITIL Framework practitioners

These accreditations provide our clients with confidence that our processes, security controls and service delivery meet recognised industry standards.`,

  serviceRequirements: `6.1  Help Desk Support
Our support agreements are tailored specifically to your requirements. We employ a dedicated service desk team to provide telephone, remote access and onsite support as required. All managed devices are monitored proactively — directly for most endpoints whilst network devices are monitored via SNMP with automated alerting.

6.2  Support Opening Hours
Our standard support hours are Monday to Friday, 9am to 5pm, excluding public holidays. Enhanced hours, out-of-hours emergency support and 24/7 options are available at additional cost.

6.3  On-Site Engineering Support
Onsite support is included for support incidents that cannot be resolved remotely. No additional callout or labour fees apply for support incidents within the agreement scope. This service excludes new project work and installations, which are agreed separately.

6.4  Break Fix & Installation Services
If a problem cannot be solved remotely we will attend the agreed site(s) as part of the contract with no further fees. Installation services for new hardware or replacement infrastructure that forms part of a project would fall outside the initial agreement.

6.5  Desktop & Laptop Support
Desktop and laptop support is included as part of the monthly per-user fee. We recommend that all devices are within manufacturer's warranty or extended warranty to ensure parts availability.

6.6  Patch Management & Preventative Maintenance
We provide preventative maintenance services on a periodic basis including installing the latest security updates, removing unnecessary files, backup checks and other critical tasks. You will receive a detailed report covering the general performance of the contract and our recommendations for improvements.

6.7  Server & Network System Monitoring
All managed devices are monitored. In the event of a severe outage, our response to you would be immediate. As soon as we are made aware of an issue — or it has been raised via our own monitoring tools — the SLA clock starts.

6.8  Vendor Management
We will liaise with 3rd party vendors on your behalf to analyse, troubleshoot and resolve issues with additional software vendors, assuming support agreements are in place or support is available from those vendors.`,

  businessRequirements: `7.1  Account Management
On award of the contract, a dedicated Account Manager will be appointed as your day-to-day contact. They will provide documentation for managed accounts, quarterly client reports, preventative maintenance reports and a standard approach to client management including scheduled service review meetings.

7.2  Onboarding & Offboarding of Staff
We maintain a clear and documented new-starter and leavers process. The training of new staff on existing technology can be provided to a minimum level; more in-depth user training would be subject to additional cost. Security awareness training to a minimum level is included.

7.3  Compliance
We operate systems and processes that are aligned with ITIL-based frameworks. We can work with you to understand compliance requirements for GDPR, Cyber Essentials and other regulatory frameworks. Time to review compliance gaps is subject to additional costs dependent on the requirement.

7.4  Reporting
Monthly or quarterly service reviews will include: performance against SLAs, network health reports, software licensing compliance, trend and capacity analysis recommendations, discussion of new or changed requirements, and adjustments to IT strategy plans as required.`,

  contractualTerms: `8.1  Contract Length
The contract length is as specified in Schedule 1. Our standard notice period is 90 days prior to the end of the initial agreement. We would be happy to discuss alternative contract lengths and the pricing benefits available.

8.2  Service Levels
Our service levels are based around an initial telephone and remote access support response. Your call will always be answered by technical personnel — we do not operate call queuing systems. We will log a new case and take all necessary details to route your issue to the appropriate skill set for the quickest possible resolution.

Our engineers are targeted to implement a permanent fix or workaround within the stated SLA times. In the event that telephone or remote troubleshooting fails, a qualified engineer will be dispatched to site.

8.3  Software Support
Support is provided for all current Microsoft operating systems and applications, Office 365 and Microsoft 365, current Apple macOS versions, and other agreed software. End-of-life products will have limited support within vendor constraints. Additional software can be added by agreement at commencement.

8.4  Passwords and Systems Access
We operate a password management policy and will retain and manage all administrator credentials for your environment. Access to systems by any other party must be requested in writing by a director or primary IT contact. This policy is enforced to protect your organisation and maintain service levels.`,

  confidentialityNotice: `This proposal is confidential. It contains information and data that we consider confidential and proprietary. Any disclosure of Confidential Information to or use of it by a third party will be damaging to us. Ownership of all Confidential Information remains with us.

Confidential Information in this document shall not be disclosed outside the named recipient organisation and shall not be duplicated, used or disclosed — in whole or in part — for any purpose other than to evaluate this proposal without specific written permission of an authorised representative.`,
};

// ─── Default scope of services ────────────────────────────────────────────────

const DEFAULT_SCOPE: Omit<SupportScopeItem, 'id'>[] = [
  { service: 'Unlimited Remote Helpdesk Support (Mon–Fri, 9am–5pm)', included: true },
  { service: 'Unlimited Onsite Callout & Labour (Support Incidents)', included: true },
  { service: 'Preventative Maintenance', included: true },
  { service: 'Quarterly Service Review Reporting', included: true },
  { service: 'Dedicated Account Management', included: true },
  { service: '3rd Party Vendor Support Management', included: true },
  { service: 'Patch Management & Security Updates', included: true },
  { service: 'Server & Network System Monitoring', included: true },
  { service: 'Business Continuity & Disaster Recovery Planning', included: false },
  { service: '24/7 Out-of-Hours Emergency Support', included: false },
];

// ─── Helper components ────────────────────────────────────────────────────────

function DocPage({ children, brandColor, pageNum, totalPages, companyName, logo, clientName, docDate, docVersion }: {
  children: React.ReactNode;
  brandColor: string;
  pageNum?: number;
  totalPages?: number;
  companyName: string;
  logo: string | null;
  clientName?: string;
  docDate?: string;
  docVersion?: string;
}) {
  return (
    /* Force light-mode text so the white paper page is always readable,
       regardless of whether the surrounding app is in dark mode.          */
    <div className="doc-print-page relative bg-white shadow-sm mb-6 print:mb-0 print:shadow-none"
         style={{ minHeight: '297mm', color: '#111' }}>
      {/* Right accent bar */}
      <div className="absolute right-0 top-0 bottom-0 w-1.5 print:w-2"
           style={{ backgroundColor: brandColor, opacity: 0.85 }} />

      {/* Running header (not on cover) */}
      {pageNum !== undefined && pageNum > 1 && (
        <div className="flex items-center justify-between px-10 pt-6 pb-3 border-b border-gray-100">
          <div className="text-[10px] text-gray-400 leading-tight">
            <div>IT Managed Service Agreement</div>
            {clientName && <div>{clientName}</div>}
            {docDate && <div>{docDate}</div>}
            {docVersion && <div>Version {docVersion}</div>}
          </div>
          {logo
            ? <img src={logo} alt={companyName} className="h-10 object-contain" />
            : <span className="text-sm font-bold" style={{ color: brandColor }}>{companyName}</span>
          }
        </div>
      )}

      {/* Page content */}
      <div className={pageNum === 1 ? 'px-10 py-8' : 'px-10 py-6'}>
        {children}
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-2 border-t border-gray-200 px-10 pb-4 pt-2">
        {pageNum !== undefined && pageNum > 1 && (
          <div className="text-[10px] text-gray-400 text-right">
            Page {pageNum}{totalPages ? ` of ${totalPages}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ num, title }: { num: number; title: string }) {
  return (
    <h2 className="text-lg font-bold text-gray-800 mt-8 mb-3 border-b-2 pb-1"
        style={{ borderColor: 'currentColor' }}>
      {num}&nbsp;&nbsp;&nbsp;{title}
    </h2>
  );
}

function SubHeading({ num, title }: { num: string; title: string }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 mt-5 mb-2">
      {num}&nbsp;&nbsp;&nbsp;{title}
    </h3>
  );
}

function DocTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <table className="w-full text-xs border border-gray-200 mb-4">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="text-left px-3 py-2 bg-gray-100 font-semibold text-gray-700 border-b border-gray-200">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
            {row.map((cell, ci) => (
              <td key={ci} className="px-3 py-2 border-b border-gray-100 align-top">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Boilerplate editor ───────────────────────────────────────────────────────

function BoilerplateSection({
  sectionKey, text, isAdmin, onSave, label, imageDataUrl, onSaveImage,
}: {
  sectionKey: string;
  text: string;
  isAdmin: boolean;
  onSave: (key: string, value: string) => Promise<void>;
  label: string;
  imageDataUrl?: string;
  onSaveImage?: (key: string, dataUrl: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    await onSave(sectionKey, draft);
    setSaving(false);
    setEditing(false);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      await onSaveImage?.(sectionKey, dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  if (editing) {
    return (
      <div className="my-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={12}
          className="w-full text-xs font-sans border border-brand-400 rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 dark:text-slate-100"
        />
        {/* Image area */}
        <div className="mt-2 flex items-start gap-3 flex-wrap">
          {imageDataUrl && (
            <div className="relative inline-block">
              <img src={imageDataUrl} alt="Section image" className="max-h-24 max-w-xs rounded border border-gray-200 object-contain" />
              <button
                type="button"
                onClick={() => onSaveImage?.(sectionKey, null)}
                title="Remove image"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 print:hidden"
              >
                <X size={10} />
              </button>
            </div>
          )}
          <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-dashed border-gray-400 dark:border-slate-500 rounded cursor-pointer hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 text-gray-500 dark:text-slate-400 transition-colors">
            <ImagePlus size={12} /> {imageDataUrl ? 'Replace image' : 'Add image'}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageFile} className="sr-only" />
          </label>
          <span className="text-[10px] text-gray-400 dark:text-slate-500 self-center">Image appears below section text in the document</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50"
          >
            <Check size={11} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setEditing(false); setDraft(text); }}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-slate-200 rounded hover:bg-gray-300"
          >
            <X size={11} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group my-2">
      {/* Rendered text */}
      <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
        {text || <em className="text-gray-400">(no content — click Edit to add)</em>}
      </div>
      {/* Inline image */}
      {imageDataUrl && (
        <div className="mt-3">
          <img src={imageDataUrl} alt="Section image" className="max-h-40 object-contain" />
        </div>
      )}
      {isAdmin && (
        <button
          onClick={() => { setDraft(text); setEditing(true); }}
          title={`Edit "${label}" boilerplate (saved globally)`}
          className="absolute -top-1 -right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-brand-50 dark:bg-slate-700 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-slate-600 print:hidden"
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  );
}

// ─── Inline field editor ──────────────────────────────────────────────────────

function InlineField({ label, value, placeholder, editable, onChange, type = 'text' }: {
  label: string;
  value: string | undefined;
  placeholder?: string;
  editable: boolean;
  onChange: (v: string) => void;
  type?: string;
}) {
  if (!editable) {
    return (
      <div className="flex gap-4 py-1 text-xs border-b border-gray-100">
        <span className="font-semibold text-gray-700 w-32 flex-shrink-0">{label}:</span>
        <span className="text-gray-600">{value || <span className="text-gray-300 italic">{placeholder || '—'}</span>}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 py-1 text-xs border-b border-gray-100">
      <span className="font-semibold text-gray-700 w-32 flex-shrink-0">{label}:</span>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="flex-1 border-0 border-b border-gray-300 focus:border-brand-500 focus:outline-none bg-transparent text-xs text-gray-800 dark:text-slate-200 py-0.5"
      />
    </div>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtCurrency(n: number, symbol = '£'): string {
  return `${symbol}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function currencySymbol(currency: string): string {
  return currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (patch: Partial<Proposal>) => void;
}

export function SupportDocumentTab({ proposal, editable, onUpdate }: Props) {
  const branding = useBranding();
  const { currentUser } = useAuth();
  const isAdmin = canAccessAdmin(currentUser);

  const sc = proposal.supportContract!;
  const sym = currencySymbol(proposal.currency);

  // ── Boilerplate state ────────────────────────────────────────────────────
  const [bp, setBp] = useState<Record<string, string>>(DEFAULTS);
  const [bpImages, setBpImages] = useState<Record<string, string>>({});
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyPhone, setCompanyPhone]     = useState('');

  useEffect(() => {
    settingsApi.get().then((s: AppSettings) => {
      setBp({
        intro:                s['support.doc.intro']                || DEFAULTS.intro,
        background:           s['support.doc.background']           || DEFAULTS.background,
        staff:                s['support.doc.staff']                || DEFAULTS.staff,
        certifications:       s['support.doc.certifications']       || DEFAULTS.certifications,
        serviceRequirements:  s['support.doc.serviceRequirements']  || DEFAULTS.serviceRequirements,
        businessRequirements: s['support.doc.businessRequirements'] || DEFAULTS.businessRequirements,
        contractualTerms:     s['support.doc.contractualTerms']     || DEFAULTS.contractualTerms,
        confidentialityNotice:s['support.doc.confidentialityNotice']|| DEFAULTS.confidentialityNotice,
      });
      // Load any stored section images
      const imgs: Record<string, string> = {};
      for (const key of ['intro','background','staff','certifications','serviceRequirements','businessRequirements','contractualTerms','confidentialityNotice']) {
        const imgKey = `support.doc.image.${key}` as keyof AppSettings;
        if (s[imgKey]) imgs[key] = s[imgKey] as string;
      }
      setBpImages(imgs);
      setCompanyAddress(s['support.doc.companyAddress'] || '');
      setCompanyWebsite(s['support.doc.companyWebsite'] || '');
      setCompanyPhone(s['support.doc.companyPhone'] || '');
    }).catch(() => {/* use defaults */});
  }, []);

  const saveBoilerplate = useCallback(async (key: string, value: string) => {
    await settingsApi.update({ [`support.doc.${key}`]: value } as AppSettings);
    setBp(prev => ({ ...prev, [key]: value }));
  }, []);

  const saveImage = useCallback(async (key: string, dataUrl: string | null) => {
    await settingsApi.update({ [`support.doc.image.${key}`]: dataUrl ?? '' } as AppSettings);
    setBpImages(prev => {
      const next = { ...prev };
      if (dataUrl) next[key] = dataUrl;
      else delete next[key];
      return next;
    });
  }, []);

  // ── Contract update helper ───────────────────────────────────────────────
  const updateSc = useCallback((patch: Partial<SupportContract>) => {
    onUpdate({ supportContract: { ...sc, ...patch } });
  }, [sc, onUpdate]);

  // ── Scope of services ────────────────────────────────────────────────────
  const scope: SupportScopeItem[] = sc.scopeOfServices && sc.scopeOfServices.length > 0
    ? sc.scopeOfServices
    : DEFAULT_SCOPE.map(s => ({ ...s, id: uuid() }));

  const ensureScope = () => {
    if (!sc.scopeOfServices || sc.scopeOfServices.length === 0) {
      updateSc({ scopeOfServices: DEFAULT_SCOPE.map(s => ({ ...s, id: uuid() })) });
    }
  };

  const updateScopeItem = (id: string, patch: Partial<SupportScopeItem>) => {
    ensureScope();
    updateSc({ scopeOfServices: scope.map(s => s.id === id ? { ...s, ...patch } : s) });
  };

  const addScopeItem = () => {
    ensureScope();
    updateSc({ scopeOfServices: [...scope, { id: uuid(), service: '', included: true }] });
  };

  const deleteScopeItem = (id: string) => {
    updateSc({ scopeOfServices: scope.filter(s => s.id !== id) });
  };

  // ── Financial calculations ───────────────────────────────────────────────
  const baseMRR   = sc.pricePerSeat * sc.seats;
  const addonMRR  = sc.addOns.reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * sc.seats : a.price), 0);
  const totalMRR  = baseMRR + addonMRR;
  const totalARR  = totalMRR * 12;
  const totalTCV  = totalMRR * sc.term;
  const onboarding = sc.onboardingCost ?? 0;

  // Year cost breakdown
  const annualBase = totalMRR * 12;
  const yearCosts  = Array.from({ length: Math.ceil(sc.term / 12) }, (_, i) =>
    i === 0 ? annualBase + onboarding : annualBase
  );

  // ── Document meta ────────────────────────────────────────────────────────
  const docVersion   = sc.documentVersion || '1.0';
  const docDate      = fmtDate(proposal.dateModified);
  const preparedFor  = sc.clientContactName || proposal.clientContact || '';
  const author       = sc.contactName || proposal.accountManager || '';
  const contractTerm = `${sc.term} Months`;
  const noticePeriod = sc.noticePeriod || '90';
  const paymentTerms = sc.paymentTermsText || 'Monthly in advance';

  const sharedPageProps = {
    brandColor: branding.primaryColor,
    companyName: branding.companyName,
    logo: branding.logo,
    clientName: proposal.client,
    docDate,
    docVersion,
  };

  // ── Print handler ────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  return (
    <>
      {/* Print styles
          The visibility approach is required because #support-doc-root is
          nested inside React's #root div — not a direct child of <body> —
          so the naive "body > *:not(...)" selector hides everything.        */}
      <style>{`
        @media print {
          /* 1. Hide the whole page */
          body * { visibility: hidden !important; }

          /* 2. Reveal only the document and its descendants */
          #support-doc-root,
          #support-doc-root * { visibility: visible !important; }

          /* 3. Anchor document at top-left of the printed canvas */
          #support-doc-root {
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            padding: 0 !important; margin: 0 !important;
            background: white !important;
          }

          /* 4. Each DocPage fills one A4 sheet */
          .doc-print-page {
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* 5. Page setup */
          @page { margin: 10mm; size: A4; }

          /* 6. Preserve background colours (accent bar, table headers, etc.) */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <Info size={13} />
          {isAdmin
            ? 'Hover over any boilerplate section and click the pencil icon to edit it globally.'
            : 'Boilerplate sections are managed by your administrator in Settings → Support Document.'}
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Document */}
      <div id="support-doc-root" className="bg-gray-100 dark:bg-slate-900 rounded-xl p-6 print:bg-white print:p-0 print:rounded-none">
        <div className="max-w-4xl mx-auto space-y-0 print:max-w-none">

          {/* ── Cover page ───────────────────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={1}>
            {/* Logo area */}
            <div className="flex justify-end mb-20">
              {branding.logo
                ? <img src={branding.logo} alt={branding.companyName} className="h-24 object-contain" />
                : <div className="text-right">
                    <div className="text-4xl font-black" style={{ color: branding.primaryColor }}>{branding.companyName}</div>
                    <div className="text-sm text-gray-400 mt-1">{branding.subtitle}</div>
                  </div>
              }
            </div>

            {/* Title */}
            <div className="mt-8 mb-12">
              <h1 className="text-3xl font-bold text-gray-800 mb-4">
                Proposal for IT Managed Service Agreement
              </h1>
              <h2 className="text-2xl font-bold text-gray-700">{proposal.client}</h2>
            </div>

            {/* Meta table */}
            <div className="border border-gray-200 rounded mb-8 text-sm">
              {[
                ['Version:', docVersion],
                ['Author:', author],
                ['Date:', docDate],
                ['Prepared For:', preparedFor],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-6 px-4 py-2 border-b border-gray-100 last:border-0">
                  <span className="w-36 text-gray-500">{k}</span>
                  <span className="text-gray-800">{v || '—'}</span>
                </div>
              ))}
            </div>

            {/* Confidentiality notice */}
            <p className="text-[10px] text-gray-400 leading-snug mt-auto">
              The information contained in this document is confidential and is to be used solely for the purpose of
              evaluating the proposal and is not to be disclosed to anyone outside the evaluation group without prior
              written authorisation from {branding.companyName}.
            </p>

            {/* Footer */}
            {(companyWebsite || companyPhone || companyAddress) && (
              <div className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-400">
                {companyWebsite && <span className="mr-4 font-medium">{companyWebsite}</span>}
                {companyPhone && <span className="mr-4 font-medium">{companyPhone}</span>}
                {companyAddress && <span>{companyAddress}</span>}
              </div>
            )}
          </DocPage>

          {/* ── §1 Confidential Information ──────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={2}>
            <SectionHeading num={1} title="Confidential Information" />

            <BoilerplateSection
              sectionKey="confidentialityNotice"
              text={bp.confidentialityNotice}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.confidentialityNotice}
              label="Confidentiality Notice"
            />

            <SubHeading num="1.1" title="Contact Information" />
            <p className="text-xs text-gray-600 mb-3">For further information and discussion, please contact:</p>

            <div className="max-w-md">
              {editable ? (
                <div className="space-y-0.5">
                  <InlineField label="Name"        value={sc.contactName}    placeholder="Contact name"   editable onChange={v => updateSc({ contactName: v })} />
                  <InlineField label="Designation"  value={sc.contactTitle}   placeholder="Job title"      editable onChange={v => updateSc({ contactTitle: v })} />
                  <InlineField label="Address"      value={sc.contactAddress} placeholder="Office address"  editable onChange={v => updateSc({ contactAddress: v })} />
                  <InlineField label="Phone"        value={sc.contactPhone}   placeholder="+44 …"          editable onChange={v => updateSc({ contactPhone: v })} />
                  <InlineField label="Mobile"       value={sc.contactMobile}  placeholder="+44 …"          editable onChange={v => updateSc({ contactMobile: v })} />
                  <InlineField label="Email"        value={sc.contactEmail}   placeholder="name@company.com" editable type="email" onChange={v => updateSc({ contactEmail: v })} />
                </div>
              ) : (
                <div className="text-xs space-y-1.5">
                  {[
                    ['Name',        sc.contactName],
                    ['Designation', sc.contactTitle],
                    ['Address',     sc.contactAddress],
                    ['Phone',       sc.contactPhone],
                    ['Mobile',      sc.contactMobile],
                    ['Email',       sc.contactEmail],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex gap-4">
                      <span className="font-semibold w-24">{k}:</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DocPage>

          {/* ── §2 Company Introduction ───────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={3}>
            <SectionHeading num={2} title={`${branding.companyName} – An Introduction`} />
            <BoilerplateSection
              sectionKey="intro"
              text={bp.intro}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.intro}
              label="Company Introduction"
            />
          </DocPage>

          {/* ── §3 Background ────────────────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={4}>
            <SectionHeading num={3} title={`${branding.companyName}'s Background`} />
            <BoilerplateSection
              sectionKey="background"
              text={bp.background}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.background}
              label="Company Background"
            />
          </DocPage>

          {/* ── §4 Staff ─────────────────────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={5}>
            <SectionHeading num={4} title="Staff, Qualifications and Experience" />
            <BoilerplateSection
              sectionKey="staff"
              text={bp.staff}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.staff}
              label="Staff & Qualifications"
            />
          </DocPage>

          {/* ── §5 Certifications ────────────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={6}>
            <SectionHeading num={5} title="Certificates and Accreditations" />
            <BoilerplateSection
              sectionKey="certifications"
              text={bp.certifications}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.certifications}
              label="Certifications"
            />
          </DocPage>

          {/* ── §6 Service Requirements ──────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={7}>
            <SectionHeading num={6} title="Service Requirements" />
            <BoilerplateSection
              sectionKey="serviceRequirements"
              text={bp.serviceRequirements}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.serviceRequirements}
              label="Service Requirements"
            />
          </DocPage>

          {/* ── §7 Business Requirements ─────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={8}>
            <SectionHeading num={7} title="Business Requirements" />
            <BoilerplateSection
              sectionKey="businessRequirements"
              text={bp.businessRequirements}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.businessRequirements}
              label="Business Requirements"
            />
          </DocPage>

          {/* ── §8 Contractual Requirements ──────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={9}>
            <SectionHeading num={8} title="Contractual Requirements" />
            <BoilerplateSection
              sectionKey="contractualTerms"
              text={bp.contractualTerms}
              isAdmin={isAdmin}
              onSave={saveBoilerplate}
              onSaveImage={saveImage}
              imageDataUrl={bpImages.contractualTerms}
              label="Contractual Requirements"
            />

            {/* SLA table — always dynamic */}
            <SubHeading num="8.2" title="Service Level Agreement Summary" />
            <DocTable
              headers={['Priority', 'Systems', 'Target Resolution / Response']}
              rows={[
                ['P1 – Critical',         'Servers, Network, Routers, Firewalls, Internet Services',
                  editable
                    ? <input type="number" value={sc.slaCriticalHours ?? 4} min={1} max={48}
                        onChange={e => updateSc({ slaCriticalHours: Number(e.target.value) })}
                        className="w-16 border-0 border-b border-gray-300 text-xs bg-transparent" />
                    : `${sc.slaCriticalHours ?? 4} Working Hours`
                ],
                ['P2 – Standard',         'Workstations, Printers, Scanners, Peripherals, Standard Software',
                  editable
                    ? <input type="number" value={sc.slaStandardHours ?? 8} min={1} max={48}
                        onChange={e => updateSc({ slaStandardHours: Number(e.target.value) })}
                        className="w-16 border-0 border-b border-gray-300 text-xs bg-transparent" />
                    : `${sc.slaStandardHours ?? 8} Working Hours`
                ],
                ['P3 – Service Request',  'User Set-ups, Deletions, Permissions, Software Config',
                  editable
                    ? <input type="number" value={sc.slaServiceRequestHours ?? 24} min={1} max={72}
                        onChange={e => updateSc({ slaServiceRequestHours: Number(e.target.value) })}
                        className="w-16 border-0 border-b border-gray-300 text-xs bg-transparent" />
                    : `${sc.slaServiceRequestHours ?? 24} Working Hours`
                ],
              ]}
            />
            <p className="text-[10px] text-gray-400 italic">
              Note: This service does not cover new installations, projects or office relocations. These are charged on an ad-hoc basis.
            </p>
          </DocPage>

          {/* ── §9 Schedule 1 ────────────────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={10}>
            <SectionHeading num={9} title="Schedule 1" />

            {/* 9.1 Scope of services */}
            <SubHeading num="9.1" title="Scope of Services" />
            <table className="w-full text-xs border border-gray-200 mb-4">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 bg-gray-100 border-b border-gray-200 font-semibold text-gray-700 w-4/5">Type of Service</th>
                  <th className="text-center px-3 py-2 bg-gray-100 border-b border-gray-200 font-semibold text-gray-700">Included</th>
                  {editable && <th className="px-2 py-2 bg-gray-100 border-b border-gray-200 print:hidden w-8" />}
                </tr>
              </thead>
              <tbody>
                {scope.map((item, ri) => (
                  <tr key={item.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 border-b border-gray-100">
                      {editable
                        ? <input value={item.service} onChange={e => updateScopeItem(item.id, { service: e.target.value })}
                            className="w-full border-0 border-b border-transparent hover:border-gray-300 focus:border-brand-400 focus:outline-none bg-transparent text-xs" />
                        : item.service
                      }
                    </td>
                    <td className="px-3 py-2 border-b border-gray-100 text-center">
                      {editable
                        ? <button
                            onClick={() => updateScopeItem(item.id, { included: !item.included })}
                            className={`text-base font-bold ${item.included ? 'text-green-600' : 'text-red-400'}`}
                          >{item.included ? '✓' : '✗'}</button>
                        : <span className={`font-bold ${item.included ? 'text-green-600' : 'text-gray-300'}`}>
                            {item.included ? '✓' : '✗'}
                          </span>
                      }
                    </td>
                    {editable && (
                      <td className="px-2 py-2 border-b border-gray-100 text-center print:hidden">
                        <button onClick={() => deleteScopeItem(item.id)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {editable && (
              <button
                onClick={addScopeItem}
                className="print:hidden inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 mb-4"
              >
                <Plus size={11} /> Add service line
              </button>
            )}

            {/* 9.2 Supported users */}
            <SubHeading num="9.2" title="Supported Users Covered Under this Agreement" />
            <DocTable
              headers={['Users / Service', 'Cost Per User Per Month', 'Total Cost Per Annum']}
              rows={[
                [
                  `${sc.seats} ${sc.tier} Users`,
                  fmtCurrency(sc.pricePerSeat, sym),
                  fmtCurrency(sc.pricePerSeat * sc.seats * 12, sym),
                ],
                ...sc.addOns.map(a => [
                  a.name,
                  a.priceType === 'per_seat' ? `${fmtCurrency(a.price, sym)} per seat` : 'Flat',
                  fmtCurrency((a.priceType === 'per_seat' ? a.price * sc.seats : a.price) * 12, sym),
                ]),
                ['Total Costs', '', fmtCurrency(totalARR, sym)],
              ]}
            />

            {/* 9.3 Commercial overview */}
            <SubHeading num="9.3" title="Commercial Overview" />
            <DocTable
              headers={['Service', 'Users / Qty', 'Total Cost Per Annum']}
              rows={[
                [
                  `IT Managed Service (${sc.tier})`,
                  String(sc.seats),
                  fmtCurrency(annualBase, sym),
                ],
                ...(onboarding > 0
                  ? [['Onboarding / Setup', '1', fmtCurrency(onboarding, sym)]]
                  : []),
                ...yearCosts.map((cost, i) => [
                  <strong key={i}>Year {i + 1} Total</strong>,
                  '',
                  <strong key={i}>{fmtCurrency(cost, sym)}</strong>,
                ]),
              ]}
            />
            {editable && (
              <div className="flex items-center gap-3 mt-2 text-xs print:hidden">
                <label className="text-gray-600">Onboarding cost:</label>
                <input
                  type="number"
                  min={0}
                  value={sc.onboardingCost ?? ''}
                  placeholder="0.00"
                  onChange={e => updateSc({ onboardingCost: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-28 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                />
              </div>
            )}
          </DocPage>

          {/* ── §10 Contractual Terms ─────────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={11}>
            <SectionHeading num={10} title="Contractual Terms" />
            <div className="text-xs text-gray-700 mb-6">
              {contractTerm} with{' '}
              {editable
                ? <input type="number" value={noticePeriod} min={1}
                    onChange={e => updateSc({ noticePeriod: e.target.value })}
                    className="w-12 border-b border-gray-400 focus:outline-none text-xs bg-transparent inline" />
                : noticePeriod
              }{' '}
              days written notice required prior to the end of the contract term.
            </div>

            <SubHeading num="10.1" title="Payment Terms" />
            <div className="text-xs text-gray-700 mb-4">
              Payment terms for all services included in this agreement are{' '}
              {editable
                ? <input value={paymentTerms}
                    onChange={e => updateSc({ paymentTermsText: e.target.value })}
                    className="border-b border-gray-400 focus:outline-none text-xs bg-transparent inline w-40" />
                : <strong>{paymentTerms}</strong>
              }.
            </div>

            {/* Financial summary */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                ['Monthly Recurring', fmtCurrency(totalMRR, sym)],
                ['Annual Recurring',  fmtCurrency(totalARR, sym)],
                [`Total Contract Value (${sc.term}m)`, fmtCurrency(totalTCV, sym)],
              ].map(([label, value]) => (
                <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50">
                  <div className="text-[10px] text-gray-500 mb-1">{label}</div>
                  <div className="text-base font-bold" style={{ color: branding.primaryColor }}>{value}</div>
                </div>
              ))}
            </div>
          </DocPage>

          {/* ── §11 Service Contract ──────────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={12}>
            <SectionHeading num={11} title="Service Contract" />

            <p className="text-xs text-gray-700 italic mb-4">
              In conjunction with this IT Managed Service Agreement, the {branding.companyName} General Terms and
              Conditions of Business and supplementary Terms – IT Support Services.
            </p>

            <div className="space-y-0.5 max-w-md">
              <InlineField
                label="Contract Term"
                value={contractTerm}
                editable={false}
                onChange={() => {}}
              />
              {editable ? (
                <InlineField
                  label="Commencement Date"
                  value={sc.commencementDate}
                  placeholder="YYYY-MM-DD"
                  editable
                  type="date"
                  onChange={v => updateSc({ commencementDate: v })}
                />
              ) : (
                <InlineField
                  label="Commencement Date"
                  value={fmtDate(sc.commencementDate)}
                  editable={false}
                  onChange={() => {}}
                />
              )}
              <InlineField
                label="Account Manager"
                value={proposal.accountManager}
                editable={false}
                onChange={() => {}}
              />
              {editable ? (
                <InlineField
                  label="Site"
                  value={sc.site}
                  placeholder="Client site / location"
                  editable
                  onChange={v => updateSc({ site: v })}
                />
              ) : (
                <InlineField label="Site" value={sc.site} editable={false} onChange={() => {}} />
              )}
              <InlineField
                label="Client Contact"
                value={preparedFor}
                editable={false}
                onChange={() => {}}
              />
            </div>

            <div className="mt-6 text-xs text-gray-700">
              <strong>Payment Terms</strong> (in conjunction with our General Terms and Conditions of Business):{' '}
              {paymentTerms}.
            </div>
          </DocPage>

          {/* ── §12 Authorised Signatures ─────────────────────────────── */}
          <DocPage {...sharedPageProps} pageNum={13}>
            <SectionHeading num={12} title="Authorised Signatures" />

            <p className="text-xs text-gray-700 mb-8">
              The Client and the Company agree to work under this Agreement and abide by {branding.companyName}'s
              General Terms and Conditions of Business.
            </p>

            <div className="grid grid-cols-2 gap-12 mt-4">
              {[
                [`Signed on behalf of ${branding.companyName}`, sc.contactName],
                [`Signed on behalf of ${proposal.client}`, preparedFor],
              ].map(([header, name]) => (
                <div key={header as string}>
                  <p className="text-xs font-semibold text-gray-700 mb-6">{header as string}</p>
                  {[['Signature', ''], ['Name', name as string], ['Title', ''], ['Date', '']].map(([label, val]) => (
                    <div key={label} className="mb-4">
                      <div className="border-b border-gray-400 pb-0.5 text-xs text-gray-600 min-h-[20px]">{val}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer branding */}
            {(companyWebsite || companyPhone || companyAddress) && (
              <div className="mt-auto pt-8 border-t border-gray-200 text-[10px] text-gray-400 flex flex-wrap gap-4">
                {companyWebsite && <span className="font-medium" style={{ color: branding.primaryColor }}>{companyWebsite}</span>}
                {companyPhone && <span className="font-medium">{companyPhone}</span>}
                {companyAddress && <span>{companyAddress}</span>}
              </div>
            )}
          </DocPage>

        </div>
      </div>
    </>
  );
}
