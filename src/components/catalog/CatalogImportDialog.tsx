import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import Papa from 'papaparse';
import { Upload, CheckCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { catalogImportApi, catalogApi } from '../../lib/api';
import { useStore } from '../../store';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { CatalogItem } from '../../types';

type Stage = 'upload' | 'preview' | 'result';

interface ParsedRow { [key: string]: string }

const FIELD_KEYS = ['sku', 'description', 'category', 'defaultVendor', 'listPrice'] as const;
type FieldKey = typeof FIELD_KEYS[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  sku:           'SKU',
  description:   'Description',
  category:      'Category',
  defaultVendor: 'Default Vendor',
  listPrice:     'List Price',
};

function fuzzyMatch(header: string): FieldKey | '' {
  const h = header.toLowerCase();
  if (h.includes('sku') || h.includes('part no') || h.includes('part_no')) return 'sku';
  if (h.includes('desc')) return 'description';
  if (h.includes('cat')) return 'category';
  if (h.includes('vendor') || h.includes('supplier') || h.includes('manufacturer')) return 'defaultVendor';
  if (h.includes('price') || h.includes('cost') || h.includes('list')) return 'listPrice';
  return '';
}

interface Props {
  onComplete: () => void;
}

export function CatalogImportDialog({ onComplete }: Props) {
  const { initFromApi } = useStore();
  const [open, setOpen]           = useState(false);
  const [stage, setStage]         = useState<Stage>('upload');
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [headers, setHeaders]     = useState<string[]>([]);
  const [mapping, setMapping]     = useState<Record<FieldKey, string>>({
    sku: '', description: '', category: '', defaultVendor: '', listPrice: '',
  });
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
        // Auto-detect mapping
        const autoMap: Record<FieldKey, string> = { sku: '', description: '', category: '', defaultVendor: '', listPrice: '' };
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
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const items: Omit<CatalogItem, 'id'>[] = rows.map(row => ({
        sku:           mapping.sku ? (row[mapping.sku] ?? '') : '',
        description:   mapping.description ? (row[mapping.description] ?? '') : '',
        category:      mapping.category ? (row[mapping.category] ?? '') : '',
        defaultVendor: mapping.defaultVendor ? (row[mapping.defaultVendor] ?? '') : '',
        listPrice:     mapping.listPrice ? (parseFloat(row[mapping.listPrice] ?? '0') || 0) : 0,
      })).filter(i => i.description.trim());

      const result = await catalogImportApi.import(items);
      setImported(result.imported);
      setStage('result');

      // Refresh catalog in store
      const freshCatalog = await catalogApi.list();
      const store = useStore.getState();
      store.initFromApi({
        proposals: store.proposals,
        users: store.users,
        templates: store.templates,
        catalog: freshCatalog,
        rateCards: store.rateCards,
        lookups: store.lookups,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setStage('upload');
    setRows([]);
    setHeaders([]);
    setError(null);
    if (stage === 'result') onComplete();
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={15} /> Import CSV
      </Button>

      {open && (
        <Modal open onClose={handleClose} title="Import Catalog from CSV">
          {/* Upload stage */}
          {stage === 'upload' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
                  dragOver
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-gray-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-500',
                )}
              >
                <Upload size={28} className="mx-auto mb-3 text-gray-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Drag & drop a CSV file here</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">or click to browse</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-brand-700 transition-colors">
                  <Upload size={14} /> Choose CSV file
                  <input type="file" accept=".csv" className="sr-only" onChange={handleInputChange} />
                </label>
              </div>
            </div>
          )}

          {/* Preview stage */}
          {stage === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {FIELD_KEYS.map(fk => (
                  <div key={fk}>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">
                      {FIELD_LABELS[fk]}{fk === 'description' ? ' *' : ''}
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
                <div className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">
                  Preview (first 10 rows of {rows.length} total)
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-slate-700/40">
                        {FIELD_KEYS.filter(k => mapping[k]).map(k => (
                          <th key={k} className="px-3 py-2 text-left text-gray-500 dark:text-slate-400 font-medium">{FIELD_LABELS[k]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                          {FIELD_KEYS.filter(k => mapping[k]).map(k => (
                            <td key={k} className="px-3 py-1.5 text-gray-700 dark:text-slate-300 truncate max-w-[150px]">
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
                <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <Button variant="secondary" onClick={() => setStage('upload')}>Back</Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || !mapping.description}
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : null}
                  {importing ? 'Importing…' : `Import ${rows.length} items`}
                </Button>
              </div>
            </div>
          )}

          {/* Result stage */}
          {stage === 'result' && (
            <div className="text-center py-8">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
              <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">Import complete</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{imported} items imported successfully</p>
              <div className="mt-6">
                <Button onClick={handleClose}>Done</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
