import { useState, useEffect } from 'react';
import { X, RotateCcw, Loader2 } from 'lucide-react';
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

export function VersionHistoryPanel({ proposal, onClose }: Props) {
  const { updateProposal } = useStore();
  const [versions, setVersions]         = useState<VersionMeta[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [restoring, setRestoring]       = useState<string | null>(null);
  const [confirmId, setConfirmId]       = useState<string | null>(null);
  const [toast, setToast]               = useState<string | null>(null);

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

  return (
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
              <button
                onClick={() => setConfirmId(v.id)}
                className={clsx(
                  'mt-2 flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline',
                )}
              >
                <RotateCcw size={11} /> Restore
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
