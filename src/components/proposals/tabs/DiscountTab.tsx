import { AlertTriangle, CheckCircle, Info, Percent, PoundSterling, X } from 'lucide-react';
import type { Proposal } from '../../../types';
import { calcTotals } from '../../../utils/totals';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

const TRB_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Required — not yet sent',    color: 'text-amber-600 dark:text-amber-400' },
  sent:     { label: 'Sent — awaiting response',   color: 'text-blue-600 dark:text-blue-400' },
  approved: { label: 'Approved',                   color: 'text-emerald-600 dark:text-emerald-400' },
  waived:   { label: 'Waived',                     color: 'text-gray-500 dark:text-slate-400' },
  rejected: { label: 'Rejected',                   color: 'text-red-600 dark:text-red-400' },
  stale:    { label: 'Re-review required',         color: 'text-orange-600 dark:text-orange-400' },
};

export function DiscountTab({ proposal, editable, onUpdate }: Props) {
  const totals = calcTotals(proposal);
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const discountType   = proposal.consultancyDiscountType   ?? 'percentage';
  const discountAmount = proposal.consultancyDiscountAmount ?? 0;
  const discountNote   = proposal.consultancyDiscountNote   ?? '';
  const hasDiscount    = discountAmount > 0;

  const trbInfo = proposal.trbStatus ? TRB_LABEL[proposal.trbStatus] : TRB_LABEL['pending'];

  const handleTypeChange = (type: 'monetary' | 'percentage') => {
    onUpdate({ consultancyDiscountType: type, consultancyDiscountAmount: 0 });
  };

  const handleAmountChange = (raw: string) => {
    const v = parseFloat(raw);
    onUpdate({ consultancyDiscountAmount: isNaN(v) || v < 0 ? 0 : v });
  };

  const handleClear = () => {
    onUpdate({ consultancyDiscountAmount: 0, consultancyDiscountNote: '' });
  };

  const consultancyLabel = totals.consultancySell > 0
    ? fmt(totals.consultancySell)
    : '—';

  return (
    <div className="max-w-2xl space-y-6">

      {/* Policy notice */}
      <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <Info size={16} className="mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Discount policy: </span>
          Discounts apply to consultancy only — hardware and software list prices are fixed. Any discount, regardless of size, requires a <strong>TRB review</strong> before the proposal can be exported or shared.
        </div>
      </div>

      {/* Consultancy baseline */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Consultancy Sell Price (baseline)</h3>
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{consultancyLabel}</div>
          {totals.consultancySell === 0 && (
            <span className="text-xs text-gray-400 dark:text-slate-500">No consultancy added yet</span>
          )}
        </div>

        {/* Discount type selector */}
        <div className="flex gap-3">
          <button
            onClick={() => editable && handleTypeChange('percentage')}
            disabled={!editable}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
              discountType === 'percentage'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-brand-400',
              !editable && 'opacity-60 cursor-not-allowed',
            )}
          >
            <Percent size={14} />
            Percentage (%)
          </button>
          <button
            onClick={() => editable && handleTypeChange('monetary')}
            disabled={!editable}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
              discountType === 'monetary'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-brand-400',
              !editable && 'opacity-60 cursor-not-allowed',
            )}
          >
            <PoundSterling size={14} />
            Monetary (£)
          </button>
        </div>

        {/* Amount input */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            Discount Amount {discountType === 'percentage' ? '(%)' : '(£)'}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-sm font-medium pointer-events-none">
                {discountType === 'percentage' ? '%' : '£'}
              </span>
              <input
                type="number"
                min={0}
                max={discountType === 'percentage' ? 100 : undefined}
                step={discountType === 'percentage' ? 1 : 0.01}
                value={discountAmount || ''}
                onChange={e => handleAmountChange(e.target.value)}
                disabled={!editable || totals.consultancySell === 0}
                placeholder="0"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
              />
            </div>
            {hasDiscount && editable && (
              <button
                onClick={handleClear}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove discount"
              >
                <X size={15} />
              </button>
            )}
          </div>
          {discountType === 'percentage' && discountAmount > 100 && (
            <p className="text-xs text-red-500 mt-1">Percentage cannot exceed 100%</p>
          )}
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            Discount Reason / Note <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={discountNote}
            onChange={e => onUpdate({ consultancyDiscountNote: e.target.value })}
            disabled={!editable}
            placeholder="e.g. Agreed at negotiation — competitive situation"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 resize-none"
          />
        </div>
      </div>

      {/* Impact summary */}
      {hasDiscount && totals.consultancySell > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Impact Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-400">Consultancy (list price)</span>
              <span className="text-gray-900 dark:text-slate-100 font-medium">{fmt(totals.consultancySell)}</span>
            </div>
            <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
              <span>
                Discount ({discountType === 'percentage'
                  ? `${discountAmount}%`
                  : fmt(discountAmount)})
              </span>
              <span>−{fmt(totals.consultancyDiscountValue)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-gray-200 dark:border-slate-700 pt-2">
              <span className="text-gray-900 dark:text-slate-100">Consultancy after discount</span>
              <span className="text-emerald-600 dark:text-emerald-400">{fmt(totals.consultancyDiscountedSell)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-gray-200 dark:border-slate-700 pt-2">
              <span className="text-gray-900 dark:text-slate-100">Grand total (incl. discount)</span>
              <span className="text-gray-900 dark:text-slate-100">{fmt(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* TRB requirement notice */}
      {hasDiscount && (
        <div className={clsx(
          'flex gap-3 rounded-xl border px-4 py-3 text-sm',
          (proposal.trbStatus === 'approved' || proposal.trbStatus === 'waived')
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        )}>
          {(proposal.trbStatus === 'approved' || proposal.trbStatus === 'waived')
            ? <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          }
          <div>
            <div className="font-semibold text-gray-900 dark:text-slate-100">TRB Review</div>
            <div className={clsx('text-xs mt-0.5', trbInfo.color)}>
              {trbInfo.label}
            </div>
            {proposal.trbStatus !== 'approved' && proposal.trbStatus !== 'waived' && (
              <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Go to the <strong>Approvals</strong> tab to manage the TRB review process.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
