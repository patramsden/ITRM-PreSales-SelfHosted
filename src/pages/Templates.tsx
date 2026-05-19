import { useState } from 'react';
import { Plus, Edit2, Trash2, BookTemplate, Save, X } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { useAuth, isPresalesAdmin } from '../contexts/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import type { Template } from '../types';

export function Templates() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useStore();
  const { currentUser } = useAuth();
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const canManage = (t: Template) =>
    isPresalesAdmin(currentUser) || t.ownerId === currentUser?.id;

  const handleCreate = () => {
    if (!newName.trim() || !currentUser) return;
    addTemplate({ id: uuid(), name: newName, description: newDesc, ownerId: currentUser.id, dateCreated: new Date().toISOString().split('T')[0], parts: [], phases: [] });
    setShowNew(false); setNewName(''); setNewDesc('');
  };

  const handleSave = () => {
    if (!editing) return;
    updateTemplate(editing.id, { name: editing.name, description: editing.description });
    setEditing(null);
  };

  const users = useStore(s => s.users);

  return (
    <div className="p-8">
      <PageHeader
        title="Templates"
        subtitle="Reusable proposal skeletons"
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} /> New Template
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {templates.map(t => {
          const owner = users.find(u => u.id === t.ownerId);
          return (
            <div key={t.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-brand-50 rounded-lg">
                  <BookTemplate size={18} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-slate-100 truncate">{t.name}</div>
                  {t.description && <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">{t.description}</div>}
                </div>
              </div>
              <div className="text-xs text-gray-400 dark:text-slate-500 flex gap-3">
                <span>{t.parts.length} parts</span>
                <span>{t.phases.length} phases</span>
                <span>by {owner?.name ?? '—'}</span>
              </div>
              {canManage(t) && (
                <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-slate-700">
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ ...t })}>
                    <Edit2 size={13} /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(t.id)} className="text-red-500 hover:bg-red-50">
                    <Trash2 size={13} /> Delete
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New template modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Template" size="sm">
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Name *</label>
            <input className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={newName} onChange={e => setNewName(e.target.value)} placeholder="Template name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Description</label>
            <textarea className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What is this template for?" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!newName.trim()}><Save size={14} /> Create</Button>
        </div>
      </Modal>

      {/* Edit modal */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit Template" size="sm">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                rows={3} value={editing.description ?? ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}><X size={14} /> Cancel</Button>
            <Button onClick={handleSave}><Save size={14} /> Save</Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Template?"
        message="This template will be removed. Proposals created from it are not affected."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (deleteId) deleteTemplate(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
