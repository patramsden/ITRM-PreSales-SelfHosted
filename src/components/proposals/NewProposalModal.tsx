import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, BookTemplate, Upload } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { AutotaskCompanyPicker } from '../crm/AutotaskPicker';
import { useStore, createBlankProposal, createProposalFromTemplate } from '../../store';
import { useAuth } from '../../contexts/AuthContext';
import type { Currency } from '../../types';
import clsx from 'clsx';

type Mode = 'scratch' | 'template' | 'import';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewProposalModal({ open, onClose }: Props) {
  const { templates, addProposal } = useStore();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]             = useState<Mode>('scratch');
  const [projectName, setProjectName] = useState('');
  const [client, setClient]           = useState('');
  const [crmCompanyId, setCrmCompanyId] = useState<string | undefined>();
  const [currency, setCurrency]       = useState<Currency>('GBP');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const handleCreate = () => {
    if (!projectName.trim() || !client.trim() || !currentUser) return;
    let proposal;
    if (mode === 'template' && selectedTemplateId) {
      const tmpl = templates.find(t => t.id === selectedTemplateId);
      if (tmpl) proposal = createProposalFromTemplate(tmpl, projectName, client, currency, currentUser.id);
    }
    if (!proposal) proposal = createBlankProposal(projectName, client, currency, currentUser.id);
    if (crmCompanyId) proposal = { ...proposal, crmCompanyId };
    addProposal(proposal);
    navigate(`/proposals/${proposal.id}`);
    onClose();
    setProjectName(''); setClient(''); setCrmCompanyId(undefined); setMode('scratch'); setSelectedTemplateId('');
  };

  return (
    <Modal open={open} onClose={onClose} title="New Proposal">
      {/* Mode picker */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {([
          ['scratch', 'From Scratch', FileText, 'A blank proposal'],
          ['template', 'From Template', BookTemplate, 'Pre-filled with parts & plan'],
          ['import', 'Import', Upload, 'Paste existing structure'],
        ] as const).map(([m, label, Icon, sub]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx(
              'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors text-center',
              mode === m
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'
            )}
          >
            <Icon size={22} />
            <div>
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Template selector */}
      {mode === 'template' && (
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Choose template</label>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {templates.map(t => (
              <label key={t.id} className={clsx(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer',
                selectedTemplateId === t.id ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
              )}>
                <input
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={selectedTemplateId === t.id}
                  onChange={() => setSelectedTemplateId(t.id)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">{t.name}</div>
                  {t.description && <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {mode === 'import' && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Import from a JSON/Excel file — this feature integrates with your ERP. For now, we'll create a blank proposal you can populate manually.
        </div>
      )}

      {/* Fields */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
          <input
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="e.g. Network Refresh – Acme Corp"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Client *</label>
          <AutotaskCompanyPicker
            value={client}
            crmId={crmCompanyId}
            onChange={(name, id) => { setClient(name); setCrmCompanyId(id); }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
          <select
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={currency}
            onChange={e => setCurrency(e.target.value as Currency)}
          >
            <option value="GBP">GBP £</option>
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!projectName.trim() || !client.trim()}>
          Create Proposal
        </Button>
      </div>
    </Modal>
  );
}
