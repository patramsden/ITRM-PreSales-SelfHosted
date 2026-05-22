import { Calendar, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { Proposal } from '../../types';
import clsx from 'clsx';

interface Props { proposal: Proposal }

export function ProposalExpiryBanner({ proposal }: Props) {
  const [expanded, setExpanded] = useState(true);
  if (!proposal.expiresAt) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(proposal.expiresAt);
  const msLeft = expiry.getTime() - today.getTime();
  const daysLeft = Math.ceil(msLeft / 86400000);

  if (daysLeft > 7) return null;  // still plenty of time

  const expired = daysLeft < 0;
  const border = expired
    ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
    : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20';
  const msg = expired
    ? `This proposal expired on ${expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} (${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago). Pricing may be out of date.`
    : daysLeft === 0
      ? 'This proposal expires today.'
      : `This proposal expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}).`;

  return (
    <div className={clsx('border-b-2 transition-colors', border)}>
      <div
        className="flex items-center gap-3 px-8 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {expired
          ? <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          : <Calendar size={18} className="text-amber-500 flex-shrink-0" />}
        <div className="flex-1">
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            {expired ? 'Proposal Expired' : 'Proposal Expiring Soon'}
          </span>
          <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">{msg}</span>
        </div>
        {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </div>
      {expanded && (
        <div className="px-8 pb-3 text-xs text-gray-600 dark:text-slate-400">
          Update the <strong>Proposal Expires</strong> date in the Summary tab to extend the validity period,
          or export and re-issue the proposal to the client with fresh pricing.
        </div>
      )}
    </div>
  );
}
