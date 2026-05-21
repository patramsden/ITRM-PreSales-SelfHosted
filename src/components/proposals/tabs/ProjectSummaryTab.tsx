import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import type { Proposal } from '../../../types';
import { useAuth, isPresalesAdmin } from '../../../contexts/AuthContext';
import { useStore } from '../../../store';
import { Button } from '../../ui/Button';
import { AutotaskCompanyPicker, AutotaskContactPicker } from '../../crm/AutotaskPicker';
import type { ProposalStatus, Currency } from '../../../types';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

const STATUSES: ProposalStatus[] = ['Draft', 'In Progress', 'Approved', 'With Account Manager', 'Won', 'Lost'];
const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, disabled, placeholder }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return (
    <input
      className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}

function TextArea({ value, onChange, disabled, rows = 3, placeholder }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number; placeholder?: string;
}) {
  return (
    <textarea
      className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 resize-none"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      placeholder={placeholder}
    />
  );
}

export function ProjectSummaryTab({ proposal, editable, onUpdate }: Props) {
  const { currentUser } = useAuth();
  const users = useStore(s => s.users);
  const [collabSearch, setCollabSearch] = useState('');

  const owner = users.find(u => u.id === proposal.ownerId);
  const collaborators = users.filter(u => proposal.collaboratorIds.includes(u.id));

  const canManageCollabs = editable && (
    proposal.ownerId === currentUser?.id || isPresalesAdmin(currentUser)
  );

  const searchResults = collabSearch.trim()
    ? users.filter(u =>
        !proposal.collaboratorIds.includes(u.id) &&
        u.id !== proposal.ownerId &&
        (u.name.toLowerCase().includes(collabSearch.toLowerCase()) ||
         u.email.toLowerCase().includes(collabSearch.toLowerCase()))
      )
    : [];

  const addCollab = (userId: string) => {
    onUpdate({ collaboratorIds: [...proposal.collaboratorIds, userId] });
    setCollabSearch('');
  };

  const removeCollab = (userId: string) => {
    onUpdate({ collaboratorIds: proposal.collaboratorIds.filter(id => id !== userId) });
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Headline fields */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-5">Project Details</h2>
        <div className="grid grid-cols-2 gap-5">
          <Field label="Project Name">
            <TextInput value={proposal.projectName} onChange={v => onUpdate({ projectName: v })} disabled={!editable} />
          </Field>
          <Field label="Client">
            {editable ? (
              <AutotaskCompanyPicker
                value={proposal.client}
                crmId={proposal.crmCompanyId}
                onChange={(name, id) => onUpdate({ client: name, crmCompanyId: id })}
                placeholder="Search Autotask or type client name…"
              />
            ) : (
              <TextInput value={proposal.client} onChange={() => {}} disabled />
            )}
          </Field>
          <Field label="Client Contact">
            {editable ? (
              <AutotaskContactPicker
                value={proposal.clientContact ?? ''}
                crmCompanyId={proposal.crmCompanyId}
                onChange={v => onUpdate({ clientContact: v })}
              />
            ) : (
              <TextInput value={proposal.clientContact ?? ''} onChange={() => {}} disabled placeholder="—" />
            )}
          </Field>
          <Field label="Account Manager">
            <TextInput value={proposal.accountManager} onChange={v => onUpdate({ accountManager: v })} disabled={!editable} placeholder="Name" />
          </Field>
          <Field label="Ticket Reference">
            <TextInput value={proposal.ticketRef ?? ''} onChange={v => onUpdate({ ticketRef: v })} disabled={!editable} placeholder="e.g. CRM-1042" />
          </Field>
          <Field label="Status">
            <select
              value={proposal.status}
              onChange={e => onUpdate({ status: e.target.value as ProposalStatus })}
              disabled={!editable}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500"
            >
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select
              value={proposal.currency}
              onChange={e => onUpdate({ currency: e.target.value as Currency })}
              disabled={!editable}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500"
            >
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Date of Proposal">
            <TextInput value={proposal.dateCreated} onChange={v => onUpdate({ dateCreated: v })} disabled={!editable} />
          </Field>
          <Field label="Markup %">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500"
              value={proposal.markupPct}
              onChange={e => onUpdate({ markupPct: parseFloat(e.target.value) || 0 })}
              disabled={!editable}
            />
          </Field>
        </div>
      </div>

      {/* Narrative */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-5">Narrative</h2>
        <div className="space-y-4">
          {([
            ['objectives', 'Objectives',
              `Describe the high-level business goals this project is intended to achieve. Consider:\n• What does success look like for the client?\n• How does this align with their wider IT or business strategy?\n• What key outcomes or improvements are they expecting?\n• Are there any strategic drivers (growth, compliance, modernisation)?`],
            ['businessRequirements', 'Business Requirements',
              `List the specific, measurable requirements the solution must satisfy. Consider:\n• Functional requirements — what must the solution do?\n• Performance / availability / capacity targets (e.g. 99.9% uptime, <2s response)\n• Compliance, regulatory or security requirements (ISO 27001, Cyber Essentials, GDPR)\n• Integration requirements with existing systems or third parties\n• User or operational requirements`],
            ['justification', 'Justification',
              `Make the business case for this investment. Consider:\n• What problem is being solved or opportunity being addressed?\n• What is the cost or risk of doing nothing?\n• What are the expected business benefits — ROI, productivity gains, risk reduction?\n• Have alternatives been considered and why is this the preferred approach?\n• Are there any quick wins or phased benefits?`],
            ['constraints', 'Constraints',
              `Document any limitations that affect the solution or its delivery. Consider:\n• Budget ceiling or approved funding envelope\n• Hard deadlines or go-live dates (regulatory, contractual, business events)\n• Technical constraints — existing platforms, legacy systems, standards to comply with\n• Client-side resource or staffing limitations during the project\n• Procurement, legal or approval processes that must be followed`],
            ['assumptions', 'Assumptions',
              `State what we are taking as true for the purposes of this proposal. Consider:\n• Client will provide timely access to systems, environments and key stakeholders\n• Existing infrastructure meets the minimum baseline requirements\n• Scope does not include items not explicitly listed in this proposal\n• Third-party licences, services or dependencies will be available as expected\n• Pricing is based on current vendor rate cards and is valid for 30 days\n• Any deviations from these assumptions may require a change request`],
            ['notes', 'Notes',
              `Internal presales notes — not included in client-facing outputs. Consider:\n• Key stakeholders, their priorities and any political considerations\n• Incumbent vendors or competitor landscape\n• Pricing sensitivity or budget pressure indicators\n• Special commercial terms, discounting or approval requirements\n• Outstanding actions, open questions or next steps`],
          ] as [keyof Proposal, string, string][]).map(([field, label, placeholder]) => (
            <Field key={field} label={label}>
              <TextArea
                value={(proposal[field] as string) ?? ''}
                onChange={v => onUpdate({ [field]: v })}
                disabled={!editable}
                rows={5}
                placeholder={editable ? placeholder : undefined}
              />
            </Field>
          ))}
        </div>
      </div>

      {/* Collaborators */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Collaborators</h2>

        {/* Owner */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
            {owner?.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{owner?.name}</div>
            <div className="text-xs text-gray-400 dark:text-slate-500">Owner</div>
          </div>
        </div>

        {collaborators.map(u => (
          <div key={u.id} className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-gray-600 dark:text-slate-300 text-xs font-bold">
              {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{u.name}</div>
              <div className="text-xs text-gray-400 dark:text-slate-500">Collaborator</div>
            </div>
            {canManageCollabs && (
              <button onClick={() => removeCollab(u.id)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-red-500">
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        {canManageCollabs && (
          <div className="mt-4 relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <UserPlus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search company directory…"
                  value={collabSearch}
                  onChange={e => setCollabSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-10 overflow-hidden">
                {searchResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => addCollab(u.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-slate-300 flex-shrink-0">
                      {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{u.name}</div>
                      <div className="text-xs text-gray-400 dark:text-slate-500">{u.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
