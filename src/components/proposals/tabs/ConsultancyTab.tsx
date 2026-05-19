import { useState } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { Proposal, ConsultancyPhase, ConsultancyTask } from '../../../types';
import { useStore } from '../../../store';
import { Button } from '../../ui/Button';
import { PM_RATE } from '../../../utils/totals';
import { HOURS_PER_DAY } from '../../../pages/RateCards';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

const MULTIPLIER_LABELS: Record<1 | 1.5 | 2, string> = {
  1:   'Std',
  1.5: '1.5×',
  2:   '2×',
};

const MULTIPLIER_COLORS: Record<1 | 1.5 | 2, string> = {
  1:   'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300',
  1.5: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  2:   'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
};

export function ConsultancyTab({ proposal, editable, onUpdate }: Props) {
  const { rateCards } = useStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const setPhases = (phases: ConsultancyPhase[]) => onUpdate({ phases });

  const addPhase = () => {
    const ph: ConsultancyPhase = { id: uuid(), name: 'New Phase', tasks: [] };
    setPhases([...proposal.phases, ph]);
  };

  const updatePhase = (id: string, updates: Partial<ConsultancyPhase>) =>
    setPhases(proposal.phases.map(p => p.id === id ? { ...p, ...updates } : p));

  const deletePhase = (id: string) =>
    setPhases(proposal.phases.filter(p => p.id !== id));

  const addTask = (phaseId: string) => {
    const rc = rateCards[0];
    const t: ConsultancyTask = {
      id: uuid(), name: 'New Task',
      role: rc?.role ?? 'Consultant',
      days: 1, dayRate: rc?.sellRate ?? 850,
      unit: 'days', rateMultiplier: 1,
    };
    updatePhase(phaseId, {
      tasks: [...(proposal.phases.find(p => p.id === phaseId)?.tasks ?? []), t],
    });
  };

  const updateTask = (phaseId: string, taskId: string, updates: Partial<ConsultancyTask>) => {
    const phase = proposal.phases.find(p => p.id === phaseId);
    if (!phase) return;
    updatePhase(phaseId, {
      tasks: phase.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t),
    });
  };

  const deleteTask = (phaseId: string, taskId: string) => {
    const phase = proposal.phases.find(p => p.id === phaseId);
    if (!phase) return;
    updatePhase(phaseId, { tasks: phase.tasks.filter(t => t.id !== taskId) });
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

  // Does any rate card in this proposal's tasks have overtime enabled?
  const anyOvertimeEnabled = proposal.phases
    .flatMap(ph => ph.tasks)
    .some(t => rateCards.find(rc => rc.role === t.role)?.overtimeEnabled);

  const taskTotal = (t: ConsultancyTask) => t.days * t.dayRate * (t.rateMultiplier ?? 1);

  const baseTotal = proposal.phases.reduce((s, ph) =>
    s + ph.tasks.reduce((ts, t) => ts + taskTotal(t), 0), 0
  );
  const pmValue   = baseTotal * PM_RATE;
  const grandTotal = baseTotal + pmValue;

  return (
    <div className="max-w-4xl space-y-4">
      {proposal.phases.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-12 text-center text-gray-400 dark:text-slate-500 text-sm">
          No phases yet. Add a phase to get started.
        </div>
      )}

      {proposal.phases.map(phase => {
        const phTotal = phase.tasks.reduce((s, t) => s + taskTotal(t), 0);
        const isCollapsed = collapsed.has(phase.id);

        return (
          <div key={phase.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Phase header */}
            <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
              {editable && <GripVertical size={15} className="text-gray-300 flex-shrink-0" />}
              <input
                className="flex-1 bg-transparent font-semibold text-gray-900 dark:text-slate-100 text-sm outline-none border-b border-transparent hover:border-gray-300 focus:border-brand-500 py-0.5 disabled:text-gray-700 dark:disabled:text-slate-300"
                value={phase.name}
                onChange={e => updatePhase(phase.id, { name: e.target.value })}
                disabled={!editable}
              />
              <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{fmt(phTotal)}</span>
              <button onClick={() => toggleCollapse(phase.id)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500">
                {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
              {editable && (
                <button onClick={() => deletePhase(phase.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Tasks */}
            {!isCollapsed && (
              <div>
                {/* Task column headers */}
                <div className={clsx(
                  'grid gap-2 px-5 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide border-b border-gray-100 dark:border-slate-700',
                  anyOvertimeEnabled ? 'grid-cols-12' : 'grid-cols-12'
                )}>
                  <div className="col-span-3">Task</div>
                  <div className="col-span-3">Role</div>
                  <div className="col-span-2 text-center">Duration</div>
                  {anyOvertimeEnabled && <div className="col-span-1 text-center">Rate</div>}
                  <div className={clsx('text-right flex items-center justify-end gap-1', anyOvertimeEnabled ? 'col-span-2' : 'col-span-2')}>
                    <Lock size={10} className="text-gray-300" /> Rate / Day
                  </div>
                  <div className="col-span-1 text-right">Total</div>
                </div>

                {phase.tasks.length === 0 && (
                  <div className="px-5 py-4 text-xs text-gray-400 dark:text-slate-500">No tasks in this phase.</div>
                )}

                {phase.tasks.map(task => {
                  const rc = rateCards.find(r => r.role === task.role);
                  const overtimeAvailable = rc?.overtimeEnabled ?? false;
                  const multiplier = (task.rateMultiplier ?? 1) as 1 | 1.5 | 2;
                  const unit = task.unit ?? 'days';
                  const effectiveRate = task.dayRate * multiplier;

                  // Display value: if hours, show hours; if days show days
                  const displayQty = unit === 'hours'
                    ? parseFloat((task.days * HOURS_PER_DAY).toFixed(2))
                    : task.days;

                  const handleQtyChange = (val: string) => {
                    const num = parseFloat(val) || 0;
                    const days = unit === 'hours' ? num / HOURS_PER_DAY : num;
                    updateTask(phase.id, task.id, { days });
                  };

                  const toggleUnit = () => {
                    const newUnit = unit === 'days' ? 'hours' : 'days';
                    updateTask(phase.id, task.id, { unit: newUnit });
                  };

                  const cycleMultiplier = () => {
                    if (!overtimeAvailable || !editable) return;
                    const next: Record<1 | 1.5 | 2, 1 | 1.5 | 2> = { 1: 1.5, 1.5: 2, 2: 1 };
                    updateTask(phase.id, task.id, { rateMultiplier: next[multiplier] });
                  };

                  return (
                    <div key={task.id} className="grid grid-cols-12 gap-2 items-center px-5 py-2.5 border-b border-gray-50 dark:border-slate-700 last:border-0">
                      {/* Task name */}
                      <div className="col-span-3">
                        <input
                          className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 bg-transparent text-gray-900 dark:text-slate-100 disabled:opacity-70"
                          value={task.name}
                          onChange={e => updateTask(phase.id, task.id, { name: e.target.value })}
                          disabled={!editable}
                          placeholder="Task name"
                        />
                      </div>

                      {/* Role selector */}
                      <div className="col-span-3">
                        <select
                          className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 bg-transparent text-gray-900 dark:text-slate-100 disabled:opacity-70"
                          value={task.role}
                          onChange={e => {
                            const newRc = rateCards.find(r => r.role === e.target.value);
                            updateTask(phase.id, task.id, {
                              role: e.target.value,
                              dayRate: newRc ? newRc.sellRate : task.dayRate,
                              // Reset multiplier if new role doesn't have overtime
                              rateMultiplier: newRc?.overtimeEnabled ? multiplier : 1,
                            });
                          }}
                          disabled={!editable}
                        >
                          {rateCards.map(r => <option key={r.id}>{r.role}</option>)}
                          {!rateCards.find(r => r.role === task.role) && (
                            <option value={task.role}>{task.role}</option>
                          )}
                        </select>
                      </div>

                      {/* Duration + unit toggle */}
                      <div className="col-span-2 flex items-center gap-1">
                        <input
                          type="number"
                          min={unit === 'hours' ? 0.5 : 0.5}
                          step={unit === 'hours' ? 0.5 : 0.5}
                          className="flex-1 min-w-0 border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 text-center bg-transparent text-gray-900 dark:text-slate-100 disabled:opacity-70"
                          value={displayQty}
                          onChange={e => handleQtyChange(e.target.value)}
                          disabled={!editable}
                        />
                        <button
                          onClick={toggleUnit}
                          disabled={!editable}
                          title={unit === 'days' ? 'Switch to hours' : 'Switch to days'}
                          className={clsx(
                            'text-xs px-1.5 py-0.5 rounded border font-medium transition-colors flex-shrink-0',
                            unit === 'hours'
                              ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400'
                              : 'bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400',
                            !editable && 'cursor-default opacity-60'
                          )}
                        >
                          {unit === 'hours' ? 'hrs' : 'days'}
                        </button>
                      </div>

                      {/* Overtime multiplier (only column shown if any role has overtime) */}
                      {anyOvertimeEnabled && (
                        <div className="col-span-1 flex justify-center">
                          {overtimeAvailable ? (
                            <button
                              onClick={cycleMultiplier}
                              disabled={!editable}
                              title="Click to cycle: Standard → 1.5× → 2×"
                              className={clsx(
                                'text-xs px-1.5 py-0.5 rounded-full border font-medium transition-colors',
                                MULTIPLIER_COLORS[multiplier],
                                !editable && 'cursor-default'
                              )}
                            >
                              {MULTIPLIER_LABELS[multiplier]}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </div>
                      )}

                      {/* Effective rate (locked) */}
                      <div className="col-span-2 text-right">
                        <div className="text-sm py-0.5 text-gray-500 dark:text-slate-400 flex items-center justify-end gap-1">
                          <Lock size={11} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
                          <span className={multiplier > 1 ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}>
                            £{effectiveRate.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Line total */}
                      <div className="col-span-1 text-right text-sm font-semibold text-gray-800 dark:text-slate-200">
                        {fmt(taskTotal(task))}
                      </div>

                      {/* Delete */}
                      <div className="col-span-1 flex justify-end">
                        {editable && (
                          <button onClick={() => deleteTask(phase.id, task.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {editable && (
                  <div className="px-5 py-3">
                    <Button variant="ghost" size="sm" onClick={() => addTask(phase.id)}>
                      <Plus size={13} /> Add task
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Auto-calculated Project Management phase */}
      {proposal.phases.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-600 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
            <Lock size={14} className="text-gray-400 flex-shrink-0" />
            <span className="flex-1 font-semibold text-gray-700 dark:text-slate-300 text-sm">Project Management</span>
            <span className="text-xs text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-2 py-0.5 rounded-full">
              Auto-calculated
            </span>
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{fmt(pmValue)}</span>
          </div>
          <div className="px-5 py-3 text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>{PM_RATE * 100}% of base consultancy</span>
            <span className="text-gray-300 mx-1">·</span>
            <span>{fmt(baseTotal)} × {PM_RATE * 100}% = <span className="font-semibold text-gray-700 dark:text-slate-300">{fmt(pmValue)}</span></span>
          </div>
        </div>
      )}

      {/* Grand total */}
      {proposal.phases.length > 0 && (
        <div className="flex justify-end">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-6 py-3 flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-slate-400">Total consultancy value</span>
            <span className="text-xl font-bold text-gray-900 dark:text-slate-100">{fmt(grandTotal)}</span>
          </div>
        </div>
      )}

      {editable && (
        <Button variant="secondary" onClick={addPhase}>
          <Plus size={15} /> Add Phase
        </Button>
      )}
    </div>
  );
}
