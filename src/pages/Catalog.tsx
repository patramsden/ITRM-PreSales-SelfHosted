import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Search, Link2 } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { useAuth, isPresalesAdmin } from '../contexts/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { CatalogImportDialog } from '../components/catalog/CatalogImportDialog';
import type { CatalogItem, PartType } from '../types';
import clsx from 'clsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const PART_TYPES: { value: PartType; label: string; cadence: string; cls: string }[] = [
  { value: 'Hardware', label: 'Hardware',               cadence: 'One-off',   cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  { value: 'Software', label: 'Software',               cadence: 'One-off',   cls: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
  { value: 'Monthly',  label: 'Monthly Subscription',   cadence: 'Per month', cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  { value: 'Annual',   label: 'Annual Subscription',    cadence: 'Per year',  cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' },
];

const BLANK: Omit<CatalogItem, 'id'> = {
  sku: '', description: '', category: '', defaultVendor: '', listPrice: 0, partType: 'Hardware', relatedIds: [],
};

const INPUT_CLS = 'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

// ─── TypeBadge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: PartType | undefined }) {
  const pt = PART_TYPES.find(p => p.value === (type ?? 'Hardware')) ?? PART_TYPES[0];
  return (
    <span className={clsx('inline-flex text-xs px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap', pt.cls)}>
      {pt.label}
    </span>
  );
}

// ─── RelatedProductsPicker ────────────────────────────────────────────────────

interface RelatedPickerProps {
  currentId?: string;
  relatedIds: string[];
  allItems: CatalogItem[];
  onChange: (ids: string[]) => void;
}

function RelatedProductsPicker({ currentId, relatedIds, allItems, onChange }: RelatedPickerProps) {
  const [relSearch, setRelSearch] = useState('');

  const available = allItems.filter(c => {
    if (c.id === currentId) return false;
    if (!relSearch.trim()) return true;
    return (
      c.description.toLowerCase().includes(relSearch.toLowerCase()) ||
      c.sku.toLowerCase().includes(relSearch.toLowerCase())
    );
  });

  const toggle = (id: string) =>
    onChange(relatedIds.includes(id) ? relatedIds.filter(r => r !== id) : [...relatedIds, id]);

  const selectedItems = allItems.filter(c => relatedIds.includes(c.id));

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
        Related Products
        <span className="ml-1.5 text-xs font-normal text-gray-400">
          Shown as "frequently bought together" when added to a quote
        </span>
      </label>

      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedItems.map(c => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-full text-xs text-brand-700 dark:text-brand-300"
            >
              {c.description}
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="text-brand-400 hover:text-red-500 transition-colors ml-0.5"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + list */}
      <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
        <div className="relative border-b border-gray-200 dark:border-slate-600">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-slate-700/50 dark:text-slate-100 focus:outline-none"
            placeholder="Search to link products…"
            value={relSearch}
            onChange={e => setRelSearch(e.target.value)}
          />
        </div>
        <div className="max-h-44 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700">
          {available.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400 dark:text-slate-500 text-center">
              {allItems.filter(c => c.id !== currentId).length === 0 ? 'No other catalog items yet.' : 'No matches.'}
            </div>
          )}
          {available.map(c => {
            const pt = PART_TYPES.find(p => p.value === (c.partType ?? 'Hardware')) ?? PART_TYPES[0];
            const checked = relatedIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors text-sm',
                  checked ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                )}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={checked}
                  className="rounded border-gray-300 text-brand-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-slate-100 truncate block">{c.description}</span>
                  <span className="text-xs text-gray-400 dark:text-slate-500">{c.sku}</span>
                </div>
                <span className={clsx('text-xs px-1.5 py-0.5 rounded-full border font-medium shrink-0', pt.cls)}>
                  {pt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── ItemForm ─────────────────────────────────────────────────────────────────

interface ItemFormProps {
  item: Omit<CatalogItem, 'id'>;
  itemId?: string;
  categories: string[];
  allItems: CatalogItem[];
  onChange: (v: Omit<CatalogItem, 'id'>) => void;
}

function ItemForm({ item, itemId, categories, allItems, onChange }: ItemFormProps) {
  return (
    <div className="space-y-4">
      {/* Billing type selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Billing Type *</label>
        <div className="grid grid-cols-2 gap-2">
          {PART_TYPES.map(pt => (
            <button
              key={pt.value}
              type="button"
              onClick={() => onChange({ ...item, partType: pt.value })}
              className={clsx(
                'flex flex-col items-start px-3 py-2.5 rounded-lg border-2 text-left transition-colors',
                (item.partType ?? 'Hardware') === pt.value
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
              )}
            >
              <span className={clsx('text-xs font-semibold px-1.5 py-0.5 rounded-full border', pt.cls)}>
                {pt.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-500 mt-1">{pt.cadence}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Description *</label>
          <input
            className={INPUT_CLS}
            value={item.description}
            onChange={e => onChange({ ...item, description: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">SKU</label>
          <input
            className={INPUT_CLS}
            value={item.sku}
            onChange={e => onChange({ ...item, sku: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Category</label>
          <input
            list="cat-categories"
            className={INPUT_CLS}
            value={item.category}
            onChange={e => onChange({ ...item, category: e.target.value })}
            placeholder="e.g. Switching"
          />
          <datalist id="cat-categories">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Default Vendor</label>
          <input
            className={INPUT_CLS}
            value={item.defaultVendor ?? ''}
            onChange={e => onChange({ ...item, defaultVendor: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            List Price (£)
            {(item.partType === 'Monthly' || item.partType === 'Annual') && (
              <span className="ml-1 text-xs font-normal text-gray-400">
                · {item.partType === 'Monthly' ? 'per month' : 'per year'}
              </span>
            )}
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            className={INPUT_CLS}
            value={item.listPrice}
            onChange={e => onChange({ ...item, listPrice: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* Related products — only shown when there are other items in the catalog */}
      {allItems.filter(c => c.id !== itemId).length > 0 && (
        <RelatedProductsPicker
          currentId={itemId}
          relatedIds={item.relatedIds ?? []}
          allItems={allItems}
          onChange={ids => onChange({ ...item, relatedIds: ids })}
        />
      )}
    </div>
  );
}

// ─── Catalog page ─────────────────────────────────────────────────────────────

export function Catalog() {
  const { catalog, addCatalogItem, updateCatalogItem, deleteCatalogItem, lookups } = useStore();
  const { currentUser } = useAuth();
  const isAdmin = isPresalesAdmin(currentUser);

  const [search, setSearch]     = useState('');
  const [editing, setEditing]   = useState<CatalogItem | null>(null);
  const [showNew, setShowNew]   = useState(false);
  const [newItem, setNewItem]   = useState<Omit<CatalogItem, 'id'>>(BLANK);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = catalog.filter(c =>
    !search.trim() ||
    c.description.toLowerCase().includes(search.toLowerCase()) ||
    c.sku.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set([
    ...lookups.catalogCategories,
    ...catalog.map(c => c.category).filter(Boolean),
  ])].sort();

  // Returns the union of an item's explicit relatedIds and any items that
  // reverse-reference it — so the picker always shows the full symmetric set.
  const getEffectiveRelatedIds = (item: CatalogItem): string[] => {
    const explicit = item.relatedIds ?? [];
    const implicit = catalog
      .filter(c => c.id !== item.id && (c.relatedIds ?? []).includes(item.id))
      .map(c => c.id);
    return [...new Set([...explicit, ...implicit])];
  };

  const handleCreate = () => {
    const id = uuid();
    const created: CatalogItem = { ...newItem, id };
    addCatalogItem(created);

    // Sync: add this new item to the relatedIds of every item it references
    for (const relId of newItem.relatedIds ?? []) {
      const other = catalog.find(c => c.id === relId);
      if (other && !(other.relatedIds ?? []).includes(id)) {
        updateCatalogItem(relId, { ...other, relatedIds: [...(other.relatedIds ?? []), id] });
      }
    }

    setShowNew(false);
    setNewItem(BLANK);
  };

  const handleSave = () => {
    if (!editing) return;

    const original     = catalog.find(c => c.id === editing.id);
    const oldRelated   = getEffectiveRelatedIds(original ?? editing);
    const newRelated   = editing.relatedIds ?? [];
    const added        = newRelated.filter(id => !oldRelated.includes(id));
    const removed      = oldRelated.filter(id => !newRelated.includes(id));

    updateCatalogItem(editing.id, editing);

    // Add this item to newly-linked items' relatedIds
    for (const id of added) {
      const other = catalog.find(c => c.id === id);
      if (other && !(other.relatedIds ?? []).includes(editing.id)) {
        updateCatalogItem(id, { ...other, relatedIds: [...(other.relatedIds ?? []), editing.id] });
      }
    }
    // Remove this item from de-linked items' relatedIds
    for (const id of removed) {
      const other = catalog.find(c => c.id === id);
      if (other && (other.relatedIds ?? []).includes(editing.id)) {
        updateCatalogItem(id, { ...other, relatedIds: (other.relatedIds ?? []).filter(r => r !== editing.id) });
      }
    }

    setEditing(null);
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Product Catalog"
        subtitle="Master list of parts, software and subscriptions"
        actions={isAdmin && (
          <div className="flex items-center gap-2">
            <CatalogImportDialog onComplete={() => {}} />
            <Button onClick={() => setShowNew(true)}><Plus size={16} /> Add Item</Button>
          </div>
        )}
      />

      <div className="mb-5 max-w-xs relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Search catalog…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Description</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">SKU</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Billing Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Vendor</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">List Price</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Related</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400 dark:text-slate-500">No items found.</td></tr>
            )}
            {filtered.map(item => {
              const relCount = (item.relatedIds ?? []).length;
              return (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-5 py-3 font-medium text-gray-900 dark:text-slate-100">{item.description}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 font-mono text-xs">{item.sku}</td>
                  <td className="px-4 py-3"><TypeBadge type={item.partType} /></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{item.category}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{item.defaultVendor ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-slate-100">
                    £{item.listPrice.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    {(item.partType === 'Monthly' || item.partType === 'Annual') && (
                      <span className="text-xs font-normal text-gray-400 ml-1">
                        /{item.partType === 'Monthly' ? 'mo' : 'yr'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {relCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 font-medium">
                        <Link2 size={10} />{relCount}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing({ ...item, relatedIds: getEffectiveRelatedIds(item) })} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteId(item.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); setNewItem(BLANK); }} title="Add Catalog Item">
        <ItemForm
          item={newItem}
          categories={categories}
          allItems={catalog}
          onChange={setNewItem}
        />
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => { setShowNew(false); setNewItem(BLANK); }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!newItem.description.trim()}><Save size={14} /> Add</Button>
        </div>
      </Modal>

      {/* Edit modal */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit Catalog Item">
          <ItemForm
            item={editing}
            itemId={editing.id}
            categories={categories}
            allItems={catalog}
            onChange={v => setEditing({ ...editing, ...v })}
          />
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={() => setEditing(null)}><X size={14} /> Cancel</Button>
            <Button onClick={handleSave}><Save size={14} /> Save</Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteId} title="Delete Catalog Item?"
        message="This item will be removed from the catalog. Existing proposals are not affected."
        confirmLabel="Delete" danger
        onConfirm={() => { if (deleteId) deleteCatalogItem(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
