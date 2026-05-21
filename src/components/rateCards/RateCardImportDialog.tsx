import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, CheckCircle, Loader2, Download } from 'lucide-react';
import clsx from 'clsx';
import { rateCardApi } from '../../lib/api';
import { useStore } from '../../store';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { RateCard } from '../../types';

type Stage = 'upload' | 'preview' | 'result';
interface ParsedRow { [key: string]: string }

const FIELD_KEYS = ['role', 'costRate', 'sellRate', 'currency', 'effectiveFrom', 'effectiveTo', 'overtimeEnabled'] as const;
type FieldKey = typeof FIELD_KEYS[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  role:            'Role',
  costRate:        'Cost Rate (Day)',
  sellRate:        'Sell Rate (Day)',
  currency:        'Currency',
  effectiveFrom:   'Effective From',
  effectiveTo:     'Effective To',
  overtimeEnabled: 'Overtime Enabled',
};

function fuzzyMatch(header: string): FieldKey | '' {
  const h = header.toLowerCase();
  if (h.includes('role') || h.includes('title') || h.includes('position')) return 'role';
  if (h.includes('cost') && (h.includes('rate') || h.includes('day'))) return 'costRate';
  if ((h.includes('sell') || h.includes('charge') || h.includes('bill')) && (h.includes('rate') || h.includes('day'))) return 'sellRate';
  if (h.includes('cost') && !h.includes('sell')) return 'costRate';
  if (h.includes('sell') || h.includes('rate')) return 'sellRate';
  if (h.includes('curr')) return 'currency';
  if (h.includes('from') || h.includes('start')) return 'effectiveFrom';
  if (h.includes('to') || h.includes('end') || h.includes('expir')) return 'effectiveTo';
  if (h.includes('overtime') || h.includes('ot ')) return 'overtimeEnabled';
  return '';
}

// ─── Example CSV ──────────────────────────────────────────────────────────────

const EXAMPLE_ROWS = [
  ['Role', 'Cost Rate (Day)', 'Sell Rate (Day)', 'Currency', 'Effective From', 'Effective To', 'Overtime Enabled'],
  ['Cloud Architect',         '980',  '1400', 'GBP', '2026-01-01', '', 'false'],
  ['Network Architect',       '840',  '1200', 'GBP', '2026-01-01', '', 'false'],
  ['Senior Network Engineer', '665',  '950',  'GBP', '2026-01-01', '', 'true'],
  ['Network Engineer',        '525',  '750',  'GBP', '2026-01-01', '', 'true'],
  ['Security Consultant',     '910',  '1300', 'GBP', '2026-01-01', '', 'false'],
  ['Project Manager',         '700',  '1000', 'GBP', '2026-01-01', '', 'false'],
];

function downloadExampleCsv() {
  const csv  = EXAMPLE_ROWS.map(row =>
    row.map(c => /[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'rate-cards-import-example.csv'; a.click();
  URL.revokeObjectURL(url);
}

interface Props { onComplete: () => void }

export function RateCardImportDialog({ onComplete }: Props) {
  const { rateCards, initFromApi } = useStore();
  const [open, setOpen]           = useState(false);
  const [stage, setStage]         = useState<Stage>('upload');
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [headers, setHeaders]     = useState<string[]>([]);
  const [mapping, setMapping]     = useState<Record<FieldKey, string>>(
    () => Object.fromEntries(FIELD_KEYS.map(k => [k, ''])) as Record<FieldKey, string>
  );
  const [importing, setImporting] = useState(false);
  const [imported, setImported]   = useState(0);
  const [error, setError]         = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState(false);

  const handleFile = useCallback((file: File) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const hdrs = results.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(results.data);
        const autoMap = Object.fromEntries(FIELD_KEYS.map(k => [k, ''])) as Record<FieldKey, string>;
        for (const hdr of hdrs) {
          const k = fuzzyMatch(hdr);
          if (k && !autoMap[k]) autoMap[k] = hdr;
        }
        setMapping(autoMap);
        setStage('preview');
      },
    });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setImporting(true); setError(null);
    try {
      const cards: Partial<RateCard>[] = rows.map(row => ({
        role:            mapping.role           ? (row[mapping.role] ?? '').trim() : '',
        costRate:        mapping.costRate        ? (parseFloat(row[mapping.costRate] ?? '0') || 0) : 0,
        sellRate:        mapping.sellRate        ? (parseFloat(row[mapping.sellRate] ?? '0') || 0) : 0,
        currency:        mapping.currency        ? ((row[mapping.currency] ?? 'GBP').trim() as RateCard['currency']) : 'GBP',
        effectiveFrom:   mapping.effectiveFrom   ? (row[mapping.effectiveFrom] ?? '').trim() || new Date().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        effectiveTo:     mapping.effectiveTo     ? (row[mapping.effectiveTo] ?? '').trim() || undefined : undefined,
        overtimeEnabled: mapping.overtimeEnabled ? (row[mapping.overtimeEnabled] ?? '').toLowerCase() === 'true' : false,
      })).filter(c => c.role?.trim());

      const result = await rateCardApi.import(cards);
      setImported(result.imported);
      setStage('result');

      // Refresh store
      const fresh = await rateCardApi.list();
      const s = useStore.getState();
      s.initFromApi({ proposals: s.proposals, users: s.users, templates: s.templates, catalog: s.catalog, rateCards: fresh, lookups: s.lookups });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false); setStage('upload'); setRows([]); setHeaders([]); setError(null);
    if (stage === 'result') onComplete();
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={15} /> Import CSV
      </Button>

      {open && (
        <Modal open onClose={handleClose} title="Import Rate Cards from CSV">
          {stage === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-10 text-center transition-colors',
                  dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                           : 'border-gray-300 dark:border-slate-600 hover:border-brand-400',
                )}
              >
                <Upload size={28} className="mx-auto mb-3 text-gray-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Drag & drop a CSV file here</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">or click to browse</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-brand-700 transition-colors">
                  <Upload size={14} /> Choose CSV file
                  <input type="file" accept=".csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </label>
              </div>

              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700/40 rounded-xl border border-gray-200 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Not sure of the format?</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    Download an example CSV with the correct columns and sample data.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadExampleCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors shrink-0 ml-4"
                >
                  <Download size={14} /> Example CSV
                </button>
              </div>
            </div>
          )}

          {stage === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {FIELD_KEYS.map(fk => (
                  <div key={fk}>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">
                      {FIELD_LABELS[fk]}{fk === 'role' ? ' *' : ''}
                    </label>
                    <select
                      value={mapping[fk]}
                      onChange={e => setMapping(m => ({ ...m, [fk]: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">— skip —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">
                  Preview (first 10 rows of {rows.length} total) · Existing roles will be updated, new roles will be created.
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-slate-700/40">
                        {FIELD_KEYS.filter(k => mapping[k]).map(k => (
                          <th key={k} className="px-3 py-2 text-left text-gray-500 dark:text-slate-400 font-medium whitespace-nowrap">{FIELD_LABELS[k]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                          {FIELD_KEYS.filter(k => mapping[k]).map(k => (
                            <td key={k} className="px-3 py-1.5 text-gray-700 dark:text-slate-300 truncate max-w-[120px]">
                              {row[mapping[k]] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded text-sm text-red-600 dark:text-red-400">{error}</div>
              )}

              <div className="flex justify-between items-center pt-2">
                <Button variant="secondary" onClick={() => setStage('upload')}>Back</Button>
                <Button onClick={handleImport} disabled={importing || !mapping.role}>
                  {importing ? <Loader2 size={14} className="animate-spin" /> : null}
                  {importing ? 'Importing…' : `Import ${rows.length} rate cards`}
                </Button>
              </div>
            </div>
          )}

          {stage === 'result' && (
            <div className="text-center py-8">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
              <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">Import complete</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{imported} rate cards imported successfully</p>
              <div className="mt-6"><Button onClick={handleClose}>Done</Button></div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
