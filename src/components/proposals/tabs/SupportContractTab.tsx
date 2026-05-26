/**
 * View and edit a support / managed-service contract attached to a proposal.
 * Rendered in place of the project tabs for proposals where proposalType === 'support'.
 */
import { useState } from 'react';
import { Plus, Trash2, Clock } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { Proposal, SupportContract, SupportAddOn, SupportHours, Currency } from '../../../types';
import { useStore } from '../../../store';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORT_HOURS_OPTIONS: Array<{ id: SupportHours; label: string; sublabel: string; price: number }> = [
  { id: 'standard', label: 'Mon–Fri  9am–5pm', sublabel: 'Standard (8hr)',  price: 40 },
  { id: 'extended', label: 'Mon–Fri  8am–6pm', sublabel: 'Extended (10hr)', price: 50 },
  { id: 'premium',  label: 'Mon–Fri  7am–7pm', sublabel: 'Premium (12hr)',  price: 60 },
];

const TERM_OPTIONS = [
  { value: 12 as const, label: '1 Year',  maxDiscount: 0  },
  { value: 36 as const, label: '3 Years', maxDiscount: 5  },
  { value: 60 as const, label: '5 Years', maxDiscount: 10 },
];

const BILLING_OPTIONS: Array<{ value: SupportContract['billingCycle']; label: string }> = [
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually',  label: 'Annually'  },
];

// ─── Financial helpers ────────────────────────────────────────────────────────

function discountedBase(pricePerSeat: number, discountPct = 0) {
  return pricePerSeat * (1 - discountPct / 100);
}

function calcMRR(c: SupportContract): number {
  const base = discountedBase(c.pricePerSeat, c.termDiscountPct ?? 0);
  const full  = base * c.seats;
  const part  = base * 0.5 * (c.partTimeSeats ?? 0);
  const addons = c.addOns.reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * c.seats : a.price), 0);
  return full + part + addons;
}

function calcOnboarding(c: SupportContract): number {
  return c.pricePerSeat * c.seats + c.pricePerSeat * 0.5 * (c.partTimeSeats ?? 0);
}

function fmtCurr(n: number, currency: Currency = 'GBP'): string {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  return `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SupportContractTab({ proposal, editable, onUpdate }: Props) {
  const c = proposal.supportContract;
  const currency = proposal.currency ?? 'GBP';
  const fmt = (n: number) => fmtCurr(n, currency);
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';

  const catalog  = useStore(s => s.catalog);
  const [newInclusion, setNewInclusion] = useState('');
  const [newExclusion, setNewExclusion] = useState('');

  if (!c) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-slate-500">
        No support contract data found on this proposal.
      </div>
    );
  }

  const mrr         = calcMRR(c);
  const arr         = mrr * 12;
  const tcv         = mrr * c.term;
  const onboarding  = c.onboardingCost ?? calcOnboarding(c);
  const termMeta    = TERM_OPTIONS.find(t => t.value === c.term) ?? TERM_OPTIONS[0];
  const hoursMeta   = SUPPORT_HOURS_OPTIONS.find(h => h.id === (c.supportHours ?? 'standard')) ?? SUPPORT_HOURS_OPTIONS[0];

  const update = (patch: Partial<SupportContract>) =>
    onUpdate({ supportContract: { ...c, ...patch } });

  const supportCatalogItems = catalog.filter(ci => ci.isSupportAddon);

  // ── Add-on from catalog ────────────────────────────────────────────────
  const addFromCatalog = (catalogId: string) => {
    const ci = catalog.find(c => c.id === catalogId);
    if (!ci) return;
    if (c.addOns.some(a => a.name === ci.description)) return; // already added
    update({ addOns: [...c.addOns, {
      id: uuid(),
      name: ci.description,
      priceType: ci.supportAddonPriceType ?? 'per_seat',
      price: ci.listPrice,
    }] });
  };

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Support Hours ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-brand-600" />
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Support Coverage</span>
        </div>

        {editable ? (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {SUPPORT_HOURS_OPTIONS.map(h => (
              <button key={h.id} type="button"
                onClick={() => update({ supportHours: h.id, pricePerSeat: h.price })}
                className={clsx('flex flex-col items-center py-2.5 px-2 rounded-xl border-2 text-center transition-colors',
                  (c.supportHours ?? 'standard') === h.id
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-gray-200 dark:border-slate-600 hover:border-brand-300'
                )}>
                <span className="text-xs font-semibold text-gray-800 dark:text-slate-200">{h.label}</span>
                <span className="text-[10px] text-gray-400 mt-0.5">{h.sublabel}</span>
                <span className="mt-1 text-sm font-bold text-brand-600">{sym}{h.price}/seat</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-3">
            <span className="px-3 py-1.5 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-sm font-semibold rounded-lg">
              {hoursMeta.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-slate-400">{hoursMeta.sublabel}</span>
          </div>
        )}

        {/* Per-seat price (override) */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500 dark:text-slate-400 w-28">Per-seat price</span>
          {editable ? (
            <div className="flex items-center gap-1">
              <span className="text-gray-400 text-sm">{sym}</span>
              <input type="number" min={0} step={1} value={c.pricePerSeat}
                onChange={e => update({ pricePerSeat: parseFloat(e.target.value) || 0 })}
                className="w-20 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <span className="text-xs text-gray-400">/mo</span>
            </div>
          ) : (
            <span className="font-semibold text-gray-900 dark:text-slate-100">{fmt(c.pricePerSeat)}/mo</span>
          )}
        </div>
      </div>

      {/* ── Term & discount ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-3">Contract Term</div>

        {editable ? (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {TERM_OPTIONS.map(t => (
              <button key={t.value} type="button"
                onClick={() => update({ term: t.value, termDiscountPct: 0 })}
                className={clsx('py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors text-center',
                  c.term === t.value
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-brand-400'
                )}>
                <div>{t.label}</div>
                {t.maxDiscount > 0 && (
                  <div className={clsx('text-[10px] mt-0.5', c.term === t.value ? 'text-brand-200' : 'text-gray-400')}>
                    Up to {t.maxDiscount}% off
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-sm font-semibold rounded-lg">
              {termMeta.label}
            </span>
            <span className="px-2.5 py-1.5 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-lg capitalize">
              {c.billingCycle}
            </span>
          </div>
        )}

        {/* Term discount slider — only for 3yr or 5yr */}
        {editable && termMeta.maxDiscount > 0 && (
          <div className="bg-gray-50 dark:bg-slate-700/40 rounded-lg p-3 mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600 dark:text-slate-300">Term discount on base price</span>
              <span className="text-sm font-bold text-brand-600">{c.termDiscountPct ?? 0}%</span>
            </div>
            <input type="range" min={0} max={termMeta.maxDiscount} step={0.5}
              value={c.termDiscountPct ?? 0}
              onChange={e => update({ termDiscountPct: Number(e.target.value) })}
              className="w-full accent-brand-600" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>0%</span><span>Max {termMeta.maxDiscount}%</span>
            </div>
            {(c.termDiscountPct ?? 0) > 0 && (
              <div className="mt-1.5 text-xs text-gray-600 dark:text-slate-300">
                Effective price: <strong className="text-brand-600">
                  {fmt(discountedBase(c.pricePerSeat, c.termDiscountPct ?? 0))}/seat/mo
                </strong>
              </div>
            )}
          </div>
        )}

        {/* Billing cycle */}
        {editable && (
          <div className="flex gap-2 mt-3">
            {BILLING_OPTIONS.map(b => (
              <button key={b.value} type="button" onClick={() => update({ billingCycle: b.value })}
                className={clsx('flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  c.billingCycle === b.value
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-brand-400'
                )}>
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Users ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4">Users</div>

        <div className="grid grid-cols-2 gap-4">
          {/* Full-time */}
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">Full-time users</div>
            <div className="text-xs text-gray-400 mb-2">
              {fmt(discountedBase(c.pricePerSeat, c.termDiscountPct ?? 0))}/seat/mo
            </div>
            <div className="flex items-center gap-2">
              {editable ? (
                <>
                  <button onClick={() => update({ seats: Math.max(1, c.seats - 1) })} className="w-6 h-6 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold text-sm">−</button>
                  <input type="number" min={1} value={c.seats} onChange={e => update({ seats: parseInt(e.target.value) || 1 })}
                    className="w-16 text-center border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <button onClick={() => update({ seats: c.seats + 1 })} className="w-6 h-6 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold text-sm">+</button>
                </>
              ) : (
                <span className="font-semibold text-gray-900 dark:text-slate-100">{c.seats}</span>
              )}
            </div>
          </div>

          {/* Part-time */}
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">Part-time users <span className="text-gray-300">(50% price)</span></div>
            <div className="text-xs text-gray-400 mb-2">
              {fmt(discountedBase(c.pricePerSeat, c.termDiscountPct ?? 0) * 0.5)}/seat/mo
            </div>
            <div className="flex items-center gap-2">
              {editable ? (
                <>
                  <button onClick={() => update({ partTimeSeats: Math.max(0, (c.partTimeSeats ?? 0) - 1) })} className="w-6 h-6 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold text-sm">−</button>
                  <input type="number" min={0} value={c.partTimeSeats ?? 0} onChange={e => update({ partTimeSeats: parseInt(e.target.value) || 0 })}
                    className="w-16 text-center border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <button onClick={() => update({ partTimeSeats: (c.partTimeSeats ?? 0) + 1 })} className="w-6 h-6 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 font-bold text-sm">+</button>
                </>
              ) : (
                <span className="font-semibold text-gray-900 dark:text-slate-100">{c.partTimeSeats ?? 0}</span>
              )}
            </div>
          </div>
        </div>

        {/* Onboarding line */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between text-sm">
          <div>
            <span className="font-medium text-gray-700 dark:text-slate-300">Onboarding</span>
            <span className="ml-1.5 text-xs text-gray-400">(1 month base cost, one-time)</span>
          </div>
          {editable ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">{sym}</span>
              <input type="number" min={0} step={1}
                value={onboarding}
                onChange={e => update({ onboardingCost: parseFloat(e.target.value) || 0 })}
                className="w-24 border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          ) : (
            <span className="font-semibold text-brand-600 dark:text-brand-400">{fmt(onboarding)}</span>
          )}
        </div>
      </div>

      {/* ── Add-ons ─────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Add-on Services</span>
          <span className="text-xs text-gray-400 dark:text-slate-500">{c.addOns.length} active</span>
        </div>

        {c.addOns.length > 0 && (
          <div className="divide-y divide-gray-50 dark:divide-slate-700">
            {c.addOns.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{a.name}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">
                    {fmt(a.price)}{a.priceType === 'per_seat'
                      ? `/seat/mo · ${fmt(a.price * c.seats)}/mo total`
                      : '/mo flat'}
                  </div>
                </div>
                {editable && (
                  <div className="flex items-center gap-2 shrink-0">
                    <input type="number" min={0} step={0.5} value={a.price}
                      onChange={e => update({ addOns: c.addOns.map(x => x.id === a.id ? { ...x, price: parseFloat(e.target.value) || 0 } : x) })}
                      className="w-20 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    <button onClick={() => update({ addOns: c.addOns.filter(x => x.id !== a.id) })}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {editable && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700">
            {supportCatalogItems.length > 0 ? (
              <div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Add from catalog:</div>
                <div className="flex flex-wrap gap-1.5">
                  {supportCatalogItems
                    .filter(ci => !c.addOns.some(a => a.name === ci.description))
                    .map(ci => (
                      <button
                        key={ci.id}
                        onClick={() => addFromCatalog(ci.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-dashed border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                      >
                        <Plus size={10} /> {ci.description} · {sym}{ci.listPrice}{ci.supportAddonPriceType === 'flat' ? '/mo' : '/seat'}
                      </button>
                    ))
                  }
                  {supportCatalogItems.every(ci => c.addOns.some(a => a.name === ci.description)) && (
                    <span className="text-xs text-gray-400 italic">All catalog add-ons added.</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                Tag items in the Catalog as "Support Add-on" to add them here.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── MRR / ARR / TCV cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Monthly Recurring', fmt(mrr)],
          ['Annual Recurring',  fmt(arr)],
          [`${termMeta.label} Contract Value`, fmt(tcv)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-400 dark:text-slate-500 mb-1">{label}</div>
            <div className="text-lg font-bold text-brand-600 dark:text-brand-400">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Inclusions / exclusions ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: '✓ Inclusions', list: c.inclusions, addState: newInclusion, setAdd: setNewInclusion, field: 'inclusions' as const },
          { title: '✗ Exclusions', list: c.exclusions, addState: newExclusion, setAdd: setNewExclusion, field: 'exclusions' as const },
        ].map(({ title, list, addState, setAdd, field }) => (
          <div key={field} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">{title}</div>
            <ul className="space-y-1.5 mb-3">
              {list.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300">
                  <span className="flex-1">{item}</span>
                  {editable && (
                    <button onClick={() => update({ [field]: list.filter((_, j) => j !== i) })}
                      className="p-0.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 size={11} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <div className="flex gap-1.5">
                <input value={addState} onChange={e => setAdd(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && addState.trim()) {
                      update({ [field]: [...list, addState.trim()] });
                      setAdd('');
                    }
                  }}
                  placeholder="Add item…"
                  className="flex-1 text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <button onClick={() => {
                  if (!addState.trim()) return;
                  update({ [field]: [...list, addState.trim()] });
                  setAdd('');
                }} className="p-1 rounded border border-gray-300 dark:border-slate-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <Plus size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
