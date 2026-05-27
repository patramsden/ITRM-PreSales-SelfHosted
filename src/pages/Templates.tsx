import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Plus, Edit2, Trash2, BookTemplate, Save, Package, Users } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { useAuth, isPresalesAdmin } from '../contexts/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { RichTextEditor } from '../components/ui/RichTextEditor';

export function Templates() {
  useDocumentTitle('Templates');
  const { templates, addTemplate, deleteTemplate } = useStore();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const canManage = (t: { ownerId: string }) =>
    isPresalesAdmin(currentUser) || t.ownerId === currentUser?.id;

  const handleCreate = () => {
    if (!newName.trim() || !currentUser) return;
    const id = uuid();
    addTemplate({ id, name: newName, description: newDesc, ownerId: currentUser.id, dateCreated: new Date().toISOString().split('T')[0], parts: [], phases: [] });
    setShowNew(false); setNewName(''); setNewDesc('');
    navigate(`/templates/${id}`);
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
                <span className="flex items-center gap-1"><Package size={11} />{t.parts.length} parts</span>
                <span className="flex items-center gap-1"><Users size={11} />{t.phases.reduce((n, p) => n + p.tasks.length, 0)} tasks</span>
                <span>by {owner?.name ?? '—'}</span>
              </div>
              <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-slate-700">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/templates/${t.id}`)}>
                  <Edit2 size={13} /> Edit
                </Button>
                {canManage(t) && (
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(t.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={13} /> Delete
                  </Button>
                )}
              </div>
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
            <RichTextEditor
              value={newDesc}
              onChange={v => setNewDesc(v)}
              minimal
              minHeight="5rem"
              placeholder="What is this template for?"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!newName.trim()}><Save size={14} /> Create</Button>
        </div>
      </Modal>

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
