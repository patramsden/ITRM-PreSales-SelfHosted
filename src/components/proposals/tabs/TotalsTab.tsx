import { useState } from 'react';
import { CheckCircle, AlertCircle, Users, CalendarCheck, ShieldAlert, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { Proposal, ProposalStatus, PartType } from '../../../types';
import { calcTotals, PM_RATE } from '../../../utils/totals';
import { HOURS_PER_DAY } from '../../../pages/RateCards';
import { requiredReviews, REVIEW_THRESHOLDS } from '../../../config/approvals';
import { buildTeamsMeetingUrl, buildOutlookUrl } from '../../../utils/teamsUrl';
import { buildTrbMailtoUrl } from '../../../utils/mailtoUrl';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/Badge';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

const STATUS_FLOW: ProposalStatus[] = ['Draft', 'In Review', 'Approved', 'Won', 'Lost'];

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
  const [confirmStatus, setConfirmStatus] = useState<ProposalStatus | null>(null);
  const totals = calcTotals(proposal);
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

  // Category breakdowns
  const hw = typeTotal(proposal, 'Hardware');
  const sw = typeTotal(proposal, 'Software');
  const mo = typeTotal(proposal, 'Monthly');
  const an = typeTotal(proposal, 'Annual');
  const cons = {
    cost: totals.consultancyCost,
    sell: totals.consultancySell,
    gp: totals.consultancySell - totals.consultancyCost,
  };

  const upfrontTotal = {
    cost: hw.cost + sw.cost + cons.cost,
    sell: hw.sell + sw.sell + cons.sell,
    gp: hw.gp + sw.gp + cons.gp,
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
    if (status === 'In Review' && proposal.status === 'Draft') {
      setConfirmStatus(status);
      return;
    }
    onUpdate({ status });
    setConfirmStatus(null);
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
                <TableRow label="Consultancy"           cadence="Upfront"              cost={cons.cost}           gp={cons.gp}           total={cons.sell} />
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
              <StatRow label="Avg GP%" value={`${avgGpPct.toFixed(1)}%`} valueClass={avgGpPct >= 20 ? 'text-emerald-600' : avgGpPct >= 10 ? 'text-amber-600' : 'text-red-600'} />
              <StatRow label="Total Cost" value={fmt(tco.cost)} />
              <StatRow label="Gross Profit" value={fmt(tco.gp)} valueClass="text-emerald-600" />
            </div>
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

      {/* ── Approval Requirements ────────────────────────────────────────── */}
      <ApprovalsBlock proposal={proposal} grossProfit={tco.gp} editable={editable} onUpdate={onUpdate} />

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
            <div className="flex items-center gap-2 mt-2 text-green-700 text-sm">
              <CheckCircle size={16} />
              <span>Congratulations! This proposal is marked as Won.</span>
            </div>
          )}
          {proposal.status === 'Approved' && editable && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              This proposal is approved. You can now export it to Excel or share with the client.
            </div>
          )}
        </div>
      </div>

      {/* Confirm submit dialog */}
      {confirmStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-2">Submit for Approval?</h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-6">
              Moving to "In Review" will notify approvers that this proposal is ready for sign-off.
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

// ─── Approvals block ─────────────────────────────────────────────────────────

const TRB_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:  { label: 'Required — not sent',   color: 'text-amber-700 bg-amber-50  border-amber-200',  dot: 'bg-amber-400'  },
  sent:     { label: 'Sent for review',        color: 'text-blue-700  bg-blue-50   border-blue-200',   dot: 'bg-blue-500'   },
  approved: { label: 'Approved',               color: 'text-green-700 bg-green-50  border-green-200',  dot: 'bg-green-500'  },
  rejected: { label: 'Rejected',               color: 'text-red-700   bg-red-50    border-red-200',    dot: 'bg-red-500'    },
  waived:   { label: 'Waived',                 color: 'text-gray-500  bg-gray-50   border-gray-200',   dot: 'bg-gray-400'   },
};

const FIVEK_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:  { label: 'Required — not booked', color: 'text-amber-700 bg-amber-50  border-amber-200',  dot: 'bg-amber-400'  },
  booked:   { label: 'Meeting booked',         color: 'text-blue-700  bg-blue-50   border-blue-200',   dot: 'bg-blue-500'   },
  complete: { label: 'Review complete',        color: 'text-green-700 bg-green-50  border-green-200',  dot: 'bg-green-500'  },
  waived:   { label: 'Waived',                 color: 'text-gray-500  bg-gray-50   border-gray-200',   dot: 'bg-gray-400'   },
};

function ApprovalsBlock({
  proposal, grossProfit, editable, onUpdate,
}: {
  proposal: Proposal;
  grossProfit: number;
  editable: boolean;
  onUpdate: (u: Partial<Proposal>) => void;
}) {
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
  const required = requiredReviews(grossProfit);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [trbEmail, setTrbEmail] = useState('');

  const lowestThreshold = REVIEW_THRESHOLDS[0].minGP;
  const gpMeetsLowest = grossProfit >= lowestThreshold;

  const trbStatus   = proposal.trbStatus   ?? 'pending';
  const fiveKStatus = proposal.fiveKStatus ?? 'pending';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', gpMeetsLowest ? 'bg-amber-50' : 'bg-gray-50')}>
            <ShieldAlert size={18} className={gpMeetsLowest ? 'text-amber-500' : 'text-gray-400'} />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Approval Requirements</div>
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              GP for this proposal: <span className="font-semibold text-gray-700 dark:text-slate-300">{fmt(grossProfit)}</span>
            </div>
          </div>
        </div>
        {required.length > 0 && (
          <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">
            {required.length} review{required.length > 1 ? 's' : ''} required
          </span>
        )}
      </div>

      {!gpMeetsLowest ? (
        <div className="px-6 py-5 text-sm text-gray-400 dark:text-slate-500 flex items-center gap-2">
          <CheckCircle size={15} className="text-green-400 flex-shrink-0" />
          GP is below £{lowestThreshold.toLocaleString()} — no approval reviews required.
        </div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-slate-700">
          {REVIEW_THRESHOLDS.map(review => {
            const isRequired = grossProfit >= review.minGP;
            const expanded = expandedKey === review.key;

            if (review.key === 'trb') {
              // ── TRB: email-based async review ──────────────────────────────
              const cfg = TRB_STATUS_CONFIG[trbStatus] ?? TRB_STATUS_CONFIG.pending;
              const mailtoUrl = buildTrbMailtoUrl(proposal, { to: trbEmail, from: '', grossProfit, grandTotal: grossProfit / 0.155 });
              const isDecided = trbStatus === 'approved' || trbStatus === 'rejected';

              return (
                <div key="trb" className={clsx(!isRequired && 'opacity-40')}>
                  <div
                    className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 select-none"
                    onClick={() => setExpandedKey(expanded ? null : 'trb')}
                  >
                    <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{review.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Triggered at GP ≥ £{review.minGP.toLocaleString()} · Email-based async review
                      </div>
                    </div>
                    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0', cfg.color)}>
                      {cfg.label}
                    </span>
                    {isRequired && (expanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />)}
                  </div>

                  {expanded && isRequired && (
                    <div className="px-6 pb-5 pt-1 space-y-4">
                      <p className="text-xs text-gray-500">{review.description}</p>

                      {/* Decision outcome */}
                      {isDecided && (
                        <div className={clsx('flex items-start gap-3 p-4 rounded-xl border', trbStatus === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
                          {trbStatus === 'approved'
                            ? <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                            : <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                          }
                          <div className="text-sm">
                            <span className="font-semibold text-gray-900">{trbStatus === 'approved' ? 'Approved' : 'Rejected'}</span>
                            {' by '}<span className="text-gray-700">{proposal.trbReviewedBy}</span>
                            {proposal.trbReviewedAt && <span className="text-gray-400"> · {new Date(proposal.trbReviewedAt).toLocaleDateString('en-GB')}</span>}
                            {proposal.trbReviewNotes && <div className="mt-1 text-gray-600 italic">"{proposal.trbReviewNotes}"</div>}
                          </div>
                        </div>
                      )}

                      {/* Send for review */}
                      {!isDecided && editable && trbStatus !== 'waived' && (
                        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
                          <div>
                            <div className="text-sm font-semibold text-indigo-900">Send for TRB Review</div>
                            <div className="text-xs text-indigo-600 mt-0.5">
                              Opens your email client with a pre-filled message containing a direct link to this proposal.
                              The reviewer can open the proposal and submit their decision in-app.
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white placeholder:text-indigo-300"
                              placeholder="approver@company.com (optional)"
                              value={trbEmail}
                              onChange={e => setTrbEmail(e.target.value)}
                            />
                            <a
                              href={mailtoUrl}
                              onClick={() => { if (editable) onUpdate({ trbStatus: 'sent' }); }}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                            >
                              <ExternalLink size={13} /> Send Email
                            </a>
                          </div>
                          {trbStatus === 'sent' && (
                            <div className="text-xs text-indigo-700 flex items-center gap-1.5">
                              <CheckCircle size={12} /> Email sent — awaiting reviewer response.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Manual status override */}
                      {editable && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-gray-400">Override status:</span>
                          {(['pending', 'sent', 'approved', 'rejected', 'waived'] as const).map(s => (
                            <button key={s} onClick={() => onUpdate({ trbStatus: s })}
                              className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                                trbStatus === s ? TRB_STATUS_CONFIG[s].color : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400')}>
                              {TRB_STATUS_CONFIG[s].label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            // ── 5K Review: Teams meeting ──────────────────────────────────────
            const cfg = FIVEK_STATUS_CONFIG[fiveKStatus] ?? FIVEK_STATUS_CONFIG.pending;
            const teamsUrl  = buildTeamsMeetingUrl(proposal, review);
            const outlookUrl = buildOutlookUrl(proposal, review);

            return (
              <div key="fiveK" className={clsx(!isRequired && 'opacity-40')}>
                <div
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 select-none"
                  onClick={() => setExpandedKey(expanded ? null : 'fiveK')}
                >
                  <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{review.label}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                      Triggered at GP ≥ £{review.minGP.toLocaleString()} · {review.durationMins}-minute Teams review
                    </div>
                  </div>
                  <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0', cfg.color)}>
                    {cfg.label}
                  </span>
                  {isRequired && (expanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />)}
                </div>

                {expanded && isRequired && (
                  <div className="px-6 pb-5 pt-1 space-y-4">
                    <p className="text-xs text-gray-500">{review.description}</p>

                    {fiveKStatus !== 'complete' && fiveKStatus !== 'waived' && (
                      <div className="flex flex-wrap items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-blue-900">Book via Microsoft Teams</div>
                          <div className="text-xs text-blue-600 mt-0.5">
                            Opens a pre-filled {review.durationMins}-minute meeting invite for the next working day at 09:00.
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a href={teamsUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                            onClick={() => editable && fiveKStatus === 'pending' && onUpdate({ fiveKStatus: 'booked' })}>
                            <CalendarCheck size={15} /> Book in Teams <ExternalLink size={12} className="opacity-70" />
                          </a>
                          <a href={outlookUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg transition-colors"
                            title="Open in Outlook instead">
                            Outlook <ExternalLink size={12} className="opacity-70" />
                          </a>
                        </div>
                      </div>
                    )}

                    {editable && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-400">Update status:</span>
                        {(['pending', 'booked', 'complete', 'waived'] as const).map(s => (
                          <button key={s} onClick={() => onUpdate({ fiveKStatus: s })}
                            className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                              fiveKStatus === s ? FIVEK_STATUS_CONFIG[s].color : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400')}>
                            {FIVEK_STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
