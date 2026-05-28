import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Plus, Search, Filter, ArrowRight, Copy, HeartHandshake, Repeat, Trash2, CheckSquare, X, ChevronDown, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { calcTotals } from '../utils/totals';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { NewProposalModal } from '../components/proposals/NewProposalModal';
import { SupportProposalWizard } from '../components/proposals/SupportProposalWizard';
import type { Proposal, ProposalStatus } from '../types';
import clsx from 'clsx';

const ALL_STATUSES: ProposalStatus[] = ['New', 'In Progress', 'Waiting Approval', 'Approved', 'Sent to Customer', 'Won', 'Lost'];

export function Proposals() {
  useDocumentTitle('Proposals');
  const { proposals, addProposal, cloneProposal, deleteProposal, updateProposal } = useStore();
  const { currentUser } = useAuth();
  const users = useStore(s => s.users);
  const rateCards = useStore(s => s.rateCards);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'All'>('All');
  const [showNew, setShowNew] = useState(false);
  const [showSupportWizard, setShowSupportWizard] = useState(false);

  // ── Multi-select state ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkStatus,  setBulkStatus]    = useState<ProposalStatus | ''>('');
  const [bulkWorking, setBulkWorking]   = useState(false);

  // Only admins and sales_admins can bulk-edit
  const canBulkEdit = ['admin', 'sales_admin'].includes(currentUser?.appRole ?? '');

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

  const fmt = (n: number, currency = 'GBP') => {
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
    return `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  };

  // ── Selection helpers ────────────────────────────────────────────────────────
  const allVisibleSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const someSelected       = selectedIds.size > 0;

  const toggleRow = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.add(p.id));
        return next;
      });
    }
  }, [allVisibleSelected, filtered]);

  const clearSelection = () => { setSelectedIds(new Set()); setBulkStatus(''); };

  // ── Bulk actions ─────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Permanently delete ${count} proposal${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkWorking(true);
    try {
      for (const id of selectedIds) deleteProposal(id);
      clearSelection();
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkStatus = async () => {
    if (!bulkStatus) return;
    setBulkWorking(true);
    try {
      for (const id of selectedIds) {
        const proposal = proposals.find(p => p.id === id);
        if (proposal) updateProposal(id, { status: bulkStatus });
      }
      clearSelection();
    } finally {
      setBulkWorking(false);
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Proposals"
        subtitle={`${proposals.length} total`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowSupportWizard(true)}>
              <HeartHandshake size={16} /> New Support Proposal
            </Button>
            <Button onClick={() => setShowNew(true)}>
              <Plus size={16} /> New Proposal
            </Button>
          </div>
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
        <div className="flex items-center gap-1.5 flex-wrap">
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

      {/* Bulk action bar */}
      {canBulkEdit && someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 rounded-xl">
          {/* Count + clear */}
          <div className="flex items-center gap-2 min-w-0 mr-auto">
            <CheckSquare size={15} className="text-brand-600 dark:text-brand-400 shrink-0" />
            <span className="text-sm font-semibold text-brand-800 dark:text-brand-200">
              {selectedIds.size} selected
            </span>
            <button onClick={clearSelection} className="text-xs text-brand-600 dark:text-brand-400 underline hover:no-underline ml-1">
              Clear
            </button>
          </div>

          {/* Status change */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as ProposalStatus | '')}
                disabled={bulkWorking}
                className="appearance-none pl-3 pr-7 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">Set status…</option>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleBulkStatus}
              disabled={!bulkStatus || bulkWorking}
            >
              {bulkWorking ? <Loader2 size={13} className="animate-spin" /> : null}
              Apply
            </Button>
          </div>

          {/* Delete */}
          <button
            onClick={handleBulkDelete}
            disabled={bulkWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors"
          >
            {bulkWorking ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
              {/* Select-all checkbox — admin only */}
              {canBulkEdit && (
                <th className="w-10 pl-4 pr-1 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    title={allVisibleSelected ? 'Deselect all' : 'Select all visible'}
                    className="rounded border-gray-300 dark:border-slate-600 accent-brand-600 cursor-pointer"
                  />
                </th>
              )}
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Project</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Ref</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Owner</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide hidden lg:table-cell">Account Manager</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Value</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Modified</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-center">Clone</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canBulkEdit ? 11 : 10} className="text-center py-12 text-gray-400 dark:text-slate-500 text-sm">
                  No proposals match your filter.
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const owner    = users.find(u => u.id === p.ownerId);
              const isSupport = p.proposalType === 'support';
              const totals   = calcTotals(p, rateCards);
              const displayValue = isSupport && p.supportContract
                ? (() => {
                    const sc = p.supportContract;
                    const baseMRR  = sc.pricePerSeat * sc.seats;
                    const addonMRR = sc.addOns.reduce((s, a) => s + (a.priceType === 'per_seat' ? a.price * sc.seats : a.price), 0);
                    return baseMRR + addonMRR;
                  })()
                : totals.grandTotal;
              const valueLabel = isSupport ? '/mo' : '';
              const isSelected = selectedIds.has(p.id);

              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/proposals/${p.id}`)}
                  className={clsx(
                    'cursor-pointer group transition-colors',
                    isSelected
                      ? 'bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/50',
                  )}
                >
                  {/* Row checkbox */}
                  {canBulkEdit && (
                    <td className="pl-4 pr-1 py-3.5" onClick={e => toggleRow(p.id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {/* handled by td onClick */}}
                        className="rounded border-gray-300 dark:border-slate-600 accent-brand-600 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 dark:text-slate-100 group-hover:text-brand-600">{p.projectName}</span>
                      {isSupport && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                          <Repeat size={9} /> MRC
                        </span>
                      )}
                    </div>
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
                  <td className="px-4 py-3.5 text-gray-600 dark:text-slate-400 hidden lg:table-cell">
                    {p.accountManager || <span className="text-gray-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-900 dark:text-slate-100">
                    {fmt(displayValue, p.currency)}
                    {valueLabel && <span className="text-xs font-normal text-gray-400 dark:text-slate-500">{valueLabel}</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-400 dark:text-slate-500">
                    {new Date(p.dateModified).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
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

      {/* Selection summary footer */}
      {canBulkEdit && someSelected && (
        <div className="mt-2 flex items-center justify-between text-xs text-brand-600 dark:text-brand-400 px-1">
          <span>{selectedIds.size} of {filtered.length} visible proposal{filtered.length !== 1 ? 's' : ''} selected</span>
          <button onClick={clearSelection} className="flex items-center gap-1 hover:underline">
            <X size={11} /> Clear selection
          </button>
        </div>
      )}

      <NewProposalModal open={showNew} onClose={() => setShowNew(false)} />

      {showSupportWizard && (
        <SupportProposalWizard
          onClose={() => setShowSupportWizard(false)}
          currentUserId={currentUser?.id ?? ''}
          currentUserName={currentUser?.name ?? currentUser?.email ?? ''}
          onCreate={(p: Proposal) => {
            addProposal(p);
            setShowSupportWizard(false);
            navigate(`/proposals/${p.id}`);
          }}
        />
      )}
    </div>
  );
}
