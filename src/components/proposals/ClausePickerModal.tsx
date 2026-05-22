import { useState } from 'react';
import { Search, BookOpen, X } from 'lucide-react';
import type { Clause } from '../../types';
import { useStore } from '../../store';
import clsx from 'clsx';

interface Props {
  onInsert: (content: string) => void;
  onClose: () => void;
}

export function ClausePickerModal({ onInsert, onClose }: Props) {
  const clauses = useStore(s => s.clauses);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Clause | null>(null);

  const categories = [...new Set(clauses.map(c => c.category))].sort();

  const filtered = query.trim()
    ? clauses.filter(c =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.content.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
      )
    : clauses;

  const grouped: Record<string, Clause[]> = {};
  for (const c of filtered) {
    (grouped[c.category] ??= []).push(c);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <BookOpen size={18} className="text-brand-500" />
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 flex-1">Clause Library</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clauses…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: clause list */}
          <div className="w-64 border-r border-gray-100 dark:border-slate-700 overflow-y-auto flex-shrink-0">
            {clauses.length === 0 ? (
              <div className="p-6 text-sm text-gray-400 dark:text-slate-500 text-center">
                No clauses yet.<br />Add some in Settings → Clauses.
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-gray-400 dark:text-slate-500 text-center">No results.</div>
            ) : (
              categories.map(cat => {
                const items = grouped[cat];
                if (!items?.length) return null;
                return (
                  <div key={cat}>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide bg-gray-50 dark:bg-slate-700/50">
                      {cat}
                    </div>
                    {items.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className={clsx(
                          'w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 dark:border-slate-700 transition-colors',
                          selected?.id === c.id
                            ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-medium'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-700/30 text-gray-700 dark:text-slate-300',
                        )}
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Right: preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
                  <div className="text-sm font-bold text-gray-900 dark:text-slate-100">{selected.title}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{selected.category}</div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <pre className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {selected.content}
                  </pre>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-2">
                  <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">
                    Cancel
                  </button>
                  <button
                    onClick={() => { onInsert(selected.content); onClose(); }}
                    className="px-4 py-2 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium"
                  >
                    Insert Clause
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400 dark:text-slate-500">
                Select a clause to preview it
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
