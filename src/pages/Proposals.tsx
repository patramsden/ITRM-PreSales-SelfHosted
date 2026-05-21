import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Plus, Search, Filter, ArrowRight, Copy } from 'lucide-react';
import { useStore } from '../store';
import { calcTotals } from '../utils/totals';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { NewProposalModal } from '../components/proposals/NewProposalModal';
import type { ProposalStatus } from '../types';

const ALL_STATUSES: ProposalStatus[] = ['Draft', 'In Progress', 'Approved', 'With Account Manager', 'Won', 'Lost'];

export function Proposals() {
  useDocumentTitle('Proposals');
  const { proposals, cloneProposal } = useStore();
  const users = useStore(s => s.users);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'All'>('All');
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    let list = [...proposals].sort((a, b) => b.dateModified.localeCompare(a.dateModified));
    if (statusFilter !== 'All') list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.projectName.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        (p.ticketRef ?? '').toLowerCase().includes(q) ||
        (p.reference ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [proposals, search, statusFilter]);

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-8">
      <PageHeader
        title="Proposals"
        subtitle={`${proposals.length} total`}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} /> New Proposal
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search proposals…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={14} className="text-gray-400" />
          {(['All', ...ALL_STATUSES] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Project</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Ref</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Owner</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Value</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Modified</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-center">Clone</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400 dark:text-slate-500 text-sm">No proposals match your filter.</td>
              </tr>
            )}
            {filtered.map(p => {
              const owner = users.find(u => u.id === p.ownerId);
              const totals = calcTotals(p);
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/proposals/${p.id}`)}
                  className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer group"
                >
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-gray-900 dark:text-slate-100 group-hover:text-brand-600">{p.projectName}</div>
                    {p.ticketRef && <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{p.ticketRef}</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    {p.reference ? (
                      <span className="text-xs font-mono text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                        {p.reference}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600 dark:text-slate-400">{p.client}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3.5 text-gray-600 dark:text-slate-400">{owner?.name ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-900 dark:text-slate-100">{fmt(totals.grandTotal)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-400 dark:text-slate-500">{p.dateModified}</td>
                  <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        const newId = cloneProposal(p.id);
                        if (newId) navigate(`/proposals/${newId}`);
                      }}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      title="Clone proposal"
                    >
                      <Copy size={14} />
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <ArrowRight size={14} className="text-gray-300 group-hover:text-brand-500" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <NewProposalModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
