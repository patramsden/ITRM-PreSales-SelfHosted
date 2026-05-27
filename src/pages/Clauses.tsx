import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Plus, Edit2, Trash2, BookOpen, Check, X as XIcon } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from '../components/ui/Button';
import { RichTextEditor, RichContent, htmlToPlainText } from '../components/ui/RichTextEditor';
import type { Clause } from '../types';
import clsx from 'clsx';

const COMMON_CATEGORIES = ['General', 'Assumptions', 'Exclusions', 'Terms', 'Warranties', 'GDPR & Data', 'SLA', 'Commercial'];

export function Clauses() {
  useDocumentTitle('Clauses');
  const { clauses, addClause, updateClause, deleteClause } = useStore();
  const { currentUser } = useAuth();

  const [editing, setEditing] = useState<Clause | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filterCat, setFilterCat] = useState<string>('');
  const [search, setSearch] = useState('');

  const categories = [...new Set(clauses.map(c => c.category))].sort();

  const filtered = clauses.filter(c => {
    if (filterCat && c.category !== filterCat) return false;
    if (search && !c.title.toLowerCase().includes(search.toLowerCase()) &&
        !c.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const startNew = () => {
    setEditing({
      id: uuid(), title: '', category: 'General', content: '',
      createdBy: currentUser?.name ?? 'Unknown', createdAt: new Date().toISOString(),
    });
    setIsNew(true);
  };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.content.trim()) return;
    if (isNew) addClause(editing);
    else updateClause(editing.id, editing);
    setEditing(null);
    setIsNew(false);
  };

  const handleCancel = () => { setEditing(null); setIsNew(false); };

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
            <BookOpen size={24} className="text-brand-500" />
            Clause Library
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Reusable SoW sections that can be inserted into any proposal with one click.
          </p>
        </div>
        <Button onClick={startNew}><Plus size={16} /> New Clause</Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Search clauses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Edit / New form */}
      {editing && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-brand-200 dark:border-brand-700 p-5 mb-6 space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200">{isNew ? 'New Clause' : 'Edit Clause'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">Title *</label>
              <input
                type="text"
                value={editing.title}
                onChange={e => setEditing({ ...editing, title: e.target.value })}
                placeholder="e.g. Standard Assumptions"
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">Category</label>
              <input
                list="clause-cats"
                value={editing.category}
                onChange={e => setEditing({ ...editing, category: e.target.value })}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <datalist id="clause-cats">
                {COMMON_CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">Content *</label>
            <RichTextEditor
              value={editing.content}
              onChange={v => setEditing({ ...editing, content: v })}
              placeholder="Enter the clause text that will be inserted into the Statement of Work…"
              minHeight="12rem"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleCancel}><XIcon size={14} /> Cancel</Button>
            <Button onClick={handleSave} disabled={!editing.title.trim() || !editing.content.trim()}>
              <Check size={14} /> {isNew ? 'Add Clause' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {/* Clause list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500">
          <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
          {clauses.length === 0
            ? <p className="text-sm">No clauses yet. Add your first reusable clause with the button above.</p>
            : <p className="text-sm">No clauses match your filter.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 flex items-start gap-4 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{c.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">{c.category}</span>
                </div>
                <div className="max-h-20 overflow-hidden">
                  <RichContent html={c.content} className="text-xs text-gray-500 dark:text-slate-400 line-clamp-3" />
                </div>
                {htmlToPlainText(c.content).length > 200 && (
                  <span className="text-xs text-gray-400 dark:text-slate-500 italic">…truncated</span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => { setEditing({ ...c }); setIsNew(false); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                  title="Edit">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => deleteClause(c.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
