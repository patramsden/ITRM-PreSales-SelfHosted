import { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function LookupEditor({ values, onChange, placeholder = 'Add value…', readOnly = false }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.some(x => x.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, v].sort((a, b) => a.localeCompare(b)));
    setDraft('');
    inputRef.current?.focus();
  };

  const remove = (v: string) => onChange(values.filter(x => x !== v));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[2rem]">
        {values.length === 0 && (
          <span className="text-xs text-gray-400 dark:text-slate-500 self-center">No values configured.</span>
        )}
        {values.map(v => (
          <span
            key={v}
            className={clsx(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border',
              readOnly
                ? 'bg-gray-100 border-gray-200 text-gray-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                : 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/20 dark:border-brand-700 dark:text-brand-300'
            )}
          >
            {v}
            {!readOnly && (
              <button
                onClick={() => remove(v)}
                className="hover:text-red-500 transition-colors ml-0.5 rounded-full"
                title={`Remove "${v}"`}
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>

      {!readOnly && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder={placeholder}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <button
            onClick={add}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      )}
    </div>
  );
}
