import { calcTotals } from './totals';
import { requiredReviews } from '../config/approvals';
import type { Proposal, RateCard } from '../types';

export interface ExportBlocker {
  review: string;
  reason: string;
}

export function getExportBlockers(proposal: Proposal, rateCards?: RateCard[], discountFloor = 10): ExportBlocker[] {
  const totals = calcTotals(proposal, rateCards);
  // GP = grandTotal - total cost (parts + consultancy including PM)
  const gp = totals.grandTotal - totals.partsCost - totals.consultancyCost;
  const reviewsNeeded = requiredReviews(gp);
  const blockers: ExportBlocker[] = [];

  for (const r of reviewsNeeded) {
    if (r.key === 'trb') {
      const status = proposal.trbStatus ?? 'pending';
      if (status === 'stale') {
        blockers.push({ review: r.label, reason: 'Proposal was modified after TRB approval — re-review required before export' });
      } else if (status !== 'approved' && status !== 'waived') {
        blockers.push({ review: r.label, reason: 'TRB review must be approved or waived before export' });
      }
    }
    if (r.key === 'fiveK') {
      const status = proposal.fiveKStatus ?? 'pending';
      if (status === 'stale') {
        blockers.push({ review: r.label, reason: 'Proposal was modified after 5K review completion — re-review required before export' });
      } else if (status !== 'complete' && status !== 'waived') {
        blockers.push({ review: r.label, reason: '5K review must be complete or waived before export' });
      }
    }
  }

  // Discount approval check
  if (proposal.markupPct < discountFloor) {
    const ds = proposal.discountStatus;
    if (!ds || ds === 'pending' || ds === 'stale') {
      const reason = ds === 'stale'
        ? `Markup changed after discount approval — re-approval required before export`
        : `Markup (${proposal.markupPct}%) is below the ${discountFloor}% floor — discount approval required before export`;
      blockers.push({ review: 'Discount Approval', reason });
    }
  }

  return blockers;
}
