import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Clock, Download } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { useAuth, isPresalesAdmin } from '../contexts/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { RateCardImportDialog } from '../components/rateCards/RateCardImportDialog';
import { downloadCsv } from '../utils/downloadCsv';
import type { RateCard, Currency } from '../types';
import { HOURS_PER_DAY, hourlyRate } from '../utils/rates';
import clsx from 'clsx';

const BLANK: Omit<RateCard, 'id'> = {
  role: '', costRate: 0, sellRate: 0, currency: 'GBP',
  effectiveFrom: new Date().toISOString().split('T')[0],
  overtimeEnabled: false,
};

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`;

// ─── CardForm — must be at module scope to avoid remount on every keystroke ──

function CardForm({ card, onChange }: { card: Omit<RateCard, 'id'>; onChange: (v: Omit<RateCard, 'id'>) => void }) {
    const hrSell = hourlyRate(card.sellRate);
    const hrCost = hourlyRate(card.costRate);
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Role *</label>
          <input
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={card.role}
            onChange={e => onChange({ ...card, role: e.target.value })}
            placeholder="e.g. Network Architect"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Cost Rate (per day)</label>
            <input type="number" min={0} step={50}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={card.costRate}
              onChange={e => onChange({ ...card, costRate: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sell Rate (per day)</label>
            <input type="number" min={0} step={50}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={card.sellRate}
              onChange={e => onChange({ ...card, sellRate: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Currency</label>
            <select
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={card.currency}
              onChange={e => onChange({ ...card, currency: e.target.value as Currency })}>
              <option value="GBP">GBP £</option>
              <option value="USD">USD $</option>
              <option value="EUR">EUR €</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Effective From</label>
            <input type="date"
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={card.effectiveFrom}
              onChange={e => onChange({ ...card, effectiveFrom: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Effective To</label>
            <input type="date"
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={card.effectiveTo ?? ''}
              onChange={e => onChange({ ...card, effectiveTo: e.target.value || undefined })} />
          </div>
        </div>

        {/* Derived hourly rates — read-only reference */}
        {(card.sellRate > 0 || card.costRate > 0) && (
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-2 text-xs text-gray-600 dark:text-slate-300">
            <div className="font-semibold text-gray-700 dark:text-slate-200 flex items-center gap-1.5">
              <Clock size={12} /> Derived rates <span className="font-normal text-gray-400">(1 day = {HOURS_PER_DAY} hrs, rounded up to nearest £5)</span>
            </div>

            {/* Standard rates */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-white dark:bg-slate-700 rounded px-2 py-1.5 border border-gray-200 dark:border-slate-600">
                <div className="text-gray-400 dark:text-slate-500 mb-0.5">Cost / hr</div>
                <div className="font-semibold text-gray-800 dark:text-slate-200">{fmt(hrCost)}</div>
              </div>
              <div className="bg-white dark:bg-slate-700 rounded px-2 py-1.5 border border-gray-200 dark:border-slate-600">
                <div className="text-gray-400 dark:text-slate-500 mb-0.5">Sell / hr</div>
                <div className="font-semibold text-gray-800 dark:text-slate-200">{fmt(hrSell)}</div>
              </div>
            </div>

            {/* Overtime rates */}
            {card.overtimeEnabled && (
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-800">
                  <div className="text-amber-600 dark:text-amber-400 mb-0.5">Cost 1.5×</div>
                  <div className="font-semibold text-amber-800 dark:text-amber-300">{fmt(hrCost * 1.5)}</div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded px-2 py-1.5 border border-orange-200 dark:border-orange-800">
                  <div className="text-orange-600 dark:text-orange-400 mb-0.5">Cost 2×</div>
                  <div className="font-semibold text-orange-800 dark:text-orange-300">{fmt(hrCost * 2)}</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-800">
                  <div className="text-amber-600 dark:text-amber-400 mb-0.5">Sell 1.5×</div>
                  <div className="font-semibold text-amber-800 dark:text-amber-300">{fmt(hrSell * 1.5)}</div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded px-2 py-1.5 border border-orange-200 dark:border-orange-800">
                  <div className="text-orange-600 dark:text-orange-400 mb-0.5">Sell 2×</div>
                  <div className="font-semibold text-orange-800 dark:text-orange-300">{fmt(hrSell * 2)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overtime toggle */}
        <div className={clsx(
          'flex items-center justify-between p-4 rounded-xl border-2 transition-colors',
          card.overtimeEnabled ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/40'
        )}>
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Overtime Rates</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Enables 1.5× and 2× multipliers when scheduling consultancy tasks
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...card, overtimeEnabled: !card.overtimeEnabled })}
            className={clsx(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2',
              card.overtimeEnabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-slate-600'
            )}
          >
            <span className={clsx(
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              card.overtimeEnabled ? 'translate-x-5' : 'translate-x-0'
            )} />
          </button>
        </div>
      </div>
    );
}

// ─── RateCards page ───────────────────────────────────────────────────────────

export function RateCards() {
  useDocumentTitle('Rate Cards');
  const { rateCards, addRateCard, updateRateCard, deleteRateCard } = useStore();
  const { currentUser } = useAuth();
  const isAdmin = isPresalesAdmin(currentUser);

  const [editing, setEditing] = useState<RateCard | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newCard, setNewCard] = useState<Omit<RateCard, 'id'>>(BLANK);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    addRateCard({ ...newCard, id: uuid() });
    setShowNew(false); setNewCard(BLANK);
  };

  const handleSave = () => {
    if (!editing) return;
    updateRateCard(editing.id, editing);
    setEditing(null);
  };

  const marginPct = (c: RateCard) =>
    c.sellRate > 0 ? (((c.sellRate - c.costRate) / c.sellRate) * 100).toFixed(0) + '%' : '—';

  const hasAnyOvertime = rateCards.some(r => r.overtimeEnabled);

  return (
    <div className="p-8">
      <PageHeader
        title="Rate Cards"
        subtitle={`Consultancy roles and day rates · 1 working day = ${HOURS_PER_DAY} hours`}
        actions={isAdmin && (
          <div className="flex items-center gap-2">
            <RateCardImportDialog onComplete={() => {}} />
            <Button variant="secondary" onClick={() => downloadCsv('rate-cards.csv', [
              ['Role', 'Cost Rate (Day)', 'Sell Rate (Day)', 'Currency', 'Effective From', 'Effective To', 'Overtime Enabled'],
              ...rateCards.map(r => [r.role, r.costRate, r.sellRate, r.currency, r.effectiveFrom, r.effectiveTo ?? '', r.overtimeEnabled ? 'true' : 'false']),
            ])}>
              <Download size={15} /> Export CSV
            </Button>
            <Button onClick={() => setShowNew(true)}><Plus size={16} /> Add Role</Button>
          </div>
        )}
      />

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Role</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Cost / Day</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Sell / Day</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Cost / Hr</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Sell / Hr</th>
              {hasAnyOvertime && <>
                <th className="text-right px-4 py-3 text-xs font-semibold text-amber-500 uppercase tracking-wide">1.5× / Hr</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-orange-500 uppercase tracking-wide">2× / Hr</th>
              </>}
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Margin</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Currency</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Effective</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
            {rateCards.length === 0 && (
              <tr><td colSpan={10} className="text-center py-10 text-gray-400 dark:text-slate-500">No rate cards defined.</td></tr>
            )}
            {rateCards.map(r => {
              const hrSell = hourlyRate(r.sellRate);
              const hrCost = hourlyRate(r.costRate);
              return (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-5 py-3 font-medium text-gray-900 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      {r.role}
                      {r.overtimeEnabled && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          OT
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{fmt(r.costRate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-slate-100">{fmt(r.sellRate)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400 text-xs">{fmt(hrCost)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400 text-xs">{fmt(hrSell)}</td>
                  {hasAnyOvertime && <>
                    <td className="px-4 py-3 text-right text-xs">
                      {r.overtimeEnabled
                        ? <span className="text-amber-700 dark:text-amber-400 font-medium">{fmt(hrSell * 1.5)}</span>
                        : <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {r.overtimeEnabled
                        ? <span className="text-orange-700 dark:text-orange-400 font-medium">{fmt(hrSell * 2)}</span>
                        : <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>
                  </>}
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300 font-medium">{marginPct(r)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{r.currency}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-500 text-xs">{r.effectiveFrom}{r.effectiveTo ? ` → ${r.effectiveTo}` : ' → present'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing({ ...r })} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteId(r.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showNew} onClose={() => { setShowNew(false); setNewCard(BLANK); }} title="Add Rate Card">
        <CardForm card={newCard} onChange={setNewCard} />
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => { setShowNew(false); setNewCard(BLANK); }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!newCard.role.trim()}><Save size={14} /> Add</Button>
        </div>
      </Modal>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit Rate Card">
          <CardForm card={editing} onChange={v => setEditing({ ...editing, ...v })} />
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={() => setEditing(null)}><X size={14} /> Cancel</Button>
            <Button onClick={handleSave}><Save size={14} /> Save</Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteId} title="Delete Rate Card?"
        message="This rate card will be removed. Existing consultancy tasks using this role are not affected."
        confirmLabel="Delete" danger
        onConfirm={() => { if (deleteId) deleteRateCard(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
