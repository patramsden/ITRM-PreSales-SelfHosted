import { useState, useEffect } from 'react';
import {
  CheckCircle, XCircle, Clock, Users, FileText, CalendarDays,
  Copy, Check, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import type { Proposal } from '../../../types';
import { customerApi, type CustomerLink } from '../../../lib/api';
import { calcTotals } from '../../../utils/totals';
import { requiredReviews, REVIEW_THRESHOLDS } from '../../../config/approvals';
import { useStore } from '../../../store';
import { buildTrbMailtoUrl } from '../../../utils/mailtoUrl';
import { buildTeamsMeetingUrl, buildOutlookUrl } from '../../../utils/teamsUrl';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

// ─── Status config ────────────────────────────────────────────────────────────

const TRB_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:  { label: 'Required — not sent',       color: 'text-amber-700  bg-amber-50  border-amber-200',  dot: 'bg-amber-400'  },
  sent:     { label: 'Sent for review',            color: 'text-blue-700   bg-blue-50   border-blue-200',   dot: 'bg-blue-500'   },
  approved: { label: 'Approved',                   color: 'text-green-700  bg-green-50  border-green-200',  dot: 'bg-green-500'  },
  rejected: { label: 'Rejected',                   color: 'text-red-700    bg-red-50    border-red-200',    dot: 'bg-red-500'    },
  waived:   { label: 'Waived',                     color: 'text-gray-500   bg-gray-50   border-gray-200',   dot: 'bg-gray-400'   },
  stale:    { label: 'Re-review required',         color: 'text-orange-700 bg-orange-50 border-orange-300', dot: 'bg-orange-500' },
};

const FIVEK_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:  { label: 'Required — not booked',     color: 'text-amber-700  bg-amber-50  border-amber-200',  dot: 'bg-amber-400'  },
  booked:   { label: 'Meeting booked',             color: 'text-blue-700   bg-blue-50   border-blue-200',   dot: 'bg-blue-500'   },
  complete: { label: 'Review complete',            color: 'text-green-700  bg-green-50  border-green-200',  dot: 'bg-green-500'  },
  waived:   { label: 'Waived',                     color: 'text-gray-500   bg-gray-50   border-gray-200',   dot: 'bg-gray-400'   },
  stale:    { label: 'Re-review required',         color: 'text-orange-700 bg-orange-50 border-orange-300', dot: 'bg-orange-500' },
};

// ─── Customer decision section ────────────────────────────────────────────────

function CustomerDecisionSection({ proposal }: { proposal: Proposal }) {
  const [links, setLinks] = useState<CustomerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    customerApi.list(proposal.id)
      .then(setLinks)
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, [proposal.id]);

  const handleCopy = (token: string) => {
    const url = `${window.location.origin}/customer/${token}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB');
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
          <FileText size={18} className="text-violet-500" />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Customer Decision</div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            Customer sign-off links generated via the Share button.
          </div>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-8 text-center text-sm text-gray-400 dark:text-slate-500">Loading…</div>
      ) : links.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <AlertTriangle size={20} className="mx-auto mb-2 text-gray-300 dark:text-slate-600" />
          <div className="text-sm text-gray-400 dark:text-slate-500">
            No customer links created yet. Use the Share button to generate one.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-100 dark:border-slate-700">
                <th className="px-6 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Token</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Created</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Expires</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Details</th>
                <th className="px-6 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
              {links.map(link => {
                const statusBadge = link.approvalStatus === 'approved'
                  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"><CheckCircle size={11} /> Approved</span>
                  : link.approvalStatus === 'rejected'
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"><XCircle size={11} /> Rejected</span>
                    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"><Clock size={11} /> Pending</span>;

                return (
                  <tr key={link.token} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-3 text-sm font-mono text-gray-600 dark:text-slate-400">
                      {link.token.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400">{fmtDate(link.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400">
                      {link.expiresAt ? fmtDate(link.expiresAt) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">{statusBadge}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400">
                      {link.approvalStatus === 'pending' && (
                        <span className="text-gray-400 dark:text-slate-500 italic">Awaiting customer response</span>
                      )}
                      {(link.approvalStatus === 'approved' || link.approvalStatus === 'rejected') && (
                        <div className="space-y-0.5">
                          {link.signedByName && <div><span className="text-gray-400">By:</span> {link.signedByName}</div>}
                          {link.signedAt && <div><span className="text-gray-400">At:</span> {fmt(link.signedAt)}</div>}
                          {link.signerIp && <div><span className="text-gray-400">IP:</span> <span className="font-mono text-xs">{link.signerIp}</span></div>}
                          {link.signerNotes && <div><span className="text-gray-400">Notes:</span> <span className="italic">"{link.signerNotes}"</span></div>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {link.approvalStatus === 'pending' && (
                        <button
                          onClick={() => handleCopy(link.token)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500 transition-colors"
                          title="Copy customer link"
                        >
                          {copiedToken === link.token ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                          {copiedToken === link.token ? 'Copied' : 'Copy link'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Attendee tag input ───────────────────────────────────────────────────────

function AttendeeInput({
  attendees, editable, onChange,
}: { attendees: string[]; editable: boolean; onChange: (a: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !attendees.includes(trimmed)) {
      onChange([...attendees, trimmed]);
    }
    setInput('');
  };

  const remove = (name: string) => onChange(attendees.filter(a => a !== name));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(input);
    } else if (e.key === 'Backspace' && !input && attendees.length > 0) {
      remove(attendees[attendees.length - 1]);
    }
  };

  return (
    <div className={clsx(
      'flex flex-wrap gap-1.5 min-h-[38px] px-2 py-1.5 rounded-lg border bg-white dark:bg-slate-700',
      editable ? 'border-gray-300 dark:border-slate-600 focus-within:ring-2 focus-within:ring-brand-400 focus-within:border-brand-400' : 'border-gray-200 dark:border-slate-600',
    )}>
      {attendees.map(name => (
        <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full border border-blue-200 dark:border-blue-700">
          {name}
          {editable && (
            <button onClick={() => remove(name)} className="text-blue-400 hover:text-blue-600 ml-0.5">×</button>
          )}
        </span>
      ))}
      {editable && (
        <input
          type="text"
          className="flex-1 min-w-[120px] text-sm bg-transparent outline-none text-gray-700 dark:text-slate-200 placeholder:text-gray-300 dark:placeholder:text-slate-500"
          placeholder={attendees.length === 0 ? 'Type a name and press Enter…' : 'Add another…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) add(input); }}
        />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ApprovalsTab({ proposal, editable, onUpdate }: Props) {
  const { rateCards } = useStore();
  const totals = calcTotals(proposal, rateCards);
  const grossProfit = totals.grandTotal > 0 ? totals.grandTotal * totals.marginPct / 100 : 0;
  const required = requiredReviews(grossProfit);

  const [trbExpanded, setTrbExpanded] = useState(false);
  const [fiveKExpanded, setFiveKExpanded] = useState(false);
  const [trbEmail, setTrbEmail] = useState('');

  const trbThreshold  = REVIEW_THRESHOLDS.find(t => t.key === 'trb')!;
  const fiveKThreshold = REVIEW_THRESHOLDS.find(t => t.key === 'fiveK')!;

  const trbRequired   = required.some(r => r.key === 'trb');
  const fiveKRequired = required.some(r => r.key === 'fiveK');

  const trbStatus   = proposal.trbStatus   ?? 'pending';
  const fiveKStatus = proposal.fiveKStatus ?? 'pending';

  const fiveKAttendees  = proposal.fiveKAttendees ?? [];
  const fiveKNotes      = proposal.fiveKNotes ?? '';
  const fiveKMeetingDate = proposal.fiveKMeetingDate ?? '';

  const mailtoUrl  = buildTrbMailtoUrl(proposal, { to: trbEmail, from: '', grossProfit, grandTotal: totals.grandTotal });
  const teamsUrl   = buildTeamsMeetingUrl(proposal, fiveKThreshold);
  const outlookUrl = buildOutlookUrl(proposal, fiveKThreshold);

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── TRB Review ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div
          className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 select-none"
          onClick={() => setTrbExpanded(v => !v)}
        >
          <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', TRB_STATUS_CONFIG[trbStatus]?.dot ?? 'bg-gray-400')} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{trbThreshold.label}</div>
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              {trbRequired
                ? `Required — GP is above £${trbThreshold.minGP.toLocaleString()}`
                : `Not required — GP is below £${trbThreshold.minGP.toLocaleString()}`}
            </div>
          </div>
          <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0', TRB_STATUS_CONFIG[trbStatus]?.color ?? '')}>
            {TRB_STATUS_CONFIG[trbStatus]?.label ?? trbStatus}
          </span>
          {trbExpanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
        </div>

        {trbExpanded && (
          <div className="px-6 pb-5 pt-1 space-y-4 border-t border-gray-50 dark:border-slate-700">
            {!trbRequired && (
              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500 py-2">
                <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                Not required for this proposal.
              </div>
            )}

            {trbRequired && (
              <>
                <p className="text-xs text-gray-500 dark:text-slate-400">{trbThreshold.description}</p>

                {/* Stale — proposal changed after approval */}
                {trbStatus === 'stale' && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700">
                    <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                        Proposal modified after TRB approval
                      </div>
                      <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                        Commercial data (parts, consultancy, markup, or currency) has changed since this
                        proposal was approved by the TRB. The approval is no longer valid — the proposal
                        must be re-submitted for review before it can be exported.
                        {proposal.trbReviewedBy && (
                          <> The previous approval was recorded by <strong>{proposal.trbReviewedBy}</strong>
                          {proposal.trbReviewedAt && <> on {new Date(proposal.trbReviewedAt).toLocaleDateString('en-GB')}</>}.</>
                        )}
                      </p>
                      {editable && (
                        <button
                          onClick={() => onUpdate({ trbStatus: 'pending', trbApprovedFingerprint: undefined })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                        >
                          <RefreshCw size={12} />
                          Reset &amp; Re-initiate Review
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Reviewer info */}
                {(trbStatus === 'approved' || trbStatus === 'rejected') && (
                  <div className={clsx('flex items-start gap-3 p-4 rounded-xl border',
                    trbStatus === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
                    {trbStatus === 'approved'
                      ? <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                      : <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />}
                    <div className="text-sm space-y-1">
                      <div className="font-semibold text-gray-900 dark:text-slate-100 capitalize">{trbStatus}</div>
                      {proposal.trbReviewedBy && (
                        <div className="text-gray-700 dark:text-slate-300">
                          Reviewed by <span className="font-medium">{proposal.trbReviewedBy}</span>
                          {proposal.trbReviewedAt && (
                            <span className="text-gray-400 dark:text-slate-500"> · {new Date(proposal.trbReviewedAt).toLocaleDateString('en-GB')}</span>
                          )}
                        </div>
                      )}
                      {proposal.trbReviewNotes && (
                        <div className="text-gray-600 dark:text-slate-400 italic">"{proposal.trbReviewNotes}"</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Send for review */}
                {editable && trbStatus !== 'approved' && trbStatus !== 'rejected' && trbStatus !== 'waived' && trbStatus !== 'stale' && (
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Send for TRB Review</div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                        Opens your email client with a pre-filled message containing a direct link to this proposal.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        className="flex-1 border border-indigo-300 dark:border-indigo-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 placeholder:text-indigo-300 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="approver@company.com (optional)"
                        value={trbEmail}
                        onChange={e => setTrbEmail(e.target.value)}
                      />
                      <a
                        href={mailtoUrl}
                        onClick={() => { if (editable) onUpdate({ trbStatus: 'sent' }); }}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                      >
                        <ExternalLink size={13} /> Send Email
                      </a>
                    </div>
                  </div>
                )}

                {/* Status override */}
                {editable && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-slate-500">Override status:</span>
                    {(['pending', 'sent', 'approved', 'rejected', 'waived'] as const).map(s => (
                      <button key={s} onClick={() => onUpdate({ trbStatus: s })}
                        className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                          trbStatus === s ? TRB_STATUS_CONFIG[s].color : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-400 dark:hover:border-slate-500')}>
                        {TRB_STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 5K Review ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div
          className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 select-none"
          onClick={() => setFiveKExpanded(v => !v)}
        >
          <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', FIVEK_STATUS_CONFIG[fiveKStatus]?.dot ?? 'bg-gray-400')} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{fiveKThreshold.label}</div>
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              {fiveKRequired
                ? `Required — GP is above £${fiveKThreshold.minGP.toLocaleString()}`
                : `Not required — GP is below £${fiveKThreshold.minGP.toLocaleString()}`}
            </div>
          </div>
          <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0', FIVEK_STATUS_CONFIG[fiveKStatus]?.color ?? '')}>
            {FIVEK_STATUS_CONFIG[fiveKStatus]?.label ?? fiveKStatus}
          </span>
          {fiveKExpanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
        </div>

        {fiveKExpanded && (
          <div className="px-6 pb-5 pt-1 space-y-4 border-t border-gray-50 dark:border-slate-700">
            {!fiveKRequired && (
              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500 py-2">
                <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                Not required for this proposal.
              </div>
            )}

            {fiveKRequired && (
              <>
                <p className="text-xs text-gray-500 dark:text-slate-400">{fiveKThreshold.description}</p>

                {/* Stale — proposal changed after 5K completion */}
                {fiveKStatus === 'stale' && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700">
                    <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                        Proposal modified after 5K review
                      </div>
                      <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                        Commercial data has changed since the 5K review was completed. The review is no
                        longer valid — a new 5K review meeting must be held before this proposal can be exported.
                      </p>
                      {editable && (
                        <button
                          onClick={() => onUpdate({ fiveKStatus: 'pending', fiveKApprovedFingerprint: undefined })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                        >
                          <RefreshCw size={12} />
                          Reset &amp; Re-initiate Review
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Book meeting */}
                {fiveKStatus !== 'complete' && fiveKStatus !== 'waived' && fiveKStatus !== 'stale' && (
                  <div className="flex flex-wrap items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">Book via Microsoft Teams</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                        Opens a pre-filled {fiveKThreshold.durationMins}-minute meeting invite.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={teamsUrl} target="_blank" rel="noreferrer"
                        onClick={() => editable && fiveKStatus === 'pending' && onUpdate({ fiveKStatus: 'booked' })}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                        Book in Teams <ExternalLink size={12} className="opacity-70" />
                      </a>
                      <a href={outlookUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors">
                        Outlook <ExternalLink size={12} className="opacity-70" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Meeting date */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-slate-400">
                    <CalendarDays size={13} /> Meeting date
                  </label>
                  <input
                    type="date"
                    disabled={!editable}
                    value={fiveKMeetingDate}
                    onChange={e => onUpdate({ fiveKMeetingDate: e.target.value || undefined })}
                    className="border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>

                {/* Attendees */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-slate-400">
                    <Users size={13} /> Attendees
                  </label>
                  <AttendeeInput
                    attendees={fiveKAttendees}
                    editable={editable}
                    onChange={a => onUpdate({ fiveKAttendees: a })}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-slate-400">
                    <FileText size={13} /> Meeting notes
                  </label>
                  <textarea
                    rows={4}
                    disabled={!editable}
                    value={fiveKNotes}
                    onChange={e => onUpdate({ fiveKNotes: e.target.value || undefined })}
                    placeholder={editable ? 'Add meeting notes here…' : 'No notes recorded.'}
                    className="w-full border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 resize-y placeholder:text-gray-300 dark:placeholder:text-slate-500 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>

                {/* Status override */}
                {editable && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-slate-500">Update status:</span>
                    {(['pending', 'booked', 'complete', 'waived'] as const).map(s => (
                      <button key={s} onClick={() => onUpdate({ fiveKStatus: s })}
                        className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                          fiveKStatus === s ? FIVEK_STATUS_CONFIG[s].color : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-400 dark:hover:border-slate-500')}>
                        {FIVEK_STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Customer Decision ────────────────────────────────────────────── */}
      <CustomerDecisionSection proposal={proposal} />
    </div>
  );
}
