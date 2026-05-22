import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, MessageSquare, Loader2 } from 'lucide-react';
import type { User } from '../../types';
import type { ProposalComment } from '../../types';
import { commentApi } from '../../lib/api';
import clsx from 'clsx';

interface Props {
  proposalId: string;
  currentUser: User;
  editable: boolean;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

export function CommentsThread({ proposalId, currentUser, editable }: Props) {
  const [comments, setComments] = useState<ProposalComment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [posting, setPosting]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    commentApi.list(proposalId)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [proposalId]);

  // Scroll to bottom on new comment
  useEffect(() => {
    if (comments.length) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handlePost = async () => {
    if (!text.trim()) return;
    setPosting(true); setError(null);
    try {
      const c = await commentApi.create(proposalId, { content: text.trim() });
      setComments(prev => [...prev, c]);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally { setPosting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await commentApi.delete(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch { /* silent */ }
  };

  const canDelete = (c: ProposalComment) =>
    c.authorId === currentUser.id || currentUser.appRole === 'admin';

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <MessageSquare size={18} className="text-brand-500" />
          <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Internal Comments</div>
          <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Comment list */}
        <div className="divide-y divide-gray-50 dark:divide-slate-700 max-h-[480px] overflow-y-auto">
          {loading && (
            <div className="py-10 flex justify-center">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          )}
          {!loading && comments.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">
              No comments yet. Be the first to add one.
            </div>
          )}
          {!loading && comments.map(c => (
            <div key={c.id} className="px-6 py-4 flex items-start gap-3 group hover:bg-gray-50 dark:hover:bg-slate-700/30">
              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initials(c.authorName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{c.authorName}</span>
                  <span className="text-xs text-gray-400 dark:text-slate-500">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{c.content}</p>
              </div>
              {canDelete(c) && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"
                  title="Delete comment"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Compose box */}
        {editable && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700">
            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                {initials(currentUser.name)}
              </div>
              <div className="flex-1 flex gap-2">
                <textarea
                  rows={2}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handlePost();
                    }
                  }}
                  placeholder="Add a comment… (⌘+Enter to post)"
                  disabled={posting}
                  className={clsx(
                    'flex-1 border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500',
                    'border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100',
                  )}
                />
                <button
                  onClick={handlePost}
                  disabled={posting || !text.trim()}
                  className="self-end px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 transition-colors flex-shrink-0"
                  title="Post comment"
                >
                  {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
