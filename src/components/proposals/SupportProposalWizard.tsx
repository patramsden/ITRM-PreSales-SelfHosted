/**
 * 4-step wizard for creating a managed-service / support proposal.
 *
 * Step 1 — Contract details (client, name, term, billing cycle)
 * Step 2 — Service tier (tier name, description, per-seat price)
 * Step 3 — Users & add-ons (seat count, optional add-on services)
 * Step 4 — Review & create
 */
import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, Check } from 'lucide-react';
import type { Proposal, SupportContract, SupportAddOn, Currency } from '../../types';
import { AutotaskCompanyPicker } from '../crm/AutotaskPicker';
import { useStore } from '../../store';
import clsx from 'clsx';

interface Props {
  onClose: () => void;
  onCreate: (proposal: Proposal) => void;
  currentUserId: string;
  currentUserName: string;
}

// ─── Default add-on catalogue ─────────────────────────────────────────────────

const DEFAULT_ADDONS: Omit<SupportAddOn, 'id'>[] = [
  { name: 'Backup & Disaster Recovery',    priceType: 'per_seat', price: 3  },
  { name: 'Security Awareness Training',   priceType: 'per_seat', price: 2  },
  { name: 'Dark Web Monitoring',           priceType: 'per_seat', price: 1.5},
  { name: 'Microsoft 365 Management',      priceType: 'per_seat', price: 5  },
  { name: '24/7 NOC Monitoring',           priceType: 'flat',     price: 250},
  { name: 'On-site Engineer Days (×1/mo)', priceType: 'flat',     price: 800},
  { name: 'Cyber Essentials Management',   priceType: 'flat',     price: 150},
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

const TERM_OPTIONS: Array<{ value: 12 | 24 | 36; label: string; badge: string }> = [
  { value: 12, label: '1 Year',  badge: ''          },
  { value: 24, label: '2 Years', badge: 'Popular'   },
  { value: 36, label: '3 Years', badge: 'Best Value' },
];

const BILLING_OPTIONS: Array<{ value: SupportContract['billingCycle']; label: string }> = [
  { value: 'monthly',    label: 'Monthly'    },
  { value: 'quarterly',  label: 'Quarterly'  },
  { value: 'annually',   label: 'Annually'   },
];

// ─── Calculation helper ───────────────────────────────────────────────────────

function calcMRR(contract: Pick<SupportContract, 'pricePerSeat' | 'seats' | 'addOns'>): number {
  const baseMRR = contract.pricePerSeat * contract.seats;
  const addOnMRR = contract.addOns.reduce((sum, a) =>
    sum + (a.priceType === 'per_seat' ? a.price * contract.seats : a.price), 0
  );
  return baseMRR + addOnMRR;
}

// ─── Formatting helper ────────────────────────────────────────────────────────

function fmt(n: number, currency: Currency = 'GBP'): string {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  return `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Step sub-components ──────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
            i < current  ? 'bg-brand-600 text-white'
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

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function SupportProposalWizard({ onClose, onCreate, currentUserId, currentUserName }: Props) {
  const [step, setStep] = useState(0);

  // Step 1 state
  const [projectName,    setProjectName]    = useState('');
  const [client,         setClient]         = useState('');
  const [crmCompanyId,   setCrmCompanyId]   = useState<string | undefined>(undefined);
  const [accountManager, setAccountManager] = useState('');
  const [currency,       setCurrency]       = useState<Currency>('GBP');
  const [term,           setTerm]           = useState<12 | 24 | 36>(24);
  const [billingCycle,   setBillingCycle]   = useState<SupportContract['billingCycle']>('monthly');

  // Step 2 state
  const [tier,             setTier]            = useState('Gold Managed Service');
  const [tierDescription,  setTierDescription] = useState('');
  const [pricePerSeat,     setPricePerSeat]    = useState<number | ''>('');

  // Step 3 state
  const [seats,      setSeats]     = useState<number | ''>(10);
  const [addOns,     setAddOns]    = useState<SupportAddOn[]>([]);
  const [inclusions, setInclusions] = useState<string[]>(DEFAULT_INCLUSIONS);
  const [exclusions, setExclusions] = useState<string[]>(DEFAULT_EXCLUSIONS);
  const [customIncl, setCustomIncl] = useState('');
  const [customExcl, setCustomExcl] = useState('');

  const users = useStore(s => s.users);

  const seatsNum       = typeof seats === 'number' ? seats : 0;
  const priceNum       = typeof pricePerSeat === 'number' ? pricePerSeat : 0;
  const mrr            = calcMRR({ pricePerSeat: priceNum, seats: seatsNum, addOns });
  const arr            = mrr * 12;
  const tcv            = mrr * term;

  const STEP_TITLES = ['Contract Details', 'Service Tier', 'Users & Add-ons', 'Review & Create'];

  // ── Validation ────────────────────────────────────────────────────────────
  const step1Valid = client.trim().length > 0 && projectName.trim().length > 0;
  const step2Valid = tier.trim().length > 0 && priceNum > 0;
  const step3Valid = seatsNum > 0;
  const canNext    = step === 0 ? step1Valid : step === 1 ? step2Valid : step === 2 ? step3Valid : false;

  // ── Add-on helpers ────────────────────────────────────────────────────────
  const toggleDefaultAddOn = (template: typeof DEFAULT_ADDONS[number]) => {
    const existing = addOns.find(a => a.name === template.name);
    if (existing) {
      setAddOns(addOns.filter(a => a.name !== template.name));
    } else {
      setAddOns([...addOns, { ...template, id: uuid() }]);
    }
  };

  const updateAddOnPrice = (id: string, price: number) => {
    setAddOns(addOns.map(a => a.id === id ? { ...a, price } : a));
  };

  // ── Create proposal ───────────────────────────────────────────────────────
  const handleCreate = () => {
    const contract: SupportContract = {
      tier, tierDescription, pricePerSeat: priceNum,
      seats: seatsNum, term, billingCycle,
      addOns, inclusions, exclusions,
    };
    const proposal: Proposal = {
      id:           uuid(),
      projectName:  projectName || `${tier} — ${client}`,
      client,
      crmCompanyId,
      accountManager,
      currency,
      status:       'Draft',
      dateCreated:  new Date().toISOString().split('T')[0],
      dateModified: new Date().toISOString().split('T')[0],
      markupPct:    0,
      ownerId:      currentUserId,
      lastModifiedBy: currentUserName,
      lastModifiedAt: new Date().toISOString(),
      collaboratorIds: [],
      parts:  [],
      phases: [],
      proposalType: 'support',
      supportContract: contract,
    };
    onCreate(proposal);
  };

  const fmtCurr = (n: number) => fmt(n, currency);

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
          <StepIndicator current={step} total={4} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Step 1: Contract Details ─────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Client <span className="text-red-500">*</span></label>
                <AutotaskCompanyPicker
                  value={client}
                  crmId={crmCompanyId}
                  onChange={(name, id) => {
                    setClient(name);
                    setCrmCompanyId(id);
                    if (!projectName) setProjectName(`${tier} — ${name}`);
                  }}
                  placeholder="Search Autotask or type client name…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Proposal Name</label>
                <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                  placeholder={client ? `${tier} — ${client}` : 'e.g. Gold Managed Service — Acme Corp'}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Account Manager</label>
                  <input list="am-list" type="text" value={accountManager} onChange={e => setAccountManager(e.target.value)}
                    placeholder="Name"
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <datalist id="am-list">
                    {users.map(u => <option key={u.id} value={u.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value as Currency)}
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    {['GBP', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Contract Term</label>
                <div className="grid grid-cols-3 gap-2">
                  {TERM_OPTIONS.map(t => (
                    <button key={t.value} type="button" onClick={() => setTerm(t.value)}
                      className={clsx('relative py-3 px-4 rounded-xl border text-sm font-medium transition-colors text-center',
                        term === t.value
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-brand-400'
                      )}>
                      {t.label}
                      {t.badge && (
                        <span className={clsx('absolute -top-2 right-2 text-xs px-1.5 py-0.5 rounded-full font-semibold',
                          term === t.value ? 'bg-white text-brand-600' : 'bg-brand-100 text-brand-700')}>
                          {t.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

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
            </div>
          )}

          {/* ── Step 2: Service Tier ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Tier Name <span className="text-red-500">*</span></label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {['Bronze', 'Silver', 'Gold', 'Platinum', 'Essential', 'Advanced'].map(t => (
                    <button key={t} type="button" onClick={() => setTier(`${t} Managed Service`)}
                      className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        tier === `${t} Managed Service`
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-brand-400'
                      )}>
                      {t}
                    </button>
                  ))}
                </div>
                <input type="text" value={tier} onChange={e => setTier(e.target.value)}
                  placeholder="e.g. Gold Managed Service"
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Price Per Seat / Month <span className="text-red-500">*</span></label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">
                    {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}
                  </span>
                  <input type="number" min={0} step={0.01} value={pricePerSeat}
                    onChange={e => setPricePerSeat(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <p className="text-xs text-gray-400 mt-1">Per-user monthly charge for the base service tier.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Tier Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea rows={3} value={tierDescription} onChange={e => setTierDescription(e.target.value)}
                  placeholder="Brief description of what this tier covers, e.g. 'Full remote support, proactive monitoring and patch management for all endpoints'"
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>

              {/* Inclusions / Exclusions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-2 uppercase tracking-wide">Inclusions</label>
                  <div className="space-y-1.5">
                    {inclusions.map((inc, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="text-green-500 shrink-0">✓</span>
                        <span className="flex-1 text-gray-700 dark:text-slate-300">{inc}</span>
                        <button onClick={() => setInclusions(inclusions.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                      </div>
                    ))}
                    <div className="flex gap-1">
                      <input value={customIncl} onChange={e => setCustomIncl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && customIncl.trim()) { setInclusions([...inclusions, customIncl.trim()]); setCustomIncl(''); } }}
                        placeholder="Add inclusion…" className="flex-1 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                      <button onClick={() => { if (customIncl.trim()) { setInclusions([...inclusions, customIncl.trim()]); setCustomIncl(''); } }}
                        className="p-1 rounded bg-green-100 text-green-600 hover:bg-green-200 transition-colors"><Plus size={11} /></button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-2 uppercase tracking-wide">Exclusions</label>
                  <div className="space-y-1.5">
                    {exclusions.map((exc, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="text-red-400 shrink-0">✕</span>
                        <span className="flex-1 text-gray-700 dark:text-slate-300">{exc}</span>
                        <button onClick={() => setExclusions(exclusions.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                      </div>
                    ))}
                    <div className="flex gap-1">
                      <input value={customExcl} onChange={e => setCustomExcl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && customExcl.trim()) { setExclusions([...exclusions, customExcl.trim()]); setCustomExcl(''); } }}
                        placeholder="Add exclusion…" className="flex-1 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                      <button onClick={() => { if (customExcl.trim()) { setExclusions([...exclusions, customExcl.trim()]); setCustomExcl(''); } }}
                        className="p-1 rounded bg-red-100 text-red-500 hover:bg-red-200 transition-colors"><Plus size={11} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Users & Add-ons ───────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Number of Users / Seats <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSeats(s => typeof s === 'number' && s > 1 ? s - 1 : s)}
                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-bold">−</button>
                  <input type="number" min={1} value={seats} onChange={e => setSeats(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="w-24 text-center border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <button onClick={() => setSeats(s => typeof s === 'number' ? s + 1 : 1)}
                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-bold">+</button>
                  {seatsNum > 0 && priceNum > 0 && (
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      Base MRR: <strong className="text-gray-900 dark:text-slate-100">{fmtCurr(priceNum * seatsNum)}/mo</strong>
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Add-on Services</label>
                <div className="space-y-2">
                  {DEFAULT_ADDONS.map(template => {
                    const active = addOns.find(a => a.name === template.name);
                    return (
                      <div key={template.name}
                        onClick={() => toggleDefaultAddOn(template)}
                        className={clsx('flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                          active
                            ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700'
                            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-brand-300'
                        )}>
                        <div className={clsx('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                          active ? 'bg-brand-600 border-brand-600' : 'border-gray-300 dark:border-slate-500')}>
                          {active && <Check size={11} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{template.name}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500">
                            {fmtCurr(active?.price ?? template.price)}{template.priceType === 'per_seat' ? '/seat/mo' : '/mo (flat)'}
                            {template.priceType === 'per_seat' && seatsNum > 0 && ` · ${fmtCurr((active?.price ?? template.price) * seatsNum)}/mo total`}
                          </div>
                        </div>
                        {active && (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <span className="text-xs text-gray-400">£</span>
                            <input type="number" min={0} step={0.5} value={active.price}
                              onChange={e => updateAddOnPrice(active.id, parseFloat(e.target.value) || 0)}
                              className="w-16 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Review ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Contract summary card */}
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-slate-100">{projectName || `${tier} — ${client}`}</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <span className="text-gray-500 dark:text-slate-400">Client</span><span className="font-medium">{client}</span>
                  <span className="text-gray-500 dark:text-slate-400">Tier</span><span className="font-medium">{tier}</span>
                  <span className="text-gray-500 dark:text-slate-400">Users</span><span className="font-medium">{seatsNum} seats</span>
                  <span className="text-gray-500 dark:text-slate-400">Term</span><span className="font-medium">{term} months</span>
                  <span className="text-gray-500 dark:text-slate-400">Billing</span><span className="font-medium capitalize">{billingCycle}</span>
                  {accountManager && <><span className="text-gray-500 dark:text-slate-400">Account Manager</span><span className="font-medium">{accountManager}</span></>}
                </div>
              </div>

              {/* Financial summary */}
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 dark:bg-slate-700/50 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                  Financial Summary
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-600 dark:text-slate-400">Base tier ({fmtCurr(priceNum)}/seat)</span>
                    <span className="font-medium">{fmtCurr(priceNum * seatsNum)}/mo</span>
                  </div>
                  {addOns.map(a => (
                    <div key={a.id} className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600 dark:text-slate-400">{a.name}</span>
                      <span className="font-medium">{fmtCurr(a.priceType === 'per_seat' ? a.price * seatsNum : a.price)}/mo</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-4 py-3 font-bold text-sm bg-white dark:bg-slate-800">
                    <span>Monthly Recurring Revenue</span>
                    <span className="text-brand-600 dark:text-brand-400 text-base">{fmtCurr(mrr)}/mo</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm text-gray-600 dark:text-slate-400">
                    <span>Annual Recurring Revenue</span>
                    <span className="font-medium">{fmtCurr(arr)}/yr</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm text-gray-600 dark:text-slate-400">
                    <span>Total Contract Value ({term} months)</span>
                    <span className="font-medium">{fmtCurr(tcv)}</span>
                  </div>
                </div>
              </div>

              {addOns.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">No add-on services selected. You can add them after creation from the Support Contract tab.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <button onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
            <ChevronLeft size={16} />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          <div className="text-xs text-gray-400 dark:text-slate-500">Step {step + 1} of 4</div>

          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleCreate}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors">
              <Check size={16} /> Create Proposal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
