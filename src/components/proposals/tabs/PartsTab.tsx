import { useState, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Package, Search, Paperclip, Download, X as XIcon, ShoppingCart, Link2 } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { Proposal, Part, VendorQuote, PartType, CatalogItem } from '../../../types';
import { useStore } from '../../../store';
import { Button } from '../../ui/Button';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

// ─── Section config ────────────────────────────────────────────────────────────

const PART_TYPE_ORDER: PartType[] = ['Hardware', 'Software', 'Monthly', 'Annual'];

const TYPE_CONFIG: Record<PartType, {
  label: string;
  cadence: string | null;
  cadenceSuffix: string | null;
  headerCls: string;
  badgeCls: string;
  accentText: string;
}> = {
  Hardware: {
    label: 'Hardware',
    cadence: null,
    cadenceSuffix: null,
    headerCls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    badgeCls:  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    accentText: 'text-blue-700 dark:text-blue-300',
  },
  Software: {
    label: 'Software',
    cadence: null,
    cadenceSuffix: null,
    headerCls: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    badgeCls:  'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    accentText: 'text-orange-700 dark:text-orange-300',
  },
  Monthly: {
    label: 'Monthly Subscriptions',
    cadence: 'Billed monthly',
    cadenceSuffix: '/mo',
    headerCls: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    badgeCls:  'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    accentText: 'text-purple-700 dark:text-purple-300',
  },
  Annual: {
    label: 'Annual Subscriptions',
    cadence: 'Billed annually',
    cadenceSuffix: '/yr',
    headerCls: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    badgeCls:  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    accentText: 'text-green-700 dark:text-green-300',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

function upliftPct(unitCost: number, unitPrice: number): number | null {
  if (unitCost === 0) return null;
  return ((unitPrice - unitCost) / unitCost) * 100;
}

// ─── Column header ─────────────────────────────────────────────────────────────

function ColHeader({ cadenceSuffix }: { cadenceSuffix: string | null }) {
  return (
    <div className="px-5 py-2.5 bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
      <div className="col-span-3">Description</div>
      <div className="col-span-1 text-center">SKU</div>
      <div className="col-span-1 text-center">Qty</div>
      <div className="col-span-2 text-right">Unit Cost{cadenceSuffix && <span className="normal-case font-normal ml-0.5">{cadenceSuffix}</span>}</div>
      <div className="col-span-1 text-right">Uplift %</div>
      <div className="col-span-2 text-right">Unit Price{cadenceSuffix && <span className="normal-case font-normal ml-0.5">{cadenceSuffix}</span>}</div>
      <div className="col-span-1 text-right">Line Total</div>
      <div className="col-span-1" />
    </div>
  );
}

// ─── Individual part row ───────────────────────────────────────────────────────

const MAX_ATTACH_BYTES = 10 * 1024 * 1024; // 10 MB

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface PartRowProps {
  part: Part;
  editable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<Part>) => void;
  onDelete: () => void;
  onAddQuote: () => void;
  onUpdateQuote: (qId: string, u: Partial<VendorQuote>) => void;
  onSelectQuote: (qId: string) => void;
  onDeleteQuote: (qId: string) => void;
}

// ─── Quote row with attachment support ────────────────────────────────────────

function QuoteRow({ partId, quote: q, editable, onSelect, onUpdate, onDelete }: {
  partId: string;
  quote: VendorQuote;
  editable: boolean;
  onSelect: () => void;
  onUpdate: (u: Partial<VendorQuote>) => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACH_BYTES) {
      setSizeError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is 10 MB.`);
      e.target.value = '';
      return;
    }
    setSizeError(null);
    setUploading(true);
    try {
      const data = await readFileAsBase64(file);
      onUpdate({ attachmentData: data, attachmentName: file.name, attachmentMime: file.type });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = () => {
    if (!q.attachmentData || !q.attachmentName) return;
    const mime   = q.attachmentMime ?? 'application/octet-stream';
    const bytes  = atob(q.attachmentData);
    const arr    = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const url    = URL.createObjectURL(new Blob([arr], { type: mime }));
    const a      = document.createElement('a');
    a.href = url; a.download = q.attachmentName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls = 'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100 dark:disabled:bg-slate-600';

  return (
    <div className="mb-3 last:mb-0">
      <div className="grid grid-cols-12 gap-2 items-center">
        {/* Select radio */}
        <div className="col-span-1 flex justify-center">
          <input type="radio" name={`quote-${partId}`} checked={q.selected}
            onChange={onSelect} disabled={!editable} title="Use this quote" />
        </div>
        {/* Vendor */}
        <div className="col-span-2">
          <input className={inputCls} value={q.vendor}
            onChange={e => onUpdate({ vendor: e.target.value })}
            disabled={!editable} placeholder="Vendor" />
        </div>
        {/* Reference */}
        <div className="col-span-2">
          <input className={inputCls} value={q.reference}
            onChange={e => onUpdate({ reference: e.target.value })}
            disabled={!editable} placeholder="Reference" />
        </div>
        {/* Cost */}
        <div className="col-span-2">
          <input type="number" min={0} step={0.01} className={inputCls}
            value={q.cost} onChange={e => onUpdate({ cost: parseFloat(e.target.value) || 0 })}
            disabled={!editable} placeholder="Cost" />
        </div>
        {/* Valid until */}
        <div className="col-span-2">
          <input type="date" className={inputCls} value={q.validUntil}
            onChange={e => onUpdate({ validUntil: e.target.value })}
            disabled={!editable} />
        </div>
        {/* Notes */}
        <div className="col-span-2">
          <input className={inputCls} value={q.notes ?? ''}
            onChange={e => onUpdate({ notes: e.target.value })}
            disabled={!editable} placeholder="Notes" />
        </div>
        {/* Actions */}
        <div className="col-span-1 flex items-center justify-center gap-1">
          {/* Attachment button */}
          {editable && (
            <>
              <input ref={fileRef} type="file" className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={handleFileChange} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Attach quote document (PDF, Word, Excel, image — max 10 MB)"
                className={clsx(
                  'p-0.5 rounded transition-colors',
                  q.attachmentName
                    ? 'text-brand-600 hover:text-brand-700'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-slate-300'
                )}
              >
                <Paperclip size={12} />
              </button>
            </>
          )}
          {/* Download */}
          {q.attachmentName && (
            <button onClick={handleDownload} title={`Download: ${q.attachmentName}`}
              className="p-0.5 rounded text-brand-600 hover:text-brand-700 transition-colors">
              <Download size={12} />
            </button>
          )}
          {/* Delete quote */}
          {editable && (
            <button onClick={onDelete}
              className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Attachment strip */}
      {q.attachmentName && (
        <div className="ml-[calc(8.33%+8px)] mt-1 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded text-xs text-brand-700 dark:text-brand-300">
            <Paperclip size={10} />
            <span className="max-w-xs truncate">{q.attachmentName}</span>
            {editable && (
              <button onClick={() => onUpdate({ attachmentData: undefined, attachmentName: undefined, attachmentMime: undefined })}
                className="ml-1 text-brand-400 hover:text-red-500 transition-colors">
                <XIcon size={10} />
              </button>
            )}
          </div>
        </div>
      )}

      {sizeError && (
        <div className="ml-[calc(8.33%+8px)] mt-1 text-xs text-red-500">{sizeError}</div>
      )}
    </div>
  );
}

// ─── Part row ──────────────────────────────────────────────────────────────────

function PartRow({
  part, editable, expanded,
  onToggle, onUpdate, onDelete,
  onAddQuote, onUpdateQuote, onSelectQuote, onDeleteQuote,
}: PartRowProps) {
  const sel       = part.quotes.find(q => q.selected);
  const unitCost  = sel ? sel.cost : part.unitCost;
  const lineTotal = part.unitPrice * part.quantity;
  const pct       = upliftPct(unitCost, part.unitPrice);

  const handleUpliftChange = (val: string) => {
    const pctNum = parseFloat(val);
    if (isNaN(pctNum)) return;
    onUpdate({ unitPrice: parseFloat((unitCost * (1 + pctNum / 100)).toFixed(2)) });
  };

  return (
    <div>
      <div className="grid grid-cols-12 gap-2 items-center px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-slate-700/20 transition-colors">
        {/* Description */}
        <div className="col-span-3">
          <input
            className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 bg-transparent text-gray-900 dark:text-slate-100 disabled:text-gray-600 dark:disabled:text-slate-300"
            value={part.description} onChange={e => onUpdate({ description: e.target.value })}
            disabled={!editable} placeholder="Item description"
          />
        </div>
        {/* SKU */}
        <div className="col-span-1">
          <input
            className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-xs py-0.5 text-center bg-transparent text-gray-500 dark:text-slate-400 disabled:opacity-70"
            value={part.sku ?? ''} onChange={e => onUpdate({ sku: e.target.value })}
            disabled={!editable} placeholder="SKU"
          />
        </div>
        {/* Qty */}
        <div className="col-span-1 text-center">
          <input
            type="number" min={1}
            className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 text-center bg-transparent text-gray-900 dark:text-slate-100 disabled:opacity-70"
            value={part.quantity} onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
            disabled={!editable}
          />
        </div>
        {/* Unit Cost */}
        <div className="col-span-2 text-right">
          <input
            type="number" min={0} step={0.01}
            className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 text-right bg-transparent text-gray-900 dark:text-slate-100 disabled:opacity-70"
            value={unitCost} onChange={e => onUpdate({ unitCost: parseFloat(e.target.value) || 0 })}
            disabled={!editable || !!sel} title={sel ? 'Set by selected vendor quote' : undefined}
          />
        </div>
        {/* Uplift % */}
        <div className="col-span-1 text-right">
          {editable && unitCost > 0 ? (
            <div className="relative">
              <input
                type="number" step={0.1}
                className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 pr-4 text-right bg-transparent text-gray-900 dark:text-slate-100"
                value={pct !== null ? parseFloat(pct.toFixed(1)) : ''}
                onChange={e => handleUpliftChange(e.target.value)}
                placeholder="—" title="Markup %. Changing this recalculates the unit price."
              />
              <span className="absolute right-0.5 top-0.5 text-xs text-gray-400 dark:text-slate-500 pointer-events-none">%</span>
            </div>
          ) : (
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {pct !== null ? `${pct.toFixed(1)}%` : '—'}
            </span>
          )}
        </div>
        {/* Unit Price */}
        <div className="col-span-2 text-right">
          <input
            type="number" min={0} step={0.01}
            className="w-full border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-500 focus:border-brand-500 outline-none text-sm py-0.5 text-right bg-transparent text-gray-900 dark:text-slate-100 disabled:opacity-70"
            value={part.unitPrice} onChange={e => onUpdate({ unitPrice: parseFloat(e.target.value) || 0 })}
            disabled={!editable}
          />
        </div>
        {/* Line Total */}
        <div className="col-span-1 text-right text-sm font-semibold text-gray-800 dark:text-slate-200">
          {fmt(lineTotal)}
        </div>
        {/* Actions */}
        <div className="col-span-1 flex items-center justify-end gap-1">
          <button onClick={onToggle}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500"
            title="Vendor quotes">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {editable && (
            <button onClick={onDelete}
              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Vendor quotes panel */}
      {expanded && (
        <div className="mx-5 mb-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Vendor Quotes</div>
          {part.quotes.length === 0 && (
            <div className="text-xs text-gray-400 dark:text-slate-500 mb-3">No quotes attached.</div>
          )}
          {part.quotes.map(q => (
            <QuoteRow
              key={q.id}
              partId={part.id}
              quote={q}
              editable={editable}
              onSelect={() => onSelectQuote(q.id)}
              onUpdate={u => onUpdateQuote(q.id, u)}
              onDelete={() => onDeleteQuote(q.id)}
            />
          ))}
          {editable && (
            <Button variant="ghost" size="sm" onClick={onAddQuote}>
              <Plus size={13} /> Add quote
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section card ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  type: PartType;
  parts: Part[];
  editable: boolean;
  expandedPart: string | null;
  onToggle: (id: string) => void;
  onUpdate: (id: string, u: Partial<Part>) => void;
  onDelete: (id: string) => void;
  onAddBlank: () => void;
  onAddQuote: (id: string) => void;
  onUpdateQuote: (partId: string, qId: string, u: Partial<VendorQuote>) => void;
  onSelectQuote: (partId: string, qId: string) => void;
  onDeleteQuote: (partId: string, qId: string) => void;
}

function SectionCard({
  type, parts, editable, expandedPart,
  onToggle, onUpdate, onDelete, onAddBlank,
  onAddQuote, onUpdateQuote, onSelectQuote, onDeleteQuote,
}: SectionCardProps) {
  const cfg = TYPE_CONFIG[type];
  const sectionCost = parts.reduce((s, p) => {
    const sel = p.quotes.find(q => q.selected);
    return s + (sel ? sel.cost : p.unitCost) * p.quantity;
  }, 0);
  const sectionSell = parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const sectionPct  = upliftPct(sectionCost, sectionSell);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      {/* Section header */}
      <div className={clsx('flex items-center justify-between px-5 py-3 border-b', cfg.headerCls)}>
        <div className="flex items-center gap-2.5">
          <span className={clsx('text-sm font-bold', cfg.accentText)}>{cfg.label}</span>
          {cfg.cadence && (
            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium border', cfg.badgeCls)}>
              {cfg.cadence}
            </span>
          )}
          <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium', cfg.badgeCls)}>
            {parts.length} item{parts.length !== 1 ? 's' : ''}
          </span>
        </div>
        {parts.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
            <span>Cost: <span className="font-semibold text-gray-700 dark:text-slate-300">{fmt(sectionCost)}</span></span>
            <span>Sell: <span className="font-semibold text-gray-700 dark:text-slate-300">{fmt(sectionSell)}</span></span>
            {sectionPct !== null && (
              <span className="font-semibold text-gray-700 dark:text-slate-300">{sectionPct.toFixed(1)}% uplift</span>
            )}
          </div>
        )}
      </div>

      {/* Column headers */}
      <ColHeader cadenceSuffix={cfg.cadenceSuffix} />

      {/* Empty state */}
      {parts.length === 0 && (
        <div className="px-5 py-6 text-center text-sm text-gray-400 dark:text-slate-500">
          No {cfg.label.toLowerCase()} added yet.
        </div>
      )}

      {/* Part rows */}
      <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
        {parts.map(part => (
          <PartRow
            key={part.id}
            part={part}
            editable={editable}
            expanded={expandedPart === part.id}
            onToggle={() => onToggle(part.id)}
            onUpdate={u => onUpdate(part.id, u)}
            onDelete={() => onDelete(part.id)}
            onAddQuote={() => onAddQuote(part.id)}
            onUpdateQuote={(qId, u) => onUpdateQuote(part.id, qId, u)}
            onSelectQuote={qId => onSelectQuote(part.id, qId)}
            onDeleteQuote={qId => onDeleteQuote(part.id, qId)}
          />
        ))}
      </div>

      {/* Section footer: totals + add button */}
      <div className="px-5 py-2.5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
        {parts.length > 0 ? (
          <div className="grid grid-cols-12 gap-2 flex-1 text-xs text-gray-500 dark:text-slate-400">
            <div className="col-span-5" />
            <div className="col-span-2 text-right font-semibold text-gray-600 dark:text-slate-300">{fmt(sectionCost)}</div>
            <div className="col-span-1" />
            <div className="col-span-2 text-right font-semibold text-gray-900 dark:text-slate-100">{fmt(sectionSell)}</div>
            <div className="col-span-2" />
          </div>
        ) : (
          <div />
        )}
        {editable && (
          <Button variant="ghost" size="sm" onClick={onAddBlank} className="flex-shrink-0 ml-2">
            <Plus size={13} /> Add {cfg.label.replace(' Subscriptions', '')}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Qty stepper — shared between catalog picker and FBT modal ────────────────

function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(1, n));
  return (
    <div className="flex items-center border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden shrink-0">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); set(value - 1); }}
        className="px-1.5 py-1 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 text-sm leading-none select-none"
      >−</button>
      <input
        type="number"
        min={1}
        value={value}
        onClick={e => e.stopPropagation()}
        onChange={e => set(parseInt(e.target.value) || 1)}
        className="w-9 text-center text-sm py-1 bg-transparent border-0 focus:outline-none dark:text-slate-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={e => { e.stopPropagation(); set(value + 1); }}
        className="px-1.5 py-1 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 text-sm leading-none select-none"
      >+</button>
    </div>
  );
}

// ─── Frequently Bought Together modal ─────────────────────────────────────────

interface FbtModalProps {
  triggerItem: CatalogItem;
  triggerQty: number;
  suggestions: CatalogItem[];
  onAdd: (item: CatalogItem, qty: number) => void;
  onAddAll: (items: Array<{ item: CatalogItem; qty: number }>) => void;
  onDismiss: () => void;
}

function FbtModal({ triggerItem, triggerQty, suggestions, onAdd, onAddAll, onDismiss }: FbtModalProps) {
  // Per-suggestion qty — seeded from the trigger item's quantity
  const [qtys, setQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(suggestions.map(s => [s.id, triggerQty]))
  );
  const [added, setAdded] = useState<Set<string>>(new Set());

  const setQty = (id: string, n: number) =>
    setQtys(prev => ({ ...prev, [id]: Math.max(1, n) }));

  const handleAdd = (item: CatalogItem) => {
    onAdd(item, qtys[item.id] ?? triggerQty);
    setAdded(prev => new Set(prev).add(item.id));
  };

  const remaining = suggestions.filter(s => !added.has(s.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onDismiss} />

      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
              <ShoppingCart size={15} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Frequently bought together</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Customers who add <span className="font-medium text-gray-700 dark:text-slate-300">{triggerItem.description}</span> also buy:
              </p>
            </div>
          </div>
          <button onClick={onDismiss} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 shrink-0 transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        {/* Suggestions */}
        <div className="divide-y divide-gray-50 dark:divide-slate-700 max-h-80 overflow-y-auto">
          {suggestions.map(item => {
            const pt      = TYPE_CONFIG[item.partType ?? 'Hardware'];
            const isAdded = added.has(item.id);
            return (
              <div key={item.id} className={clsx(
                'flex items-center gap-3 px-5 py-3 transition-colors',
                isAdded ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
              )}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{item.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium', pt.badgeCls)}>
                      {pt.label.replace(' Subscriptions', '')}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      £{item.listPrice.toLocaleString()}
                      {(item.partType === 'Monthly' || item.partType === 'Annual') && (
                        <span>/{item.partType === 'Monthly' ? 'mo' : 'yr'}</span>
                      )}
                    </span>
                  </div>
                </div>
                {isAdded ? (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Added</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <QtyStepper value={qtys[item.id] ?? triggerQty} onChange={n => setQty(item.id, n)} />
                    <button
                      onClick={() => handleAdd(item)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between gap-2">
          <button onClick={onDismiss} className="text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200">
            Dismiss
          </button>
          {remaining.length > 1 && (
            <button
              onClick={() => {
                onAddAll(remaining.map(item => ({ item, qty: qtys[item.id] ?? triggerQty })));
                onDismiss();
              }}
              className="text-sm px-4 py-1.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
            >
              Add all ({remaining.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PartsTab({ proposal, editable, onUpdate }: Props) {
  const { catalog } = useStore();
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [showCatalog, setShowCatalog]   = useState(false);
  const [catSearch, setCatSearch]       = useState('');
  const [catTypeFilter, setCatTypeFilter] = useState<PartType | 'All'>('All');

  // FBT modal state
  const [fbtTrigger, setFbtTrigger]       = useState<CatalogItem | null>(null);
  const [fbtTriggerQty, setFbtTriggerQty] = useState(1);
  const [fbtSuggestions, setFbtSuggestions] = useState<CatalogItem[]>([]);

  // Per-item quantity in the catalog picker (resets when picker closes)
  const [catQty, setCatQty] = useState<Record<string, number>>({});
  const getCatQty = (id: string) => catQty[id] ?? 1;
  const setCatItemQty = (id: string, n: number) =>
    setCatQty(prev => ({ ...prev, [id]: Math.max(1, n) }));

  const closeCatalog = () => {
    setShowCatalog(false);
    setCatSearch('');
    setCatTypeFilter('All');
    setCatQty({});
  };

  const setParts = (parts: Part[]) => onUpdate({ parts });

  const addBlankPart = (type: PartType) => {
    const newPart: Part = {
      id: uuid(), description: '', sku: '', quantity: 1,
      unitCost: 0, unitPrice: 0, quotes: [], partType: type,
    };
    setParts([...proposal.parts, newPart]);
    setExpandedPart(newPart.id);
  };

  const makePart = (item: CatalogItem, quantity = 1): Part => ({
    id: uuid(), description: item.description, sku: item.sku, quantity,
    // Use the catalog's explicit buy price; fall back to 80% of sell price for
    // legacy items that were added before the costPrice field existed.
    unitCost: item.costPrice > 0 ? item.costPrice : item.listPrice * 0.8,
    unitPrice: item.listPrice,
    quotes: [], partType: item.partType ?? 'Hardware',
  });

  const addFromCatalog = (catId: string, qty: number) => {
    const item = catalog.find(c => c.id === catId);
    if (!item) return;
    setParts([...proposal.parts, makePart(item, qty)]);
    closeCatalog();

    // Build FBT suggestions: bidirectional
    const forwardIds = new Set(item.relatedIds ?? []);
    const reverseIds = new Set(
      catalog.filter(c => (c.relatedIds ?? []).includes(item.id)).map(c => c.id)
    );
    const allRelatedIds = [...new Set([...forwardIds, ...reverseIds])];

    if (allRelatedIds.length > 0) {
      const existingSkus = new Set(proposal.parts.map(p => p.sku).filter(Boolean));
      const suggestions  = allRelatedIds
        .map(id => catalog.find(c => c.id === id))
        .filter((c): c is CatalogItem => !!c && !existingSkus.has(c.sku));
      if (suggestions.length > 0) {
        setFbtTrigger(item);
        setFbtTriggerQty(qty);
        setFbtSuggestions(suggestions);
      }
    }
  };

  const addFromFbt = (item: CatalogItem, qty: number) => {
    onUpdate({ parts: [...proposal.parts, makePart(item, qty)] });
  };

  const addAllFromFbt = (entries: Array<{ item: CatalogItem; qty: number }>) => {
    onUpdate({ parts: [...proposal.parts, ...entries.map(e => makePart(e.item, e.qty))] });
  };

  const updatePart  = (id: string, updates: Partial<Part>) =>
    setParts(proposal.parts.map(p => p.id === id ? { ...p, ...updates } : p));
  const deletePart  = (id: string) =>
    setParts(proposal.parts.filter(p => p.id !== id));
  const addQuote    = (partId: string) => {
    const q: VendorQuote = { id: uuid(), vendor: '', reference: '', cost: 0, validUntil: '', selected: false };
    updatePart(partId, { quotes: [...(proposal.parts.find(p => p.id === partId)?.quotes ?? []), q] });
  };
  const updateQuote = (partId: string, qId: string, updates: Partial<VendorQuote>) => {
    const part = proposal.parts.find(p => p.id === partId);
    if (!part) return;
    updatePart(partId, { quotes: part.quotes.map(q => q.id === qId ? { ...q, ...updates } : q) });
  };
  const selectQuote = (partId: string, qId: string) => {
    const part = proposal.parts.find(p => p.id === partId);
    if (!part) return;
    updatePart(partId, { quotes: part.quotes.map(q => ({ ...q, selected: q.id === qId })) });
  };
  const deleteQuote = (partId: string, qId: string) => {
    const part = proposal.parts.find(p => p.id === partId);
    if (!part) return;
    updatePart(partId, { quotes: part.quotes.filter(q => q.id !== qId) });
  };

  // Group parts by type
  const grouped = PART_TYPE_ORDER.reduce<Record<PartType, Part[]>>((acc, t) => {
    acc[t] = proposal.parts.filter(p => (p.partType ?? 'Hardware') === t);
    return acc;
  }, {} as Record<PartType, Part[]>);

  // Grand totals
  const totalCost = proposal.parts.reduce((s, p) => {
    const sel = p.quotes.find(q => q.selected);
    return s + (sel ? sel.cost : p.unitCost) * p.quantity;
  }, 0);
  const totalSell    = proposal.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const overallPct   = upliftPct(totalCost, totalSell);
  const margin       = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : 0;

  // Catalog picker filter
  const filteredCatalog = catalog.filter(c => {
    const matchesSearch = !catSearch.trim() ||
      c.description.toLowerCase().includes(catSearch.toLowerCase()) ||
      c.sku.toLowerCase().includes(catSearch.toLowerCase());
    const matchesType = catTypeFilter === 'All' || (c.partType ?? 'Hardware') === catTypeFilter;
    return matchesSearch && matchesType;
  });

  const sharedHandlers = {
    expandedPart,
    onToggle: (id: string) => setExpandedPart(expandedPart === id ? null : id),
    onUpdate: updatePart,
    onDelete: deletePart,
    onAddQuote: addQuote,
    onUpdateQuote: updateQuote,
    onSelectQuote: selectQuote,
    onDeleteQuote: deleteQuote,
  };

  return (
    <div className="max-w-5xl space-y-4">

      {/* 4 distinct section cards */}
      {PART_TYPE_ORDER.map(type => (
        <SectionCard
          key={type}
          type={type}
          parts={grouped[type]}
          editable={editable}
          onAddBlank={() => addBlankPart(type)}
          {...sharedHandlers}
        />
      ))}

      {/* Grand total */}
      {proposal.parts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-gray-300 dark:border-slate-600 px-5 py-3 grid grid-cols-12 gap-2 text-sm font-semibold">
          <div className="col-span-3 text-gray-700 dark:text-slate-300">Parts Grand Total</div>
          <div className="col-span-3" />
          <div className="col-span-2 text-right text-gray-600 dark:text-slate-400">{fmt(totalCost)}</div>
          <div className="col-span-1 text-right">
            <span className="text-sm font-bold text-gray-700 dark:text-slate-300">
              {overallPct !== null ? `${overallPct.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="col-span-2 text-right text-gray-900 dark:text-slate-100">{fmt(totalSell)}</div>
          <div className="col-span-1 text-right text-green-700 dark:text-green-400">
            {margin.toFixed(1)}% GP
          </div>
        </div>
      )}

      {/* Add from catalog button */}
      {editable && (
        <Button variant="secondary" onClick={() => setShowCatalog(true)}>
          <Package size={15} /> Add from Catalog
        </Button>
      )}

      {/* Catalog modal overlay */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closeCatalog} />

          {/* Panel */}
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-brand-600 dark:text-brand-400" />
                <span className="font-semibold text-gray-900 dark:text-slate-100">Add from Catalog</span>
                {filteredCatalog.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-slate-500">({filteredCatalog.length} items)</span>
                )}
              </div>
              <button onClick={closeCatalog} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                <XIcon size={16} />
              </button>
            </div>

            {/* Search + type filter */}
            <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700 space-y-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  className="w-full pl-9 pr-3 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Search by name, SKU or description…"
                  value={catSearch}
                  onChange={e => setCatSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['All', ...PART_TYPE_ORDER] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setCatTypeFilter(t)}
                    className={clsx(
                      'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                      catTypeFilter === t
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-brand-400'
                    )}
                  >
                    {t === 'All' ? 'All types' : TYPE_CONFIG[t].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
              {filteredCatalog.length === 0 && (
                <div className="px-5 py-10 text-sm text-gray-400 dark:text-slate-500 text-center">
                  No catalog items match your search.
                </div>
              )}
              {filteredCatalog.map(item => {
                const pt     = item.partType ?? 'Hardware';
                const cfg    = TYPE_CONFIG[pt];
                const hasRel = (item.relatedIds ?? []).length > 0;
                const qty    = getCatQty(item.id);
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{item.description}</span>
                        {hasRel && (
                          <span title={`${item.relatedIds!.length} related product${item.relatedIds!.length !== 1 ? 's' : ''}`}>
                            <Link2 size={11} className="text-brand-400 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium', cfg.badgeCls)}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          {item.sku && <>{item.sku} · </>}
                          £{item.listPrice.toLocaleString()}
                          {(pt === 'Monthly' || pt === 'Annual') && <span>/{pt === 'Monthly' ? 'mo' : 'yr'}</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <QtyStepper value={qty} onChange={n => setCatItemQty(item.id, n)} />
                      <button
                        onClick={() => addFromCatalog(item.id, qty)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 flex justify-end">
              <button onClick={closeCatalog} className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FBT modal — portal-style, rendered at the bottom of the component tree */}
      {fbtTrigger && fbtSuggestions.length > 0 && (
        <FbtModal
          triggerItem={fbtTrigger}
          triggerQty={fbtTriggerQty}
          suggestions={fbtSuggestions}
          onAdd={addFromFbt}
          onAddAll={addAllFromFbt}
          onDismiss={() => { setFbtTrigger(null); setFbtSuggestions([]); }}
        />
      )}
    </div>
  );
}
