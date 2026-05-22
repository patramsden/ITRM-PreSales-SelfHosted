import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { Proposal } from '../../types';
import { Button } from '../ui/Button';
import clsx from 'clsx';

const WON_REASONS  = ['Price / Value', 'Relationship', 'Technical fit', 'Speed to deliver', 'Other'] as const;
const LOST_REASONS = ['Price', 'Competitor', 'Timing', 'Budget', 'Technical fit', 'No decision', 'Other'] as const;

export interface WonLostData {
  wonLostReason: string;
  competitorName: string;
  wonLostNote: string;
}

interface Props {
  status: 'Won' | 'Lost';
  onConfirm: (data: WonLostData) => void;
  onCancel: () => void;
}

export function WonLostModal({ status, onConfirm, onCancel }: Props) {
  const isWon = status === 'Won';
  const reasons = isWon ? WON_REASONS : LOST_REASONS;
  const [reason, setReason]     = useState('');
  const [competitor, setCompetitor] = useState('');
  const [note, setNote]         = useState('');

  const handleConfirm = () => {
    onConfirm({ wonLostReason: reason, competitorName: competitor, wonLostNote: note });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          {isWon
            ? <CheckCircle size={22} className="text-green-600 flex-shrink-0" />
            : <XCircle    size={22} className="text-red-500 flex-shrink-0" />}
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
            Mark as {status}
          </h2>
        </div>

        <p className="text-sm text-gray-500 dark:text-slate-400">
          {isWon
            ? "Great news! Record the primary reason for winning this deal."
            : "Record why this deal was lost to help improve future proposals."}
        </p>

        {/* Reason dropdown */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            Primary Reason {!isWon && <span className="text-red-400">*</span>}
          </label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">— Select reason —</option>
            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Competitor */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            Competitor {isWon ? '(if applicable)' : '(if known)'}
          </label>
          <input
            type="text"
            value={competitor}
            onChange={e => setCompetitor(e.target.value)}
            placeholder={isWon ? 'Who else was in the running?' : 'Who did you lose to?'}
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            Notes (optional)
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={isWon ? 'What made the difference?' : 'Any additional context…'}
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!isWon && !reason}
            className={clsx(isWon ? 'bg-green-600 hover:bg-green-700 text-white border-0' : 'bg-red-600 hover:bg-red-700 text-white border-0')}
          >
            {isWon ? '🏆 Mark as Won' : 'Mark as Lost'}
          </Button>
        </div>
      </div>
    </div>
  );
}
