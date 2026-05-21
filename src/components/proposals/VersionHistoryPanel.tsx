import { useState, useEffect } from 'react';
import { X, RotateCcw, Loader2, GitCompare } from 'lucide-react';
import clsx from 'clsx';
import { versionApi } from '../../lib/api';
import { useStore } from '../../store';
import type { Proposal } from '../../types';

interface VersionMeta {
  id: string;
  proposalId: string;
  savedBy: string;
  savedAt: string;
}

interface Props {
  proposal: Proposal;
  onClose: () => void;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`;

function ComparePanel({
  current,
  snapshot,
  onClose,
}: {
  current: Proposal;
  snapshot: Proposal;
  onClose: () => void;
}) {
  const currentTotal = snapshot
    ? (() => {
        let s = 0;
        snapshot.parts.forEach(p => s += p.unitPrice * p.quantity);
        snapshot.phases.forEach(ph => ph.tasks.forEach(t => s += t.days * t.dayRate * (t.rateMultiplier ?? 1)));
        return s;
      })()
    : 0;

  const calcGrandTotal = (p: Proposal) => {
    let parts = 0;
    p.parts.forEach(pt => parts += pt.unitPrice * pt.quantity);
    let consult = 0;
    p.phases.forEach(ph => ph.tasks.forEach(t => consult += t.days * t.dayRate * (t.rateMultiplier ?? 1)));
    const markup = parts * (p.markupPct / 100);
    const pm = consult * 0.2;
    return parts + markup + consult + pm;
  };

  const currentGrand = calcGrandTotal(current);
  const snapshotGrand = calcGrandTotal(snapshot);

  const Row = ({ label, curr, snap }: { label: string; curr: string | number; snap: string | number }) => {
    const diff = String(curr) !== String(snap);
    return (
      <tr>
        <td className="py-1.5 pr-3 text-xs text-gray-500 dark:text-slate-400 font-medium">{label}</td>
        <td className={clsx('py-1.5 pr-3 text-xs', diff ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-800 dark:text-slate-200')}>{curr}</td>
        <td className={clsx('py-1.5 text-xs', diff ? 'text-gray-400 dark:text-slate-500 line-through' : 'text-gray-800 dark:text-slate-200')}>{snap}</td>
      </tr>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Compare Versions</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-6">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-gray-400 pb-2 pr-3 uppercase tracking-wide">Field</th>
                <th className="text-left text-xs font-semibold text-brand-600 pb-2 pr-3 uppercase tracking-wide">Current</th>
                <th className="text-left text-xs font-semibold text-gray-400 pb-2 uppercase tracking-wide">This version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
              <Row label="Project name" curr={current.projectName} snap={snapshot.projectName} />
              <Row label="Client" curr={current.client} snap={snapshot.client} />
              <Row label="Status" curr={current.status} snap={snapshot.status} />
              <Row label="Account Manager" curr={current.accountManager} snap={snapshot.accountManager} />
              <Row label="Parts count" curr={current.parts.length} snap={snapshot.parts.length} />
              <Row label="Phases count" curr={current.phases.length} snap={snapshot.phases.length} />
              <Row label="Tasks count" curr={current.phases.reduce((s, ph) => s + ph.tasks.length, 0)} snap={snapshot.phases.reduce((s, ph) => s + ph.tasks.length, 0)} />
              <Row label="Grand total" curr={fmt(currentGrand)} snap={fmt(snapshotGrand)} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function VersionHistoryPanel({ proposal, onClose }: Props) {
  const { updateProposal } = useStore();
  const [versions, setVersions]         = useState<VersionMeta[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [restoring, setRestoring]       = useState<string | null>(null);
  const [confirmId, setConfirmId]       = useState<string | null>(null);
  const [toast, setToast]               = useState<string | null>(null);

  // Compare state
  const [compareId, setCompareId]             = useState<string | null>(null);
  const [compareSnapshot, setCompareSnapshot] = useState<Proposal | null>(null);
  const [compareLoading, setCompareLoading]   = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    versionApi.list(proposal.id)
      .then(v => { if (mounted) setVersions(v); })
      .catch(e => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load versions'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [proposal.id]);

  const handleRestore = async (vid: string) => {
    setRestoring(vid);
    try {
      const restored = await versionApi.restore(proposal.id, vid);
      updateProposal(proposal.id, restored);
      setToast('Proposal restored to this version');
      setConfirmId(null);
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(null);
    }
  };

  const handleCompare = async (vid: string) => {
    setCompareId(vid);
    setCompareLoading(true);
    try {
      const snap = await versionApi.get(proposal.id, vid);
      setCompareSnapshot(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version for comparison');
      setCompareId(null);
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <>
      <div className="fixed right-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 flex flex-col z-30 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Version History</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="mx-3 mt-3 px-3 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-xs text-green-700 dark:text-green-300">
            {toast}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-brand-500" />
            </div>
          )}
          {error && (
            <div className="mx-3 mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {!loading && !error && versions.length === 0 && (
            <div className="text-center text-xs text-gray-400 dark:text-slate-500 py-12 px-4">
              No saved versions yet. Versions are created automatically when the proposal is updated.
            </div>
          )}
          {!loading && versions.map(v => (
            <div
              key={v.id}
              className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"
            >
              <div className="text-xs text-gray-700 dark:text-slate-200 font-medium">{fmtDate(v.savedAt)}</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Saved by {v.savedBy}</div>

              {confirmId === v.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-slate-300 flex-1">Restore this version?</span>
                  <button
                    onClick={() => handleRestore(v.id)}
                    disabled={restoring === v.id}
                    className="px-2 py-1 text-xs bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50"
                  >
                    {restoring === v.id ? <Loader2 size={11} className="animate-spin" /> : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-slate-200 rounded hover:bg-gray-200 dark:hover:bg-slate-500"
                  >
                    No
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => setConfirmId(v.id)}
                    className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                  <button
                    onClick={() => handleCompare(v.id)}
                    disabled={compareLoading && compareId === v.id}
                    className={clsx(
                      'flex items-center gap-1 text-xs hover:underline',
                      compareLoading && compareId === v.id
                        ? 'text-gray-400 dark:text-slate-500'
                        : 'text-indigo-500 dark:text-indigo-400'
                    )}
                  >
                    {compareLoading && compareId === v.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : <GitCompare size={11} />
                    }
                    Compare
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {compareSnapshot && (
        <ComparePanel
          current={proposal}
          snapshot={compareSnapshot}
          onClose={() => { setCompareSnapshot(null); setCompareId(null); }}
        />
      )}
    </>
  );
}
