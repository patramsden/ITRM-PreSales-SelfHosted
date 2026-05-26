/**
 * View and edit an MSP support / managed-service contract attached to a proposal.
 * Renders in place of the Parts / Consultancy tabs for proposals where
 * proposalType === 'support'.
 *
 * Shows:
 *   - Contract header (tier, term, billing)
 *   - Per-seat base price + user count
 *   - Add-on services (editable)
 *   - MRR / ARR / TCV summary
 *   - Inclusions / exclusions
 */
import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { Proposal, SupportContract, SupportAddOn, Currency } from '../../../types';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcMRR(c: SupportContract): number {
  const base = c.pricePerSeat * c.seats;
  const addOns = c.addOns.reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * c.seats : a.price), 0);
  return base + addOns;
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

  const [newAddonName,  setNewAddonName]  = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState<number | ''>('');
  const [newAddonType,  setNewAddonType]  = useState<SupportAddOn['priceType']>('per_seat');
  const [newInclusion,  setNewInclusion]  = useState('');
  const [newExclusion,  setNewExclusion]  = useState('');

  if (!c) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-slate-500">
        No support contract data found on this proposal.
      </div>
    );
  }

  const mrr = calcMRR(c);
  const arr = mrr * 12;
  const tcv = mrr * c.term;

  const update = (patch: Partial<SupportContract>) => {
    onUpdate({ supportContract: { ...c, ...patch } });
  };

  const addAddOn = () => {
    if (!newAddonName.trim() || !newAddonPrice) return;
    update({ addOns: [...c.addOns, { id: uuid(), name: newAddonName.trim(), priceType: newAddonType, price: Number(newAddonPrice) }] });
    setNewAddonName(''); setNewAddonPrice('');
  };

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Contract header ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Service Tier</div>
            {editable ? (
              <input value={c.tier} onChange={e => update({ tier: e.target.value })}
                className="text-lg font-bold text-gray-900 dark:text-slate-100 bg-transparent border-b border-dashed border-gray-300 dark:border-slate-600 focus:outline-none focus:border-brand-500 w-full" />
            ) : (
              <div className="text-lg font-bold text-gray-900 dark:text-slate-100">{c.tier}</div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <span className="px-2.5 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-semibold rounded-full">
              {c.term} months
            </span>
            <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-full capitalize">
              {c.billingCycle}
            </span>
          </div>
        </div>

        {c.tierDescription && (
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{c.tierDescription}</p>
        )}

        {/* Per-seat + users */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">Per-seat price</div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm font-medium">{currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}</span>
              {editable ? (
                <input type="number" min={0} step={0.01} value={c.pricePerSeat}
                  onChange={e => update({ pricePerSeat: parseFloat(e.target.value) || 0 })}
                  className="w-24 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
              ) : (
                <span className="font-semibold text-gray-900 dark:text-slate-100">{fmt(c.pricePerSeat)}/mo</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">Users / seats</div>
            <div className="flex items-center gap-2">
              {editable ? (
                <>
                  <button onClick={() => update({ seats: Math.max(1, c.seats - 1) })}
                    className="w-6 h-6 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-bold text-sm">−</button>
                  <input type="number" min={1} value={c.seats}
                    onChange={e => update({ seats: parseInt(e.target.value) || 1 })}
                    className="w-16 text-center border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <button onClick={() => update({ seats: c.seats + 1 })}
                    className="w-6 h-6 rounded border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-bold text-sm">+</button>
                </>
              ) : (
                <span className="font-semibold text-gray-900 dark:text-slate-100">{c.seats}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Add-ons ─────────────────────────────────────────────────────── */}
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
                    {fmt(a.price)}{a.priceType === 'per_seat' ? `/seat/mo · ${fmt(a.price * c.seats)}/mo total` : '/mo flat'}
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
          <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
            <div className="flex gap-2">
              <input value={newAddonName} onChange={e => setNewAddonName(e.target.value)}
                placeholder="Add-on name…"
                className="flex-1 text-sm border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <select value={newAddonType} onChange={e => setNewAddonType(e.target.value as SupportAddOn['priceType'])}
                className="text-sm border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="per_seat">Per seat</option>
                <option value="flat">Flat fee</option>
              </select>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 text-xs">{currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}</span>
                <input type="number" min={0} step={0.5} value={newAddonPrice} onChange={e => setNewAddonPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="w-20 text-sm border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button onClick={addAddOn} disabled={!newAddonName.trim() || !newAddonPrice}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors disabled:opacity-40">
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MRR / ARR / TCV ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Monthly Recurring', value: fmt(mrr), sub: 'MRR' },
          { label: 'Annual Recurring',  value: fmt(arr), sub: 'ARR' },
          { label: `${c.term}-Month Contract`, value: fmt(tcv), sub: 'TCV' },
        ].map(({ label, value, sub }) => (
          <div key={sub} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
            <div className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">{label}</div>
            <div className="text-xl font-bold text-brand-600 dark:text-brand-400">{value}</div>
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Inclusions / Exclusions ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Inclusions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Included</div>
          <div className="space-y-1.5">
            {c.inclusions.map((inc, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Check size={13} className="text-green-500 shrink-0" />
                <span className="flex-1 text-gray-700 dark:text-slate-300">{inc}</span>
                {editable && (
                  <button onClick={() => update({ inclusions: c.inclusions.filter((_, j) => j !== i) })}
                    className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                )}
              </div>
            ))}
            {editable && (
              <div className="flex gap-1 mt-2">
                <input value={newInclusion} onChange={e => setNewInclusion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newInclusion.trim()) { update({ inclusions: [...c.inclusions, newInclusion.trim()] }); setNewInclusion(''); } }}
                  placeholder="Add inclusion…" className="flex-1 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <button onClick={() => { if (newInclusion.trim()) { update({ inclusions: [...c.inclusions, newInclusion.trim()] }); setNewInclusion(''); } }}
                  className="p-1 rounded bg-green-100 text-green-600 hover:bg-green-200 transition-colors"><Plus size={11} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Exclusions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Excluded</div>
          <div className="space-y-1.5">
            {c.exclusions.map((exc, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-red-400 text-xs shrink-0 font-bold">✕</span>
                <span className="flex-1 text-gray-700 dark:text-slate-300">{exc}</span>
                {editable && (
                  <button onClick={() => update({ exclusions: c.exclusions.filter((_, j) => j !== i) })}
                    className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                )}
              </div>
            ))}
            {editable && (
              <div className="flex gap-1 mt-2">
                <input value={newExclusion} onChange={e => setNewExclusion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newExclusion.trim()) { update({ exclusions: [...c.exclusions, newExclusion.trim()] }); setNewExclusion(''); } }}
                  placeholder="Add exclusion…" className="flex-1 text-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <button onClick={() => { if (newExclusion.trim()) { update({ exclusions: [...c.exclusions, newExclusion.trim()] }); setNewExclusion(''); } }}
                  className="p-1 rounded bg-red-100 text-red-500 hover:bg-red-200 transition-colors"><Plus size={11} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
