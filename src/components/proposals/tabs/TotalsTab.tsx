import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Users, TrendingDown, ExternalLink, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { Proposal, ProposalStatus, PartType } from '../../../types';
import { calcTotals } from '../../../utils/totals';
import { HOURS_PER_DAY } from '../../../utils/rates';
import { useStore } from '../../../store';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/Badge';
import { WonLostModal, type WonLostData } from '../../proposals/WonLostModal';
import { crmApi } from '../../../lib/api';
import clsx from 'clsx';

const GP_WARN_PCT  = 25;  // amber
const GP_ALERT_PCT = 15;  // red

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

const STATUS_FLOW: ProposalStatus[] = ['New', 'In Progress', 'Waiting Approval', 'Approved', 'Sent to Customer', 'Won', 'Lost'];

const CATEGORY_COLORS: Record<string, string> = {
  Hardware: '#7c3aed',
  Software: '#2563eb',
  Monthly: '#0891b2',
  Annual: '#059669',
  Consultancy: '#d97706',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function partsByType(proposal: Proposal, type: PartType) {
  return proposal.parts.filter(p => (p.partType ?? 'Hardware') === type);
}

function typeTotal(proposal: Proposal, type: PartType) {
  const parts = partsByType(proposal, type);
  const cost = parts.reduce((s, p) => {
    const sel = p.quotes.find(q => q.selected);
    return s + (sel ? sel.cost : p.unitCost) * p.quantity;
  }, 0);
  const sell = parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  return { cost, sell, gp: sell - cost };
}

// ─── sub-components ──────────────────────────────────────────────────────────

function TableRow({
  label, cadence, cost, gp, total, bold, accent,
}: {
  label: string; cadence: string; cost: number; gp: number; total: number;
  bold?: boolean; accent?: boolean;
}) {
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
  return (
    <tr className={clsx(bold && 'border-t border-gray-200 dark:border-slate-700')}>
      <td className={clsx('py-2.5 pr-4 text-sm', bold ? 'font-bold text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-300')}>{label}</td>
      <td className="py-2.5 pr-4 text-xs text-gray-400 dark:text-slate-500">{cadence}</td>
      <td className="py-2.5 pr-4 text-sm text-right text-gray-600 dark:text-slate-400">{fmt(cost)}</td>
      <td className={clsx('py-2.5 pr-4 text-sm text-right font-medium', gp > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500')}>{fmt(gp)}</td>
      <td className={clsx('py-2.5 text-sm text-right font-semibold', accent ? 'text-violet-600 dark:text-violet-400 text-base font-bold' : bold ? 'text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-300')}>
        {fmt(total)}
      </td>
    </tr>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function TotalsTab({ proposal, editable, onUpdate }: Props) {
  const [confirmStatus, setConfirmStatus]       = useState<ProposalStatus | null>(null);
  const [wonLostStatus, setWonLostStatus]       = useState<'Won' | 'Lost' | null>(null);
  const [crmConfigured, setCrmConfigured]       = useState(false);
  const [atLoading, setAtLoading]               = useState(false);
  const [atError, setAtError]                   = useState<string | null>(null);
  const { rateCards } = useStore();

  useEffect(() => {
    crmApi.status().then(r => setCrmConfigured(r.configured)).catch(() => {});
  }, []);
  const totals = calcTotals(proposal, rateCards);
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

  // Category breakdowns
  const hw = typeTotal(proposal, 'Hardware');
  const sw = typeTotal(proposal, 'Software');
  const mo = typeTotal(proposal, 'Monthly');
  const an = typeTotal(proposal, 'Annual');
  const cons = {
    cost: totals.consultancyCost,
    sell: totals.consultancyDiscountedSell,   // post-discount
    gp:   totals.consultancyDiscountedSell - totals.consultancyCost,
  };
  const hasDiscount = (proposal.consultancyDiscountAmount ?? 0) > 0;

  const upfrontTotal = {
    cost: hw.cost + sw.cost + cons.cost,
    sell: hw.sell + sw.sell + cons.sell,
    gp:   hw.gp  + sw.gp  + cons.gp,
  };
  const annualSubs = { cost: an.cost, sell: an.sell, gp: an.gp };
  const monthlyX12 = { cost: mo.cost * 12, sell: mo.sell * 12, gp: mo.gp * 12 };
  const tco = {
    cost: upfrontTotal.cost + monthlyX12.cost + annualSubs.cost,
    sell: upfrontTotal.sell + monthlyX12.sell + annualSubs.sell,
    gp: upfrontTotal.gp + monthlyX12.gp + annualSubs.gp,
  };

  // Donut chart data — only categories with non-zero sell
  const chartData = [
    { name: 'Hardware', value: hw.sell },
    { name: 'Software', value: sw.sell },
    { name: 'Monthly', value: mo.sell * 12 },
    { name: 'Annual', value: an.sell },
    { name: 'Consultancy', value: cons.sell },
  ].filter(d => d.value > 0);

  // Consultancy by role
  const roleMap: Record<string, { days: number; hours: number; value: number }> = {};
  for (const phase of proposal.phases) {
    for (const task of phase.tasks) {
      if (!roleMap[task.role]) roleMap[task.role] = { days: 0, hours: 0, value: 0 };
      const multiplier = task.rateMultiplier ?? 1;
      roleMap[task.role].days  += task.days;
      roleMap[task.role].hours += task.days * HOURS_PER_DAY;
      roleMap[task.role].value += task.days * task.dayRate * multiplier;
    }
  }
  // Add PM (auto-calculated — no day/hour breakdown available)
  if (totals.pmValue > 0) {
    roleMap['Project Management'] = { days: 0, hours: 0, value: totals.pmValue };
  }
  const roles = Object.entries(roleMap).sort((a, b) => b[1].value - a[1].value);
  const totalConsValue = roles.reduce((s, [, v]) => s + v.value, 0);

  const avgGpPct = tco.sell > 0 ? (tco.gp / tco.sell) * 100 : 0;

  const handleStatusChange = (status: ProposalStatus) => {
    if (status === 'In Progress' && proposal.status === 'New') {
      setConfirmStatus(status);
      return;
    }
    if (status === 'Won' || status === 'Lost') {
      setWonLostStatus(status);
      return;
    }
    onUpdate({ status });
    setConfirmStatus(null);
  };

  const handleWonLostConfirm = (data: WonLostData) => {
    if (!wonLostStatus) return;
    onUpdate({
      status: wonLostStatus,
      wonLostAt: new Date().toISOString(),
      wonLostReason: data.wonLostReason as Proposal['wonLostReason'],
      competitorName: data.competitorName || undefined,
      wonLostNote: data.wonLostNote || undefined,
    });
    setWonLostStatus(null);
  };

  const handleCreateAtTicket = async () => {
    if (!proposal.crmCompanyId) return;
    setAtLoading(true); setAtError(null);
    try {
      const res = await crmApi.createTicket({
        title: `[Post Sale] ${proposal.projectName}`,
        companyID: parseInt(proposal.crmCompanyId),
        description: [
          `Proposal Reference: ${proposal.reference ?? proposal.id}`,
          `Client: ${proposal.client}`,
          proposal.accountManager ? `Account Manager: ${proposal.accountManager}` : '',
          '',
          proposal.objectives ? `Objectives:\n${proposal.objectives}` : '',
        ].filter(Boolean).join('\n'),
      });
      onUpdate({ atProjectId: String(res.ticketId) });
    } catch (e) {
      setAtError(e instanceof Error ? e.message : 'Failed to create ticket');
    } finally { setAtLoading(false); }
  };

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Top: Commercial Summary + TCO chart ──────────────────────────── */}
      <div className="grid grid-cols-3 gap-5">

        {/* Left: table */}
        <div className="col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
          {/* Gradient header */}
          <div className="px-6 py-4 bg-gradient-to-r from-blue-900 to-teal-600">
            <div className="text-white font-bold text-base">Commercial Summary</div>
            <div className="text-blue-200 text-xs mt-0.5">Auto-calculated from parts and consultancy.</div>
            <label className="flex items-center gap-2 text-xs text-blue-200 cursor-pointer select-none mt-2">
              <input
                type="checkbox"
                checked={proposal.useRateCardCost ?? false}
                onChange={e => editable && onUpdate({ useRateCardCost: e.target.checked })}
                disabled={!editable}
                className="rounded"
              />
              Use rate card cost in GP calculation
            </label>
          </div>

          <div className="px-6 py-2">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700">
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Category</th>
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Cadence</th>
                  <th className="py-2.5 pr-4 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Cost</th>
                  <th className="py-2.5 pr-4 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">GP</th>
                  <th className="py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                <TableRow label="Hardware"              cadence="Upfront"              cost={hw.cost}             gp={hw.gp}             total={hw.sell} />
                <TableRow label="Software"              cadence="Upfront"              cost={sw.cost}             gp={sw.gp}             total={sw.sell} />
                <TableRow label="Monthly Subscriptions" cadence="Per month"            cost={mo.cost}             gp={mo.gp}             total={mo.sell} />
                <TableRow label="Annual Subscriptions"  cadence="Per year"             cost={an.cost}             gp={an.gp}             total={an.sell} />
                <TableRow
                  label={hasDiscount ? `Consultancy (−${proposal.consultancyDiscountType === 'percentage' ? `${proposal.consultancyDiscountAmount}%` : fmt(totals.consultancyDiscountValue)} discount)` : 'Consultancy'}
                  cadence="Upfront"
                  cost={cons.cost} gp={cons.gp} total={cons.sell}
                />
                <TableRow label="Upfront Total"         cadence="HW + SW + Consultancy" cost={upfrontTotal.cost}  gp={upfrontTotal.gp}   total={upfrontTotal.sell} bold />
                <TableRow label="1st Year Monthly Subs" cadence="Monthly × 12"         cost={monthlyX12.cost}     gp={monthlyX12.gp}     total={monthlyX12.sell} bold />
                <TableRow label="1st Year TCO"          cadence="Upfront + 12m + Annual" cost={tco.cost}          gp={tco.gp}            total={tco.sell} bold accent />
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: chart + quick stats */}
        <div className="col-span-1 flex flex-col gap-4">

          {/* Donut */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">1st Year TCO Breakdown</div>
            {chartData.length > 0 ? (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={72}
                        dataKey="value"
                        strokeWidth={2}
                      >
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[entry.name] ?? '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide">Total</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{fmt(tco.sell)}</span>
                  </div>
                </div>
                <div className="space-y-1.5 mt-1">
                  {chartData.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[d.name] ?? '#94a3b8' }} />
                        <span className="text-gray-600 dark:text-slate-400">{d.name}</span>
                      </div>
                      <span className="font-medium text-gray-800 dark:text-slate-200">{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-400 dark:text-slate-500 py-4 text-center">No parts or consultancy added yet.</div>
            )}
          </div>

          {/* Quick stats */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">Quick Stats</div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">Avg GP%</span>
                <div className="flex items-center gap-1.5">
                  <span className={clsx('font-semibold',
                    avgGpPct >= GP_WARN_PCT ? 'text-emerald-600' :
                    avgGpPct >= GP_ALERT_PCT ? 'text-amber-600 dark:text-amber-400' :
                    'text-red-600 dark:text-red-400'
                  )}>
                    {avgGpPct.toFixed(1)}%
                  </span>
                  {avgGpPct < GP_ALERT_PCT && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <TrendingDown size={10} /> Low margin
                    </span>
                  )}
                  {avgGpPct >= GP_ALERT_PCT && avgGpPct < GP_WARN_PCT && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <TrendingDown size={10} /> Thin margin
                    </span>
                  )}
                </div>
              </div>
              <StatRow label="Total Cost"    value={fmt(tco.cost)} />
              <StatRow label="Gross Profit"  value={fmt(tco.gp)} valueClass="text-emerald-600" />
            </div>
            {/* Per-category alerts */}
            {[
              { label: 'Hardware', sell: hw.sell, gp: hw.gp },
              { label: 'Software', sell: sw.sell, gp: sw.gp },
              { label: 'Consultancy', sell: cons.sell, gp: cons.gp },
            ].filter(x => x.sell > 0).map(x => {
              const pct = (x.gp / x.sell) * 100;
              if (pct >= GP_WARN_PCT) return null;
              return (
                <div key={x.label} className={clsx(
                  'flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg mt-1',
                  pct < GP_ALERT_PCT ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                     : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
                )}>
                  <TrendingDown size={11} />
                  {x.label} GP: {pct.toFixed(1)}%
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Consultancy by Resource Type ─────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Users size={18} className="text-indigo-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Consultancy by Resource Type</div>
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Hours and value rolled up per resource role, using this proposal's locked rate card.
            </div>
          </div>
        </div>

        {roles.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
            No consultancy effort has been added yet. Add phases and tasks on the Consultancy tab to see this breakdown.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-100 dark:border-slate-700">
                <th className="px-6 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Days</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Hours</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Value</th>
                <th className="px-6 py-2.5 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
              {roles.map(([role, { days, hours, value }]) => {
                const isPm = role === 'Project Management';
                const fmtQty = (n: number) => n % 1 === 0 ? `${n}` : n.toFixed(1);
                return (
                  <tr key={role} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-800 dark:text-slate-200">{role}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-slate-400">
                      {isPm ? '—' : fmtQty(days)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-slate-400">
                      {isPm ? '—' : fmtQty(hours)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-slate-100">{fmt(value)}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-400 rounded-full"
                            style={{ width: `${totalConsValue > 0 ? (value / totalConsValue) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-slate-400 w-9 text-right">
                          {totalConsValue > 0 ? `${((value / totalConsValue) * 100).toFixed(0)}%` : '—'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Status control ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Proposal Status</h2>
          <StatusBadge status={proposal.status} />
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center gap-0 mb-6">
            {STATUS_FLOW.filter(s => s !== 'Lost').map((status, i, arr) => (
              <div key={status} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <button
                    onClick={() => editable && handleStatusChange(status)}
                    disabled={!editable}
                    className={clsx(
                      'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors',
                      proposal.status === status
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : STATUS_FLOW.indexOf(proposal.status) > STATUS_FLOW.indexOf(status)
                          ? 'bg-brand-100 border-brand-300 text-brand-600'
                          : 'bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500',
                      editable && 'hover:border-brand-400'
                    )}
                  >{i + 1}</button>
                  <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">{status}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className={clsx(
                    'h-0.5 flex-1 -mt-5',
                    STATUS_FLOW.indexOf(proposal.status) > STATUS_FLOW.indexOf(status) ? 'bg-brand-300' : 'bg-gray-200'
                  )} />
                )}
              </div>
            ))}
          </div>

          {editable && proposal.status !== 'Lost' && (
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
              <span className="text-sm text-gray-600 dark:text-slate-400">Mark this deal as lost:</span>
              <Button variant="danger" size="sm" onClick={() => handleStatusChange('Lost')}>Mark as Lost</Button>
            </div>
          )}
          {proposal.status === 'Won' && (
            <div className="space-y-3 mt-2">
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle size={16} />
                <span>Congratulations! This proposal is marked as Won.</span>
              </div>
              {/* Win/loss data display */}
              {proposal.wonLostReason && (
                <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg text-xs space-y-1">
                  <div><span className="text-gray-500 dark:text-slate-400">Reason won: </span><span className="font-medium">{proposal.wonLostReason}</span></div>
                  {proposal.competitorName && <div><span className="text-gray-500 dark:text-slate-400">Competitor: </span><span className="font-medium">{proposal.competitorName}</span></div>}
                  {proposal.wonLostNote && <div className="italic text-gray-600 dark:text-slate-400">"{proposal.wonLostNote}"</div>}
                </div>
              )}
              {/* Autotask post-sale ticket */}
              {crmConfigured && proposal.crmCompanyId && (
                <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                  {proposal.atProjectId ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                      <CheckCircle size={14} />
                      <span>Post Sale ticket created in Autotask (T#{proposal.atProjectId})</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={handleCreateAtTicket}
                        disabled={atLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                      >
                        {atLoading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                        Create Post Sale Ticket in Autotask
                      </button>
                      {atError && <p className="text-xs text-red-500">{atError}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {proposal.status === 'Lost' && proposal.wonLostReason && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg text-xs space-y-1">
              <div><span className="text-gray-500 dark:text-slate-400">Reason lost: </span><span className="font-medium">{proposal.wonLostReason}</span></div>
              {proposal.competitorName && <div><span className="text-gray-500 dark:text-slate-400">Lost to: </span><span className="font-medium">{proposal.competitorName}</span></div>}
              {proposal.wonLostNote && <div className="italic text-gray-600 dark:text-slate-400">"{proposal.wonLostNote}"</div>}
            </div>
          )}
          {proposal.status === 'Approved' && editable && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              This proposal is approved. You can now export it to Excel or share with the client.
            </div>
          )}
        </div>
      </div>

      {/* Win/Loss modal */}
      {wonLostStatus && (
        <WonLostModal
          status={wonLostStatus}
          onConfirm={handleWonLostConfirm}
          onCancel={() => setWonLostStatus(null)}
        />
      )}

      {/* Confirm submit dialog */}
      {confirmStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-2">Submit for Approval?</h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-6">
              Moving to "In Progress" will notify approvers that this proposal is ready for sign-off.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmStatus(null)}>Cancel</Button>
              <Button onClick={() => { onUpdate({ status: confirmStatus }); setConfirmStatus(null); }}>
                Submit for Review
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
      <span className={clsx('font-semibold', valueClass ?? 'text-gray-900 dark:text-slate-100')}>{value}</span>
    </div>
  );
}

