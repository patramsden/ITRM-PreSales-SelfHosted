import { useState, useCallback, useEffect } from 'react';
import { UserPlus, X, RefreshCw, CheckCircle2, AlertCircle, Loader2, ExternalLink, Ticket } from 'lucide-react';
import type { Proposal } from '../../../types';
import { useAuth, isPresalesAdmin } from '../../../contexts/AuthContext';
import { useStore } from '../../../store';
import { Button } from '../../ui/Button';
import { AutotaskCompanyPicker, AutotaskContactPicker } from '../../crm/AutotaskPicker';
import { RichTextEditor } from '../../ui/RichTextEditor';
import { crmApi } from '../../../lib/api';
import type { CrmTicket, CrmCompanyAddress } from '../../../lib/api';
import type { ProposalStatus, Currency } from '../../../types';

type AmLookupState = 'idle' | 'loading' | 'found' | 'not_found' | 'error';
type AmErrorState = { state: AmLookupState; message?: string };

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

const STATUSES: ProposalStatus[] = ['New', 'In Progress', 'Waiting Approval', 'Approved', 'Sent to Customer', 'Won', 'Lost'];
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
  const [amStatus, setAmStatus] = useState<AmErrorState>({ state: 'idle' });

  const lookupAccountManager = useCallback(async (crmId: string, clientName: string) => {
    const companyId = parseInt(crmId);
    if (isNaN(companyId)) return;
    setAmStatus({ state: 'loading' });
    try {
      const result = await crmApi.getAccountManager(companyId) as { name: string | null; contactId: number | null; _debug?: string };
      if (result._debug) console.warn('[AM lookup]', result._debug);
      if (result.name) {
        onUpdate({ accountManager: result.name, client: clientName, crmCompanyId: crmId });
        setAmStatus({ state: 'found' });
      } else {
        const hint = result._debug ? ` (${result._debug})` : '';
        setAmStatus({ state: 'not_found', message: `No account manager field found in Autotask response.${hint}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CRM lookup failed';
      setAmStatus({ state: 'error', message: msg });
    }
  }, [onUpdate]);

  const lookupCompanyAddress = useCallback(async (crmId: string) => {
    const companyId = parseInt(crmId);
    if (isNaN(companyId)) return;
    try {
      const addr = await crmApi.getCompanyAddress(companyId) as CrmCompanyAddress;
      const parts = [addr.address1, addr.address2, addr.city, addr.state, addr.postalCode, addr.country]
        .filter(Boolean);
      if (parts.length > 0) {
        onUpdate({ clientAddress: parts.join('\n') });
      }
    } catch { /* address fetch is best-effort */ }
  }, [onUpdate]);

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

  // ── Auto-refresh AM + address from CRM on load ────────────────────────────
  const crmId = proposal.crmCompanyId;

  useEffect(() => {
    if (!crmId || !editable) return;
    const id = parseInt(crmId);
    if (isNaN(id)) return;

    // Refresh account manager silently — only update if CRM returns something different
    crmApi.getAccountManager(id)
      .then((result: { name: string | null }) => {
        if (result.name && result.name !== proposal.accountManager) {
          onUpdate({ accountManager: result.name });
        }
      })
      .catch(() => {});

    // Refresh address silently — only update if CRM returns something different
    crmApi.getCompanyAddress(id)
      .then((addr: CrmCompanyAddress) => {
        const newAddr = [addr.address1, addr.address2, addr.city, addr.state, addr.postalCode, addr.country]
          .filter(Boolean).join('\n');
        if (newAddr && newAddr !== proposal.clientAddress) {
          onUpdate({ clientAddress: newAddr });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmId, editable]);

  // ── Customer intelligence (open tickets) ──────────────────────────────────
  const [tickets, setTickets]           = useState<CrmTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError]   = useState<string | null>(null);

  const loadTickets = useCallback(async (companyId: string) => {
    const id = parseInt(companyId);
    if (isNaN(id)) return;
    setTicketsLoading(true); setTicketsError(null);
    try {
      const data = await crmApi.getTickets(id);
      // Handle both array response and {tickets, _debug} shape
      const arr = Array.isArray(data) ? data : (data as { tickets?: CrmTicket[] }).tickets ?? [];
      setTickets(arr);
    } catch (e) {
      setTicketsError(e instanceof Error ? e.message : 'Could not load tickets from Autotask.');
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (crmId) loadTickets(crmId);
    else setTickets([]);
  }, [crmId, loadTickets]);

  const QUEUE_COLORS: Record<string, string> = {
    'account management': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    'pre-sales':          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'post-sale':          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
  const queueColor = (q: string) => {
    const key = Object.keys(QUEUE_COLORS).find(k => q.toLowerCase().includes(k));
    return key ? QUEUE_COLORS[key] : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
  };

  return (
    <div className={crmId ? 'flex gap-6 items-start' : 'max-w-4xl space-y-8'}>
      {/* ── Left column — all existing content ─────────────────────────── */}
      <div className={crmId ? 'flex-1 min-w-0 space-y-8' : 'space-y-8'}>
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
                onChange={(name, id) => {
                  onUpdate({ client: name, crmCompanyId: id });
                  setAmStatus({ state: 'idle' });
                  if (id) {
                    lookupAccountManager(id, name);
                    lookupCompanyAddress(id);
                  }
                }}
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
                onChange={(name, email) => onUpdate({ clientContact: name, clientContactEmail: email ?? proposal.clientContactEmail })}
              />
            ) : (
              <TextInput value={proposal.clientContact ?? ''} onChange={() => {}} disabled placeholder="—" />
            )}
          </Field>
          <Field label="Contact Email">
            <TextInput
              value={proposal.clientContactEmail ?? ''}
              onChange={v => onUpdate({ clientContactEmail: v })}
              disabled={!editable}
              placeholder="contact@client.com"
            />
          </Field>
          <Field label="Account Manager">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TextInput
                  value={proposal.accountManager}
                  onChange={v => onUpdate({ accountManager: v })}
                  disabled={!editable}
                  placeholder={amStatus.state === 'loading' ? 'Looking up…' : 'Name'}
                />
                {/* Manual retry — only shown when a CRM company is linked */}
                {editable && proposal.crmCompanyId && amStatus.state !== 'loading' && (
                  <button
                    type="button"
                    onClick={() => lookupAccountManager(proposal.crmCompanyId!, proposal.client)}
                    className="flex-shrink-0 p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-400 transition-colors"
                    title="Re-fetch account manager from CRM"
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
                {amStatus.state === 'loading' && (
                  <Loader2 size={16} className="flex-shrink-0 animate-spin text-brand-500" />
                )}
              </div>
              {/* Inline status feedback */}
              {amStatus.state === 'found' && (
                <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 size={11} /> Set from CRM
                </p>
              )}
              {amStatus.state === 'not_found' && (
                <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle size={11} /> {amStatus.message}
                </p>
              )}
              {amStatus.state === 'error' && (
                <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle size={11} /> {amStatus.message}
                </p>
              )}
            </div>
          </Field>
          <div className="col-span-2 space-y-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Description</label>
            <textarea
              value={proposal.description ?? ''}
              onChange={e => onUpdate({ description: e.target.value })}
              disabled={!editable}
              rows={3}
              placeholder="Brief description of the proposal…"
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 resize-y"
            />
          </div>
          <Field label="Ticket Reference">
            <TextInput value={proposal.ticketRef ?? ''} onChange={v => onUpdate({ ticketRef: v })} disabled={!editable} placeholder="e.g. CRM-1042" />
          </Field>
          <Field label="Autotask Opportunity">
            {proposal.atOpportunityId ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-mono">
                  #{proposal.atOpportunityId}
                </span>
                {proposal.atOpportunityUrl && (
                  <a
                    href={proposal.atOpportunityUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in Autotask"
                    className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ) : (
              <span className="block border border-dashed border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-400 dark:text-slate-500">
                Not yet created — link a CRM company and click Save
              </span>
            )}
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
          <Field label="Proposal Expires">
            <input
              type="date"
              value={proposal.expiresAt ?? ''}
              onChange={e => onUpdate({ expiresAt: e.target.value || undefined })}
              disabled={!editable}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400"
            />
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
          <div className="col-span-2">
            <Field label="Client Address">
              <textarea
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 resize-none"
                value={proposal.clientAddress ?? ''}
                onChange={e => onUpdate({ clientAddress: e.target.value })}
                disabled={!editable}
                rows={3}
                placeholder={editable ? 'Auto-filled from CRM when a company is linked, or type manually…' : '—'}
              />
            </Field>
          </div>
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
              <RichTextEditor
                value={(proposal[field] as string) ?? ''}
                onChange={v => onUpdate({ [field]: v })}
                disabled={!editable}
                minimal
                minHeight="7rem"
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
      </div>{/* end left column */}

      {/* ── Right column — customer intelligence ───────────────────────── */}
      {crmId && (
        <div className="w-80 shrink-0 space-y-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Ticket size={14} className="text-brand-500" />
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Open Tickets</span>
              </div>
              <button
                onClick={() => loadTickets(crmId)}
                disabled={ticketsLoading}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={12} className={ticketsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {ticketsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            )}

            {ticketsError && !ticketsLoading && (
              <div className="px-4 py-3 text-xs text-red-500 dark:text-red-400 flex items-center gap-2">
                <AlertCircle size={12} className="shrink-0" />
                {ticketsError}
              </div>
            )}

            {!ticketsLoading && !ticketsError && tickets.length === 0 && (
              <div className="px-4 py-6 text-xs text-center text-gray-400 dark:text-slate-500">
                No open tickets found in the tracked queues.
              </div>
            )}

            {!ticketsLoading && tickets.length > 0 && (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {tickets.map(t => {
                  const ref = t.ticketNumber ?? String(t.id);
                  const alreadySet = proposal.ticketRef === ref;
                  return (
                    <div key={t.id} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                      {/* Title row — clickable link to Autotask */}
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start justify-between gap-2 group"
                      >
                        <span className="text-xs font-medium text-gray-800 dark:text-slate-200 leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-400 line-clamp-2">
                          {t.title}
                        </span>
                        <ExternalLink size={10} className="text-gray-300 dark:text-slate-600 group-hover:text-brand-400 shrink-0 mt-0.5" />
                      </a>
                      {/* Meta row */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {t.ticketNumber && (
                          <span className="text-xs font-mono text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {t.ticketNumber}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${queueColor(t.queue)}`}>
                          {t.queue.split(':').pop()?.trim() ?? t.queue}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">{t.status}</span>
                        {t.createDate && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            {new Date(t.createDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                        {/* Use as Ref button */}
                        {editable && (
                          <button
                            onClick={() => onUpdate({ ticketRef: alreadySet ? '' : ref })}
                            title={alreadySet ? 'Clear ticket ref' : `Set ticket ref to ${ref}`}
                            className={`ml-auto text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                              alreadySet
                                ? 'bg-brand-50 border-brand-300 text-brand-600 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-400'
                                : 'border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400'
                            }`}
                          >
                            {alreadySet ? '✓ In use' : 'Use as Ref'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700">
              <p className="text-xs text-gray-400 dark:text-slate-500">
                SAL: Account Management · CON: Pre-Sales · CON: Post-Sale
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
