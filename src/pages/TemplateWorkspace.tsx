import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ArrowLeft, Save, X } from 'lucide-react';
import { useStore } from '../store';
import { useAuth, isPresalesAdmin } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { PartsTab } from '../components/proposals/tabs/PartsTab';
import { ConsultancyTab } from '../components/proposals/tabs/ConsultancyTab';
import type { Proposal, Template } from '../types';
import clsx from 'clsx';

const TABS = ['Parts', 'Consultancy'] as const;
type Tab = (typeof TABS)[number];

export function TemplateWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { templates, updateTemplate } = useStore();
  const { currentUser } = useAuth();

  const template = templates.find(t => t.id === id);
  useDocumentTitle(template?.name);
  const [activeTab, setActiveTab] = useState<Tab>('Parts');
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(template?.name ?? '');
  const [metaDesc, setMetaDesc] = useState(template?.description ?? '');

  if (!template) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-slate-400">
        Template not found.{' '}
        <button className="text-brand-600 hover:underline" onClick={() => navigate('/templates')}>
          Go back
        </button>
      </div>
    );
  }

  const canManage = isPresalesAdmin(currentUser) || template.ownerId === currentUser?.id;

  // Build a minimal Proposal-shaped object so PartsTab and ConsultancyTab
  // work without modification — they only read parts/phases/currency/markupPct.
  const fakeProposal: Proposal = {
    id:              template.id,
    projectName:     template.name,
    client:          '',
    accountManager:  '',
    status: 'New',
    currency:        'GBP',
    dateCreated:     template.dateCreated,
    dateModified:    template.dateCreated,
    markupPct:       15,
    ownerId:         template.ownerId,
    collaboratorIds: [],
    parts:           template.parts,
    phases:          template.phases,
  };

  // Translate Proposal updates back to Template updates (only parts & phases matter)
  const handleUpdate = (updates: Partial<Proposal>) => {
    const patch: Partial<Template> = {};
    if (updates.parts   !== undefined) patch.parts   = updates.parts;
    if (updates.phases  !== undefined) patch.phases  = updates.phases;
    if (Object.keys(patch).length) updateTemplate(template.id, patch);
  };

  const saveMeta = () => {
    if (metaName.trim()) {
      updateTemplate(template.id, { name: metaName.trim(), description: metaDesc.trim() || undefined });
    }
    setEditingMeta(false);
  };

  const cancelMeta = () => {
    setMetaName(template.name);
    setMetaDesc(template.description ?? '');
    setEditingMeta(false);
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-8 pt-6 pb-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => navigate('/templates')}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <nav className="text-sm text-gray-400 dark:text-slate-500 flex items-center gap-1.5">
            <button onClick={() => navigate('/templates')} className="hover:text-brand-600 dark:hover:text-brand-400">
              Templates
            </button>
            <span>/</span>
            <span className="text-gray-700 dark:text-slate-200 font-medium">{template.name}</span>
          </nav>
        </div>

        {/* Name + description — click to edit */}
        {editingMeta ? (
          <div className="flex items-start gap-3 mb-5">
            <div className="flex-1 space-y-2">
              <input
                autoFocus
                className="w-full text-xl font-bold text-gray-900 dark:text-slate-100 bg-transparent border-b-2 border-brand-400 focus:outline-none py-0.5"
                value={metaName}
                onChange={e => setMetaName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveMeta(); if (e.key === 'Escape') cancelMeta(); }}
              />
              <input
                className="w-full text-sm text-gray-500 dark:text-slate-400 bg-transparent border-b border-gray-300 dark:border-slate-600 focus:outline-none py-0.5"
                value={metaDesc}
                placeholder="Add a description…"
                onChange={e => setMetaDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveMeta(); if (e.key === 'Escape') cancelMeta(); }}
              />
            </div>
            <Button size="sm" onClick={saveMeta}><Save size={13} /> Save</Button>
            <Button variant="secondary" size="sm" onClick={cancelMeta}><X size={13} /> Cancel</Button>
          </div>
        ) : (
          <div
            className={clsx('mb-5 group', canManage && 'cursor-pointer')}
            onClick={() => canManage && setEditingMeta(true)}
          >
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{template.name}</h1>
              {canManage && (
                <span className="text-xs text-gray-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  click to edit
                </span>
              )}
            </div>
            {template.description ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{template.description}</p>
            ) : canManage ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 italic mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                Add a description…
              </p>
            ) : null}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <div className="flex-1">
        {activeTab === 'Parts' && (
          <PartsTab proposal={fakeProposal} editable={canManage} onUpdate={handleUpdate} />
        )}
        {activeTab === 'Consultancy' && (
          <ConsultancyTab proposal={fakeProposal} editable={canManage} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  );
}
