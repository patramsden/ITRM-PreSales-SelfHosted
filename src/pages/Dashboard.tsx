import { useMemo } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, FileText, Clock, Trophy, XCircle, Plus, ArrowRight } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { calcTotals } from '../utils/totals';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import type { ProposalStatus } from '../types';
import clsx from 'clsx';

const STATUS_ORDER: ProposalStatus[] = ['New', 'In Progress', 'Waiting Approval', 'Approved', 'Sent to Customer', 'Won', 'Lost'];

const statusIcons: Record<ProposalStatus, { icon: typeof FileText; color: string }> = {
  'New':                { icon: FileText,   color: 'text-gray-500 bg-gray-100'     },
  'In Progress':        { icon: Clock,       color: 'text-amber-600 bg-amber-50'   },
  'Waiting Approval':   { icon: Clock,       color: 'text-orange-600 bg-orange-50' },
  'Approved':           { icon: TrendingUp,  color: 'text-blue-600 bg-blue-50'     },
  'Sent to Customer':   { icon: TrendingUp,  color: 'text-violet-600 bg-violet-50' },
  'Won':                { icon: Trophy,      color: 'text-green-600 bg-green-50'   },
  'Lost':               { icon: XCircle,     color: 'text-red-500 bg-red-50'       },
};

export function Dashboard() {
  useDocumentTitle();
  const { proposals } = useStore();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const total = proposals.length;
    const totalValue = proposals.reduce((sum, p) => sum + calcTotals(p).grandTotal, 0);
    const byStatus = Object.fromEntries(STATUS_ORDER.map(s => [s, proposals.filter(p => p.status === s)])) as Record<ProposalStatus, typeof proposals>;
    const decided = byStatus.Won.length + byStatus.Lost.length;
    const winRate = decided > 0 ? (byStatus.Won.length / decided) * 100 : 0;
    const wonValue = byStatus.Won.reduce((sum, p) => sum + calcTotals(p).grandTotal, 0);

    // AM leaderboard — from Won proposals
    const amMap: Record<string, { count: number; totalValue: number; totalCycleDays: number }> = {};
    for (const p of byStatus.Won) {
      const am = p.accountManager?.trim() || 'Unassigned';
      const val = calcTotals(p).grandTotal;
      const cycle = (new Date(p.dateModified).getTime() - new Date(p.dateCreated).getTime()) / 86400000;
      if (!amMap[am]) amMap[am] = { count: 0, totalValue: 0, totalCycleDays: 0 };
      amMap[am].count++;
      amMap[am].totalValue += val;
      amMap[am].totalCycleDays += cycle;
    }
    const amStats = Object.entries(amMap)
      .map(([am, d]) => ({
        am,
        count: d.count,
        avgDeal: d.totalValue / d.count,
        avgCycle: Math.round(d.totalCycleDays / d.count),
      }))
      .sort((a, b) => b.count - a.count);

    return { total, totalValue, byStatus, winRate, wonValue, amStats };
  }, [proposals]);

  const recentProposals = useMemo(
    () => [...proposals].sort((a, b) => b.dateModified.localeCompare(a.dateModified)).slice(0, 6),
    [proposals]
  );

  // Simple chart data – won value per month (last 6 months)
  const chartData = useMemo(() => {
    const months: Record<string, number> = {};
    const now = new Date('2026-05-12');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
    }
    for (const p of proposals.filter(p => p.status === 'Won')) {
      const key = p.dateModified.slice(0, 7);
      if (key in months) months[key] += calcTotals(p).grandTotal;
    }
    return Object.entries(months).map(([month, value]) => ({
      month: new Date(month).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      value,
    }));
  }, [proposals]);

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-8 dark:text-slate-100">
      {/* Greeting */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            Good {greeting()}, {currentUser ? firstNameFromEmail(currentUser.email) : ''} 👋
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Here's what's happening with your proposals today.</p>
        </div>
        <Button onClick={() => navigate('/proposals/new')}>
          <Plus size={16} /> New Proposal
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Proposals" value={String(stats.total)} sub="in flight" color="text-brand-600 dark:text-brand-400" />
        <MetricCard label="Pipeline Value" value={fmt(stats.totalValue)} sub="all statuses" color="text-purple-600 dark:text-purple-400" />
        <MetricCard label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} sub="won vs decided" color="text-green-600 dark:text-green-400" />
        <MetricCard label="Value Won" value={fmt(stats.wonValue)} sub="closed-won" color="text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* AM Leaderboard */}
      {stats.amStats.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Account Manager Leaderboard</h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Closed-won deals only</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-100 dark:border-slate-700">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Account Manager</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Deals Won</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Avg Deal Value</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Avg Cycle (days)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                {stats.amStats.map(row => (
                  <tr key={row.am} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                    <td className="px-5 py-2.5 font-medium text-gray-800 dark:text-slate-200">{row.am}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600 dark:text-green-400">{row.count}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-slate-300">{fmt(row.avgDeal)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-500 dark:text-slate-400">{row.avgCycle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status breakdown + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Status breakdown */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">By Status</h2>
          <div className="space-y-3">
            {STATUS_ORDER.map(status => {
              const { icon: Icon, color } = statusIcons[status];
              const count = stats.byStatus[status].length;
              const value = stats.byStatus[status].reduce((s, p) => s + calcTotals(p).grandTotal, 0);
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className={clsx('p-1.5 rounded-md', color)}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800 dark:text-slate-200">{status}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{count}</span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{fmt(value)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Value Won (last 6 months)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Area type="monotone" dataKey="value" stroke="#2563eb" fill="url(#grad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent proposals */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Recently Touched</h2>
          <button onClick={() => navigate('/proposals')} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            All proposals <ArrowRight size={12} />
          </button>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-slate-700">
          {recentProposals.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/proposals/${p.id}`)}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-slate-100 group-hover:text-brand-600 truncate">{p.projectName}</div>
                <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{p.client} · Modified {p.dateModified}</div>
              </div>
              <StatusBadge status={p.status} />
              <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 w-24 text-right">{fmt(calcTotals(p).grandTotal)}</div>
              <ArrowRight size={14} className="text-gray-300 group-hover:text-brand-500 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
      <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', color)}>{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</div>
      <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

/** Extract a first name from an email address.
 *  pat.ramsden@company.com  → Pat
 *  pratramsden@company.com  → Pratramsden  (no dot before @)
 */
function firstNameFromEmail(email: string): string {
  const local   = email.split('@')[0] ?? email;          // everything before @
  const first   = local.split('.')[0] ?? local;           // everything before first .
  return first.charAt(0).toUpperCase() + first.slice(1); // capitalise
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
