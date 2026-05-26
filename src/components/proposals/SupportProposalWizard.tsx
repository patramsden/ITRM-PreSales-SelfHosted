/**
 * 3-step wizard for creating a support / managed-service proposal.
 *
 * Step 1 — Contract details: client, name, AM, currency, support hours, term & discount
 * Step 2 — Users & add-ons: full-time seats, part-time seats, catalog add-on picker
 * Step 3 — Review & create
 */
import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { X, ChevronDown, Check, Users, Clock, Plus, Trash2 } from 'lucide-react';
import type { Proposal, SupportContract, SupportAddOn, SupportHours, Currency, CatalogItem } from '../../types';
import { AutotaskCompanyPicker } from '../crm/AutotaskPicker';
import { useStore } from '../../store';
import clsx from 'clsx';

interface Props {
  onClose: () => void;
  onCreate: (proposal: Proposal) => void;
  currentUserId: string;
  currentUserName: string;
}

// ─── Support hours options ────────────────────────────────────────────────────

const SUPPORT_HOURS_OPTIONS = [
  { id: 'standard' as SupportHours, label: 'Mon–Fri  9am–5pm', sublabel: 'Standard (8hr)',  price: 40 },
  { id: 'extended' as SupportHours, label: 'Mon–Fri  8am–6pm', sublabel: 'Extended (10hr)', price: 50 },
  { id: 'premium'  as SupportHours, label: 'Mon–Fri  7am–7pm', sublabel: 'Premium (12hr)',  price: 60 },
] as const;

// ─── Term options ─────────────────────────────────────────────────────────────

const TERM_OPTIONS = [
  { value: 12 as const, label: '1 Year',  years: 1, maxDiscount: 0,  discountHint: '' },
  { value: 36 as const, label: '3 Years', years: 3, maxDiscount: 5,  discountHint: 'Up to 5% discount' },
  { value: 60 as const, label: '5 Years', years: 5, maxDiscount: 10, discountHint: 'Up to 10% discount' },
] as const;

const BILLING_OPTIONS: Array<{ value: SupportContract['billingCycle']; label: string }> = [
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually',  label: 'Annually'  },
];

const DEFAULT_INCLUSIONS = [
  'Unlimited remote helpdesk support',
  'Proactive patch management',
  'Endpoint monitoring & alerting',
  'Antivirus & endpoint protection',
  'Monthly service review report',
];

const DEFAULT_EXCLUSIONS = [
  'Third-party software licensing costs',
  'Hardware procurement and replacement',
  'Out-of-scope project work',
];

// ─── Financial helpers ────────────────────────────────────────────────────────

function calcDiscountedBase(pricePerSeat: number, discountPct: number): number {
  return pricePerSeat * (1 - discountPct / 100);
}

function calcMRR(opts: {
  pricePerSeat: number;
  seats: number;
  partTimeSeats: number;
  termDiscountPct: number;
  addOns: SupportAddOn[];
}): number {
  const base = calcDiscountedBase(opts.pricePerSeat, opts.termDiscountPct);
  const full = base * opts.seats;
  const part = base * 0.5 * opts.partTimeSeats;
  const addons = opts.addOns.reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * opts.seats : a.price), 0);
  return full + part + addons;
}

function calcOnboarding(pricePerSeat: number, seats: number, partTimeSeats: number): number {
  // 1 month base cost, no term discount, no add-ons
  return pricePerSeat * seats + pricePerSeat * 0.5 * partTimeSeats;
}

function fmtCurr(n: number, sym = '£'): string {
  return `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
            i < current   ? 'bg-brand-600 text-white'
            : i === current ? 'bg-brand-600 text-white ring-2 ring-brand-300'
            : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400'
          )}>
            {i < current ? <Check size={12} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={clsx('h-0.5 w-8 transition-colors', i < current ? 'bg-brand-600' : 'bg-gray-200 dark:bg-slate-600')} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Add-on picker ────────────────────────────────────────────────────────────

function CatalogAddonPicker({
  catalogItems, selected, seats, currency,
  onAdd, onRemove, onUpdatePrice,
}: {
  catalogItems: CatalogItem[];
  selected: SupportAddOn[];
  seats: number;
  currency: Currency;
  onAdd: (a: SupportAddOn) => void;
  onRemove: (id: string) => void;
  onUpdatePrice: (id: string, price: number) => void;
}) {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  const supportItems = catalogItems.filter(c => c.isSupportAddon);
  const selectedIds = new Set(selected.map(a => a.name)); // match by name for catalog-sourced items

  if (supportItems.length === 0) {
    return (
      <div className="text-xs text-gray-400 dark:text-slate-500 italic px-1">
        No catalog items are tagged as Support Add-ons yet. Go to Catalog → edit any item → enable "Available as Support Add-on".
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Available catalog items */}
      <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {supportItems.map(ci => {
          const isSelected = selected.some(a => a.name === ci.description);
          const priceType = ci.supportAddonPriceType ?? 'per_seat';
          return (
            <div
              key={ci.id}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                isSelected
                  ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-brand-300 dark:hover:border-brand-600'
              )}
              onClick={() => {
                if (isSelected) {
                  const existing = selected.find(a => a.name === ci.description);
                  if (existing) onRemove(existing.id);
                } else {
                  onAdd({ id: uuid(), name: ci.description, priceType, price: ci.listPrice });
                }
              }}
            >
              <div className={clsx(
                'w-4 h-4 rounded flex items-center justify-center border-2 transition-colors flex-shrink-0',
                isSelected ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 dark:border-slate-500'
              )}>
                {isSelected && <Check size={10} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{ci.description}</div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {fmtCurr(ci.listPrice, sym)}{priceType === 'per_seat' ? '/seat/mo' : '/mo flat'}
                  {priceType === 'per_seat' && seats > 0 && (
                    <span className="ml-1 text-gray-300"> · {fmtCurr(ci.listPrice * seats, sym)}/mo total</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected items with price override */}
      {selected.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-xs font-medium text-gray-500 dark:text-slate-400">Selected add-ons (price overrideable):</div>
          {selected.map(a => (
            <div key={a.id} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-gray-700 dark:text-slate-300 truncate">{a.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">{sym}</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={a.price}
                  onChange={e => onUpdatePrice(a.id, parseFloat(e.target.value) || 0)}
                  onClick={e => e.stopPropagation()}
                  className="w-20 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-xs text-gray-400">{a.priceType === 'per_seat' ? '/seat' : '/mo'}</span>
              </div>
              <button
                onClick={() => onRemove(a.id)}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function SupportProposalWizard({ onClose, onCreate, currentUserId, currentUserName }: Props) {
  const [step, setStep] = useState(0);
  // Use separate selectors — a single selector returning {} creates a new reference
  // every render, causing an infinite re-render loop (React error #185).
  const catalog = useStore(s => s.catalog);
  const users   = useStore(s => s.users);

  // ── Step 1: Contract details ────────────────────────────────────────────
  const [projectName,    setProjectName]    = useState('');
  const [client,         setClient]         = useState('');
  const [crmCompanyId,   setCrmCompanyId]   = useState<string | undefined>();
  const [accountManager, setAccountManager] = useState('');
  const [currency,       setCurrency]       = useState<Currency>('GBP');
  const [supportHours,   setSupportHours]   = useState<SupportHours>('standard');
  const [priceOverride,  setPriceOverride]  = useState<number | null>(null); // null = use default
  const [term,           setTerm]           = useState<12 | 36 | 60>(36);
  const [termDiscountPct,setTermDiscountPct]= useState(0);
  const [billingCycle,   setBillingCycle]   = useState<SupportContract['billingCycle']>('monthly');

  // ── Step 1 optional: document details ────────────────────────────────
  const [showAdvanced,      setShowAdvanced]      = useState(false);
  const [contactName,       setContactName]       = useState('');
  const [contactTitle,      setContactTitle]      = useState('');
  const [contactEmail,      setContactEmail]      = useState('');
  const [contactPhone,      setContactPhone]      = useState('');
  const [contactMobile,     setContactMobile]     = useState('');
  const [contactAddress,    setContactAddress]    = useState('');
  const [clientContactName, setClientContactName] = useState('');
  const [commencementDate,  setCommencementDate]  = useState('');
  const [site,              setSite]              = useState('');

  // ── Step 2: Users & add-ons ───────────────────────────────────────────
  const [seats,         setSeats]         = useState<number | ''>(10);
  const [partTimeSeats, setPartTimeSeats] = useState<number | ''>(0);
  const [addOns,        setAddOns]        = useState<SupportAddOn[]>([]);
  const [inclusions,    setInclusions]    = useState<string[]>(DEFAULT_INCLUSIONS);
  const [exclusions,    setExclusions]    = useState<string[]>(DEFAULT_EXCLUSIONS);

  // ── Derived ────────────────────────────────────────────────────────────
  const sym            = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  const hoursMeta      = SUPPORT_HOURS_OPTIONS.find(h => h.id === supportHours)!;
  const basePrice      = priceOverride ?? hoursMeta.price;
  const seatsNum       = typeof seats === 'number' ? seats : 0;
  const partNum        = typeof partTimeSeats === 'number' ? partTimeSeats : 0;
  const termMeta       = TERM_OPTIONS.find(t => t.value === term)!;
  const onboardingCost = calcOnboarding(basePrice, seatsNum, partNum);
  const mrr            = calcMRR({ pricePerSeat: basePrice, seats: seatsNum, partTimeSeats: partNum, termDiscountPct, addOns });
  const arr            = mrr * 12;
  const tcv            = mrr * term;

  const STEP_TITLES = ['Contract Details', 'Users & Add-ons', 'Review & Create'];

  // ── Validation ──────────────────────────────────────────────────────────
  const step1Valid = client.trim().length > 0;
  const step2Valid = seatsNum > 0;
  const canNext = step === 0 ? step1Valid : step === 1 ? step2Valid : false;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCreate = () => {
    const contract: SupportContract = {
      supportHours,
      pricePerSeat: basePrice,
      seats: seatsNum,
      partTimeSeats: partNum || undefined,
      term,
      termDiscountPct: termDiscountPct || undefined,
      billingCycle,
      addOns,
      inclusions,
      exclusions,
      onboardingCost,
      documentVersion: '1.0',
      ...(contactName       && { contactName }),
      ...(contactTitle      && { contactTitle }),
      ...(contactEmail      && { contactEmail }),
      ...(contactPhone      && { contactPhone }),
      ...(contactMobile     && { contactMobile }),
      ...(contactAddress    && { contactAddress }),
      ...(clientContactName && { clientContactName }),
      ...(commencementDate  && { commencementDate }),
      ...(site              && { site }),
    };
    const proposal: Proposal = {
      id:             uuid(),
      projectName:    projectName || `Managed Service — ${client}`,
      client,
      crmCompanyId,
      accountManager,
      currency,
      status:         'New',
      dateCreated:    new Date().toISOString().split('T')[0],
      dateModified:   new Date().toISOString().split('T')[0],
      markupPct:      0,
      ownerId:        currentUserId,
      lastModifiedBy: currentUserName,
      lastModifiedAt: new Date().toISOString(),
      collaboratorIds: [],
      parts:  [],
      phases: [],
      proposalType:    'support',
      supportContract: contract,
    };
    onCreate(proposal);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">New Support Proposal</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{STEP_TITLES[step]}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
              <X size={18} />
            </button>
          </div>
          <StepIndicator current={step} total={3} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Step 1 ─────────────────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Client <span className="text-red-500">*</span></label>
                <AutotaskCompanyPicker
                  value={client}
                  crmId={crmCompanyId}
                  onChange={(name, id) => {
                    setClient(name);
                    setCrmCompanyId(id);
                    if (!projectName) setProjectName(`Managed Service — ${name}`);
                  }}
                  placeholder="Search Autotask or type client name…"
                />
              </div>

              {/* Proposal name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Proposal Name</label>
                <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                  placeholder={client ? `Managed Service — ${client}` : 'e.g. Managed Service — Acme Corp'}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              {/* AM + Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Account Manager</label>
                  <input list="am-list" type="text" value={accountManager} onChange={e => setAccountManager(e.target.value)}
                    placeholder="Name"
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <datalist id="am-list">{users.map(u => <option key={u.id} value={u.name} />)}</datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value as Currency)}
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    {['GBP', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Support Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Support Hours</label>
                <div className="grid grid-cols-3 gap-2">
                  {SUPPORT_HOURS_OPTIONS.map(h => (
                    <button key={h.id} type="button" onClick={() => {
                      setSupportHours(h.id);
                      if (priceOverride === null) { /* auto price follows */ }
                    }}
                      className={clsx('flex flex-col items-center py-3 px-2 rounded-xl border-2 text-center transition-colors',
                        supportHours === h.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-gray-200 dark:border-slate-600 hover:border-brand-300'
                      )}>
                      <Clock size={16} className={supportHours === h.id ? 'text-brand-600' : 'text-gray-400'} />
                      <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 mt-1.5">{h.label}</span>
                      <span className="text-[11px] text-gray-500 dark:text-slate-400">{h.sublabel}</span>
                      <span className="mt-1.5 text-sm font-bold text-brand-600 dark:text-brand-400">{sym}{h.price}<span className="text-xs font-normal text-gray-400">/seat</span></span>
                    </button>
                  ))}
                </div>
                {/* Price override */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-slate-400">Override price:</span>
                  <span className="text-xs text-gray-500">{sym}</span>
                  <input
                    type="number" min={0} step={1}
                    value={priceOverride ?? ''}
                    placeholder={String(hoursMeta.price)}
                    onChange={e => setPriceOverride(e.target.value ? Number(e.target.value) : null)}
                    className="w-20 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  {priceOverride !== null && (
                    <button onClick={() => setPriceOverride(null)} className="text-xs text-brand-600 hover:underline">Reset to default</button>
                  )}
                </div>
              </div>

              {/* Term */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Contract Term</label>
                <div className="grid grid-cols-3 gap-2">
                  {TERM_OPTIONS.map(t => (
                    <button key={t.value} type="button" onClick={() => {
                      setTerm(t.value);
                      setTermDiscountPct(0);
                    }}
                      className={clsx('relative py-3 px-3 rounded-xl border text-sm font-medium transition-colors text-center',
                        term === t.value
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-brand-400'
                      )}>
                      <div>{t.label}</div>
                      {t.discountHint && (
                        <div className={clsx('text-[10px] mt-0.5', term === t.value ? 'text-brand-200' : 'text-gray-400 dark:text-slate-500')}>
                          {t.discountHint}
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Discount slider — only for 3yr or 5yr */}
                {termMeta.maxDiscount > 0 && (
                  <div className="mt-3 bg-gray-50 dark:bg-slate-700/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-gray-600 dark:text-slate-300">Term discount on base price</span>
                      <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{termDiscountPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={termMeta.maxDiscount}
                      step={0.5}
                      value={termDiscountPct}
                      onChange={e => setTermDiscountPct(Number(e.target.value))}
                      className="w-full accent-brand-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                      <span>0%</span>
                      <span>Max {termMeta.maxDiscount}%</span>
                    </div>
                    {termDiscountPct > 0 && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-slate-300">
                        Discounted price: <strong className="text-brand-600">{sym}{calcDiscountedBase(basePrice, termDiscountPct).toFixed(2)}/seat/mo</strong>
                        {' '}(saving {sym}{(basePrice - calcDiscountedBase(basePrice, termDiscountPct)).toFixed(2)}/seat)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Billing cycle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Billing Cycle</label>
                <div className="flex gap-2">
                  {BILLING_OPTIONS.map(b => (
                    <button key={b.value} type="button" onClick={() => setBillingCycle(b.value)}
                      className={clsx('flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                        billingCycle === b.value
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-brand-400'
                      )}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced / document details */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <span>Document & Contact Details <span className="text-xs font-normal text-gray-400">(optional)</span></span>
                  <ChevronDown size={14} className={clsx('transition-transform', showAdvanced && 'rotate-180')} />
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-3 border-t border-gray-100 dark:border-slate-700">
                    {([
                      ['Contact Name (MSP)', contactName,       setContactName,       'text'],
                      ['Contact Title',      contactTitle,      setContactTitle,      'text'],
                      ['Contact Email',      contactEmail,      setContactEmail,      'email'],
                      ['Contact Phone',      contactPhone,      setContactPhone,      'text'],
                      ['Contact Mobile',     contactMobile,     setContactMobile,     'text'],
                      ['Client Contact',     clientContactName, setClientContactName, 'text'],
                      ['Contract Start',     commencementDate,  setCommencementDate,  'date'],
                      ['Site / Location',    site,              setSite,              'text'],
                    ] as const).map(([label, val, setter, type]) => (
                      <div key={label}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{label}</label>
                        <input
                          type={type}
                          value={val}
                          onChange={e => (setter as (v: string) => void)(e.target.value)}
                          className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Contact Address</label>
                      <input type="text" value={contactAddress} onChange={e => setContactAddress(e.target.value)}
                        placeholder="Office address"
                        className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Users & Add-ons ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Seat counts */}
              <div className="bg-gray-50 dark:bg-slate-700/40 rounded-xl p-4 space-y-3">
                <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                  <Users size={15} /> User Counts
                </div>

                {/* Full-time */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-slate-200">Full-time users</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">
                      {sym}{calcDiscountedBase(basePrice, termDiscountPct).toFixed(2)}/seat/mo
                      {seatsNum > 0 && <span className="ml-1">· {sym}{(calcDiscountedBase(basePrice, termDiscountPct) * seatsNum).toFixed(2)}/mo total</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSeats(Math.max(1, seatsNum - 1))} className="w-7 h-7 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold">−</button>
                    <input type="number" min={1} value={seats} onChange={e => setSeats(parseInt(e.target.value) || 1)}
                      className="w-16 text-center border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <button onClick={() => setSeats(seatsNum + 1)} className="w-7 h-7 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold">+</button>
                  </div>
                </div>

                {/* Part-time */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-slate-200">Part-time users <span className="text-xs font-normal text-gray-400">(50% price)</span></div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">
                      {sym}{(calcDiscountedBase(basePrice, termDiscountPct) * 0.5).toFixed(2)}/seat/mo
                      {partNum > 0 && <span className="ml-1">· {sym}{(calcDiscountedBase(basePrice, termDiscountPct) * 0.5 * partNum).toFixed(2)}/mo total</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPartTimeSeats(Math.max(0, partNum - 1))} className="w-7 h-7 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold">−</button>
                    <input type="number" min={0} value={partTimeSeats} onChange={e => setPartTimeSeats(parseInt(e.target.value) || 0)}
                      className="w-16 text-center border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <button onClick={() => setPartTimeSeats(partNum + 1)} className="w-7 h-7 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold">+</button>
                  </div>
                </div>

                {/* Onboarding */}
                <div className="pt-2 border-t border-gray-200 dark:border-slate-600 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-slate-200">Onboarding <span className="text-xs font-normal text-gray-400">(1 month base cost)</span></div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">One-time fee, added to Year 1</div>
                  </div>
                  <div className="text-sm font-bold text-brand-600 dark:text-brand-400">{sym}{onboardingCost.toFixed(2)}</div>
                </div>
              </div>

              {/* Add-ons from catalog */}
              <div>
                <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Optional Add-ons</div>
                <CatalogAddonPicker
                  catalogItems={catalog}
                  selected={addOns}
                  seats={seatsNum}
                  currency={currency}
                  onAdd={a => setAddOns([...addOns, a])}
                  onRemove={id => setAddOns(addOns.filter(a => a.id !== id))}
                  onUpdatePrice={(id, price) => setAddOns(addOns.map(a => a.id === id ? { ...a, price } : a))}
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Review ───────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Contract summary */}
              <div className="bg-gray-50 dark:bg-slate-700/40 rounded-xl p-4 text-sm space-y-2">
                <div className="font-semibold text-gray-800 dark:text-slate-200 mb-3">Contract Summary</div>
                {[
                  ['Client',          client],
                  ['Support Hours',   hoursMeta.label],
                  ['Base Price',      `${sym}${basePrice}/seat/mo${termDiscountPct > 0 ? ` → ${sym}${calcDiscountedBase(basePrice, termDiscountPct).toFixed(2)} after ${termDiscountPct}% discount` : ''}`],
                  ['Contract Term',   `${term === 12 ? '1 Year' : term === 36 ? '3 Years' : '5 Years'}`],
                  ['Billing',         billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)],
                  ['Full-time users', String(seatsNum)],
                  ...(partNum > 0 ? [['Part-time users', `${partNum} (50% price)`]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-slate-400">{k}</span>
                    <span className="font-medium text-gray-800 dark:text-slate-200 text-right">{v}</span>
                  </div>
                ))}
              </div>

              {/* Financial breakdown */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Monthly Recurring (MRR)', fmtCurr(mrr, sym)],
                  ['Annual Recurring (ARR)',  fmtCurr(arr, sym)],
                  [`Total Contract Value (${term === 12 ? '1yr' : term === 36 ? '3yr' : '5yr'})`, fmtCurr(tcv, sym)],
                  ['Onboarding (one-time)',   fmtCurr(onboardingCost, sym)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
                    <div className="text-xs text-gray-400 dark:text-slate-500 mb-1">{label}</div>
                    <div className="text-base font-bold text-brand-600 dark:text-brand-400">{value}</div>
                  </div>
                ))}
              </div>

              {addOns.length > 0 && (
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
                  <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">Add-ons included</div>
                  {addOns.map(a => (
                    <div key={a.id} className="flex justify-between text-xs text-gray-600 dark:text-slate-300">
                      <span>{a.name}</span>
                      <span>{fmtCurr(a.price, sym)}{a.priceType === 'per_seat' ? `/seat · ${fmtCurr(a.price * seatsNum, sym)} total` : ' flat'}/mo</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            {step === 0 ? 'Cancel' : '← Back'}
          </button>

          {step < 2 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-1.5"
            >
              <Check size={14} /> Create Proposal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
