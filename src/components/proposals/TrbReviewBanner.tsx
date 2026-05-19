import { useState } from 'react';
import { ShieldCheck, ShieldX, MessageSquare, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { Proposal } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  onUpdate: (updates: Partial<Proposal>) => void;
}

export function TrbReviewBanner({ proposal, onUpdate }: Props) {
  const { currentUser } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const status = proposal.trbStatus;

  // Only show when review is in flight or has a decision
  if (!status || status === 'pending' || status === 'waived') return null;

  const isDecided = status === 'approved' || status === 'rejected';

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    setSubmitting(true);
    // Brief delay to feel deliberate
    await new Promise(r => setTimeout(r, 400));
    onUpdate({
      trbStatus: decision,
      trbReviewNotes: notes.trim() || undefined,
      trbReviewedBy: currentUser?.name ?? 'Unknown',
      trbReviewedAt: new Date().toISOString(),
    });
    setSubmitting(false);
  };

  const bannerColor = {
    sent:     'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20',
    approved: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20',
    rejected: 'border-red-300  bg-red-50   dark:border-red-700   dark:bg-red-900/20',
    pending:  '',
    waived:   '',
  }[status] ?? 'border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800';

  const iconEl = {
    sent:     <Clock size={18} className="text-amber-500 flex-shrink-0" />,
    approved: <ShieldCheck size={18} className="text-green-600 flex-shrink-0" />,
    rejected: <ShieldX size={18} className="text-red-500 flex-shrink-0" />,
    pending:  null,
    waived:   null,
  }[status];

  const headingText = {
    sent:     'TRB Review Pending',
    approved: 'TRB Approved',
    rejected: 'TRB Rejected',
    pending:  '',
    waived:   '',
  }[status];

  const subText = {
    sent:     'This proposal has been sent to the TRB for review. Use the form below to record your decision.',
    approved: `Approved by ${proposal.trbReviewedBy ?? 'reviewer'} on ${proposal.trbReviewedAt ? new Date(proposal.trbReviewedAt).toLocaleDateString('en-GB') : '—'}`,
    rejected: `Rejected by ${proposal.trbReviewedBy ?? 'reviewer'} on ${proposal.trbReviewedAt ? new Date(proposal.trbReviewedAt).toLocaleDateString('en-GB') : '—'}`,
    pending:  '',
    waived:   '',
  }[status];

  return (
    <div className={clsx('border-b-2 transition-colors', bannerColor)}>
      {/* Banner header row */}
      <div
        className="flex items-center gap-3 px-8 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {iconEl}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{headingText}</span>
          <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">{subText}</span>
        </div>
        {expanded
          ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />
        }
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-8 pb-5 pt-1">
          {/* Decision form — only when still awaiting response */}
          {status === 'sent' && (
            <div className="bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-xl p-5 max-w-3xl space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-300">
                <MessageSquare size={15} className="text-amber-500" />
                Submit your TRB decision
              </div>

              {/* Proposal summary at-a-glance */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-xs">
                <div><span className="text-gray-400 dark:text-slate-500 block">Project</span><span className="font-medium text-gray-800 dark:text-slate-200">{proposal.projectName}</span></div>
                <div><span className="text-gray-400 dark:text-slate-500 block">Client</span><span className="font-medium text-gray-800 dark:text-slate-200">{proposal.client}</span></div>
                <div><span className="text-gray-400 dark:text-slate-500 block">Account Manager</span><span className="font-medium text-gray-800 dark:text-slate-200">{proposal.accountManager || 'TBC'}</span></div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                  Review notes <span className="text-gray-400 font-normal">(required for rejection, optional for approval)</span>
                </label>
                <textarea
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  rows={3}
                  placeholder="Add any conditions, concerns, or confirmation of approval…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              {/* Decision buttons */}
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={() => handleDecision('approved')}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 focus:ring-green-500 text-white border-0"
                >
                  <ShieldCheck size={15} />
                  Approve
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDecision('rejected')}
                  disabled={submitting || !notes.trim()}
                  title={!notes.trim() ? 'Notes are required to reject' : undefined}
                >
                  <ShieldX size={15} />
                  Reject
                </Button>
                {!notes.trim() && (
                  <span className="text-xs text-gray-400">Add notes to enable rejection</span>
                )}
              </div>
            </div>
          )}

          {/* Outcome display — after decision */}
          {isDecided && (
            <div className={clsx(
              'max-w-3xl rounded-xl p-5 border',
              status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            )}>
              <div className="flex items-start gap-3">
                {status === 'approved'
                  ? <ShieldCheck size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
                  : <ShieldX size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                }
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-900">
                    {status === 'approved' ? 'TRB Approved' : 'TRB Rejected'}
                  </div>
                  <div className="text-xs text-gray-500">
                    By <span className="font-medium text-gray-700">{proposal.trbReviewedBy}</span>
                    {' · '}
                    {proposal.trbReviewedAt ? new Date(proposal.trbReviewedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                  </div>
                  {proposal.trbReviewNotes && (
                    <div className="mt-2 text-sm text-gray-700 dark:text-slate-300 bg-white/70 dark:bg-slate-700/70 rounded-lg px-3 py-2 border border-white dark:border-slate-600">
                      "{proposal.trbReviewNotes}"
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
