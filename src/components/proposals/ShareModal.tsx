import { useState, useEffect } from 'react';
import { Copy, Trash2, Loader2, Check, Link } from 'lucide-react';
import { shareApi } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import clsx from 'clsx';

interface ShareRecord {
  token: string;
  createdAt: string;
  expiresAt?: string;
}

interface Props {
  proposalId: string;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: 'No expiry', value: '' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function ShareModal({ proposalId, onClose }: Props) {
  const [shares, setShares]         = useState<ShareRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [creating, setCreating]     = useState(false);
  const [deletingToken, setDeleting] = useState<string | null>(null);
  const [expiry, setExpiry]         = useState('');
  const [copiedToken, setCopied]    = useState<string | null>(null);
  const [toast, setToast]           = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadShares = () => {
    setLoading(true);
    shareApi.list(proposalId)
      .then(setShares)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load links'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadShares(); }, [proposalId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      let expiresAt: string | undefined;
      if (expiry === '7d') expiresAt = addDays(7);
      else if (expiry === '30d') expiresAt = addDays(30);
      await shareApi.create(proposalId, expiresAt);
      showToast('Share link created');
      loadShares();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      showToast('Link copied to clipboard');
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleDelete = async (token: string) => {
    setDeleting(token);
    try {
      await shareApi.delete(token);
      setShares(s => s.filter(x => x.token !== token));
      showToast('Share link deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete link');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Share Proposal">
      {/* Toast */}
      {toast && (
        <div className="mb-4 px-3 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
          <Check size={14} /> {toast}
        </div>
      )}
      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create link */}
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Generate new share link</div>
        <div className="flex items-center gap-3">
          <select
            value={expiry}
            onChange={e => setExpiry(e.target.value)}
            className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {EXPIRY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
            Generate link
          </Button>
        </div>
      </div>

      {/* Existing links */}
      <div className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Existing links</div>
      {loading && (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-400 dark:text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      )}
      {!loading && shares.length === 0 && (
        <div className="text-sm text-gray-400 dark:text-slate-500 py-4">No share links yet.</div>
      )}
      {!loading && shares.map(s => (
        <div key={s.token} className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-slate-700">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono text-gray-500 dark:text-slate-400 truncate">
              {`${window.location.origin}/share/${s.token}`}
            </div>
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Created {fmtDate(s.createdAt)}
              {s.expiresAt && ` · Expires ${fmtDate(s.expiresAt)}`}
            </div>
          </div>
          <button
            onClick={() => handleCopy(s.token)}
            className={clsx(
              'p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors',
              copiedToken === s.token ? 'text-green-500' : 'text-gray-400 dark:text-slate-400',
            )}
            title="Copy link"
          >
            {copiedToken === s.token ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => handleDelete(s.token)}
            disabled={deletingToken === s.token}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
            title="Delete link"
          >
            {deletingToken === s.token ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      ))}

      <div className="flex justify-end mt-6">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
