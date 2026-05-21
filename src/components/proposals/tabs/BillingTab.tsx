import { useState } from 'react';
import { Plus, Trash2, ChevronDown, CheckCircle, Clock, FileText, AlertTriangle } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { Proposal, BillingMilestone, MilestoneStatus } from '../../../types';
import { calcTotals } from '../../../utils/totals';
import { Button } from '../../ui/Button';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MilestoneStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending:  { label: 'Pending',  cls: 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300',          icon: Clock        },
  invoiced: { label: 'Invoiced', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',     icon: FileText     },
  paid:     { label: 'Paid',     cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',     icon: CheckCircle  },
};

const STATUSES: MilestoneStatus[] = ['pending', 'invoiced', 'paid'];

// ─── Currency formatter ───────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

// ─── Quick templates ──────────────────────────────────────────────────────────

const QUICK_TEMPLATES: { label: string; milestones: { name: string; percentage: number }[] }[] = [
  {
    label: '50 / 50',
    milestones: [
      { name: 'Project Start',      percentage: 50 },
      { name: 'Project Completion', percentage: 50 },
    ],
  },
  {
    label: '30 / 40 / 30',
    milestones: [
      { name: 'Contract Signing',   percentage: 30 },
      { name: 'Mid-Project Review', percentage: 40 },
      { name: 'Project Completion', percentage: 30 },
    ],
  },
  {
    label: '25 / 25 / 25 / 25',
    milestones: [
      { name: 'Contract Signing',     percentage: 25 },
      { name: 'Design Sign-off',      percentage: 25 },
      { name: 'Implementation',       percentage: 25 },
      { name: 'Go-Live & Handover',   percentage: 25 },
    ],
  },
];

// ─── BillingTab ───────────────────────────────────────────────────────────────

export function BillingTab({ proposal, editable, onUpdate }: Props) {
  const milestones = proposal.milestones ?? [];
  const totals     = calcTotals(proposal);
  const grandTotal = totals.grandTotal;
  const sym        = CURRENCY_SYMBOLS[proposal.currency] ?? '£';
  const fmt        = (n: number) => `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [showTemplates, setShowTemplates] = useState(false);

  const totalPct  = milestones.reduce((s, m) => s + m.percentage, 0);
  const remaining = 100 - totalPct;

  const set = (updated: BillingMilestone[]) => onUpdate({ milestones: updated });

  const addMilestone = () => {
    set([...milestones, {
      id: uuid(), name: 'New Milestone',
      percentage: Math.max(0, remaining), dueDate: undefined,
      phaseId: undefined, notes: undefined, status: 'pending',
    }]);
  };

  const update = (id: string, patch: Partial<BillingMilestone>) =>
    set(milestones.map(m => m.id === id ? { ...m, ...patch } : m));

  const remove = (id: string) => set(milestones.filter(m => m.id !== id));

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[number]) => {
    set(tpl.milestones.map(m => ({ id: uuid(), ...m, status: 'pending' as MilestoneStatus })));
    setShowTemplates(false);
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">

      {/* Header + actions */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Billing Milestones</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Define when the client will be invoiced throughout the project.
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Quick templates */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTemplates(s => !s)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Templates <ChevronDown size={13} />
              </button>
              {showTemplates && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden py-1">
                  {QUICK_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="font-medium">{tpl.label}</div>
                      <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                        {tpl.milestones.map(m => m.name).join(' → ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={addMilestone}><Plus size={14} /> Add Milestone</Button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {milestones.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500 dark:text-slate-400">
            <span>{totalPct.toFixed(0)}% of total assigned</span>
            <span className={clsx('font-medium', Math.abs(remaining) < 0.5 ? 'text-green-600 dark:text-green-400' : remaining < 0 ? 'text-red-500' : 'text-amber-500')}>
              {Math.abs(remaining) < 0.5 ? '✓ 100% covered' : remaining > 0 ? `${remaining.toFixed(0)}% remaining` : `${Math.abs(remaining).toFixed(0)}% over 100%`}
            </span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', totalPct > 100 ? 'bg-red-500' : totalPct === 100 ? 'bg-green-500' : 'bg-brand-500')}
              style={{ width: `${Math.min(totalPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Milestone cards */}
      {milestones.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
          <FileText size={28} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">No billing milestones defined</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Add milestones to define when the client will be invoiced</p>
          {editable && (
            <div className="mt-4 flex items-center justify-center gap-3">
              {QUICK_TEMPLATES.map(tpl => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((m, idx) => {
            const amount      = grandTotal * m.percentage / 100;
            const statusCfg   = STATUS_CONFIG[m.status];
            const StatusIcon  = statusCfg.icon;
            const linkedPhase = proposal.phases.find(p => p.id === m.phaseId);

            return (
              <div key={m.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <div className="flex items-start gap-3">
                  {/* Milestone number */}
                  <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300 flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Name + status + delete */}
                    <div className="flex items-center gap-2">
                      {editable ? (
                        <input
                          className="flex-1 text-sm font-semibold text-gray-900 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 focus:outline-none py-0.5"
                          value={m.name}
                          onChange={e => update(m.id, { name: e.target.value })}
                          placeholder="Milestone name"
                        />
                      ) : (
                        <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{m.name}</span>
                      )}

                      {/* Status badge */}
                      {editable ? (
                        <select
                          value={m.status}
                          onChange={e => update(m.id, { status: e.target.value as MilestoneStatus })}
                          className={clsx('text-xs font-medium px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer', statusCfg.cls)}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={clsx('inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full', statusCfg.cls)}>
                          <StatusIcon size={11} />{statusCfg.label}
                        </span>
                      )}

                      {editable && (
                        <button onClick={() => remove(m.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Percentage + amount + date + phase */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className="block text-xs text-gray-400 dark:text-slate-500 mb-1">% of Total</label>
                        {editable ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min={0} max={100} step={5}
                              className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                              value={m.percentage}
                              onChange={e => update(m.id, { percentage: parseFloat(e.target.value) || 0 })}
                            />
                            <span className="text-sm text-gray-400">%</span>
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{m.percentage}%</span>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Amount</label>
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{fmt(amount)}</span>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Due Date</label>
                        {editable ? (
                          <input
                            type="date"
                            className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={m.dueDate ?? ''}
                            onChange={e => update(m.id, { dueDate: e.target.value || undefined })}
                          />
                        ) : (
                          <span className="text-sm text-gray-600 dark:text-slate-300">
                            {m.dueDate ? new Date(m.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Linked Phase</label>
                        {editable && proposal.phases.length > 0 ? (
                          <select
                            className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={m.phaseId ?? ''}
                            onChange={e => update(m.id, { phaseId: e.target.value || undefined })}
                          >
                            <option value="">— None —</option>
                            {proposal.phases.map(ph => (
                              <option key={ph.id} value={ph.id}>{ph.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm text-gray-600 dark:text-slate-300 truncate block">
                            {linkedPhase?.name ?? '—'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {(editable || m.notes) && (
                      <div>
                        {editable ? (
                          <input
                            className="w-full text-xs text-gray-500 dark:text-slate-400 bg-transparent border-b border-transparent hover:border-gray-200 dark:hover:border-slate-600 focus:border-brand-400 focus:outline-none py-0.5 placeholder-gray-300 dark:placeholder-slate-600"
                            value={m.notes ?? ''}
                            onChange={e => update(m.id, { notes: e.target.value || undefined })}
                            placeholder="Add a note about this milestone…"
                          />
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-slate-400 italic">{m.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary footer */}
      {milestones.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-700/40 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Billing Summary</span>
            {Math.abs(remaining) > 0.5 && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle size={12} />
                {remaining > 0 ? `${remaining.toFixed(0)}% unassigned` : `${Math.abs(remaining).toFixed(0)}% over-allocated`}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {milestones.map((m, idx) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                  {m.name}
                  {m.dueDate && <span className="text-xs text-gray-400 dark:text-slate-500">· {new Date(m.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{m.percentage}%</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{fmt(grandTotal * m.percentage / 100)}</span>
                </div>
              </div>
            ))}
            <div className="border-t border-gray-200 dark:border-slate-600 pt-2 mt-2 flex items-center justify-between text-sm font-semibold">
              <span className="text-gray-700 dark:text-slate-200">Total</span>
              <span className="text-gray-900 dark:text-slate-100 tabular-nums">{fmt(grandTotal * totalPct / 100)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
