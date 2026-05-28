import { useState, useEffect, useCallback } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/ui/PageHeader';
import { logsApi } from '../lib/api';
import type { LogEntry } from '../lib/api';
import { AlertCircle, AlertTriangle, Info, RefreshCw, Trash2, Search, ChevronDown, ChevronRight, Loader2, Download } from 'lucide-react';
import clsx from 'clsx';

const LEVELS    = ['info', 'warn', 'error'] as const;
const CATEGORIES = ['auth', 'proposal', 'crm', 'api', 'system', 'user'] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

function LevelBadge({ level }: { level: LogEntry['level'] }) {
  const cfg = {
    info:  { icon: Info,          cls: 'bg-blue-100  dark:bg-blue-900/40  text-blue-700  dark:text-blue-300'  },
    warn:  { icon: AlertTriangle, cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
    error: { icon: AlertCircle,   cls: 'bg-red-100   dark:bg-red-900/40   text-red-700   dark:text-red-300'   },
  }[level];
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide', cfg.cls)}>
      <Icon size={10} /> {level}
    </span>
  );
}

function CategoryChip({ cat }: { cat: string }) {
  const colors: Record<string, string> = {
    auth:     'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    proposal: 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300',
    crm:      'bg-teal-100  dark:bg-teal-900/40  text-teal-700  dark:text-teal-300',
    api:      'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    system:   'bg-gray-100  dark:bg-slate-700    text-gray-600  dark:text-slate-300',
    user:     'bg-pink-100  dark:bg-pink-900/40  text-pink-700  dark:text-pink-300',
  };
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium', colors[cat] ?? 'bg-gray-100 text-gray-600')}>
      {cat}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Logs() {
  useDocumentTitle('System Logs');

  const [logs,       setLogs]       = useState<LogEntry[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [clearing,   setClearing]   = useState(false);

  // Filters
  const [levelFilter,    setLevelFilter]    = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search,         setSearch]         = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await logsApi.list({
        level:    levelFilter    || undefined,
        category: categoryFilter || undefined,
        search:   search.trim() || undefined,
        limit:    500,
      });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [levelFilter, categoryFilter, search]);

  // Load on filter change
  useEffect(() => { load(); }, [load]);

  const handleClear = async () => {
    if (!window.confirm('Clear all log entries? This cannot be undone.')) return;
    setClearing(true);
    try {
      await logsApi.clear();
      setLogs([]); setTotal(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear logs');
    } finally {
      setClearing(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const rows = [
      ['Time', 'Level', 'Category', 'Message', 'User', 'Details'],
      ...logs.map(l => [
        l.createdAt, l.level, l.category,
        `"${l.message.replace(/"/g, '""')}"`,
        l.userName ?? '',
        l.details ? `"${l.details.replace(/"/g, '""')}"` : '',
      ]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const countByLevel = (lvl: string) => logs.filter(l => l.level === lvl).length;

  return (
    <div className="p-8">
      <PageHeader
        title="System Logs"
        subtitle={`${total.toLocaleString()} total entries — showing ${logs.length}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={logs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors">
              <Download size={13} /> Export CSV
            </button>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
            <button onClick={handleClear} disabled={clearing || logs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors">
              {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Clear logs
            </button>
          </div>
        }
      />

      {/* Summary chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {LEVELS.map(lvl => (
          <div key={lvl} className="text-xs text-gray-500 dark:text-slate-400">
            <LevelBadge level={lvl} />
            <span className="ml-1 font-semibold text-gray-700 dark:text-slate-300">{countByLevel(lvl)}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search messages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-1">
          {['', ...LEVELS].map(lvl => (
            <button key={lvl} onClick={() => setLevelFilter(lvl)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-medium transition-colors', levelFilter === lvl
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              )}>
              {lvl || 'All levels'}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {['', ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-medium transition-colors', categoryFilter === cat
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              )}>
              {cat || 'All categories'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Log table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="py-16 flex justify-center">
            <Loader2 size={22} className="animate-spin text-gray-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 dark:text-slate-500">
            No log entries found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
                <th className="w-6 px-3 py-2" />
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Time</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Level</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Category</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Message</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide hidden xl:table-cell">User</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(entry => {
                const isOpen  = expanded.has(entry.id);
                const hasDetails = !!entry.details;
                return [
                  <tr key={entry.id}
                    onClick={() => hasDetails && toggleExpand(entry.id)}
                    className={clsx(
                      'border-b border-gray-50 dark:border-slate-700/50 transition-colors',
                      hasDetails ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/40' : '',
                      entry.level === 'error' && 'bg-red-50/40 dark:bg-red-900/10',
                      entry.level === 'warn'  && 'bg-amber-50/30 dark:bg-amber-900/10',
                    )}
                  >
                    <td className="px-3 py-2.5 text-gray-300 dark:text-slate-600">
                      {hasDetails
                        ? (isOpen ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />)
                        : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap font-mono">
                      {fmtTime(entry.createdAt)}
                    </td>
                    <td className="px-3 py-2.5"><LevelBadge level={entry.level} /></td>
                    <td className="px-3 py-2.5"><CategoryChip cat={entry.category} /></td>
                    <td className="px-3 py-2.5 text-gray-800 dark:text-slate-200 max-w-lg">
                      <span className="line-clamp-2">{entry.message}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-slate-400 hidden xl:table-cell">
                      {entry.userName ?? <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>
                  </tr>,
                  isOpen && hasDetails && (
                    <tr key={`${entry.id}-detail`} className="bg-gray-50 dark:bg-slate-900/40 border-b border-gray-100 dark:border-slate-700/50">
                      <td colSpan={6} className="px-6 py-3">
                        <pre className="text-xs font-mono text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                          {(() => {
                            try { return JSON.stringify(JSON.parse(entry.details!), null, 2); }
                            catch { return entry.details; }
                          })()}
                        </pre>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {logs.length > 0 && (
        <p className="mt-2 text-xs text-gray-400 dark:text-slate-500 text-right">
          Showing {logs.length} of {total.toLocaleString()} entries. Logs older than 90 days are automatically removed.
        </p>
      )}
    </div>
  );
}
