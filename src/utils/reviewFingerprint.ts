import type { Proposal } from '../types';

/**
 * Computes a stable fingerprint of the financially-relevant fields on a proposal.
 *
 * Used to detect whether commercial data has changed since a TRB or 5K review
 * was approved. Pure metadata changes (narrative text, status, client name,
 * collaborators, SoW, etc.) do NOT change the fingerprint and will NOT trigger
 * a re-review requirement.
 *
 * Fingerprinted fields:
 *   - parts: id, quantity, unitPrice, partType
 *   - phases/tasks: id, days, dayRate, rateMultiplier
 *   - markupPct
 *   - currency
 */
export function computeReviewFingerprint(proposal: Proposal): string {
  const data = {
    markupPct: proposal.markupPct,
    currency:  proposal.currency,
    parts: [...proposal.parts]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(p => ({
        id:    p.id,
        qty:   p.quantity,
        price: p.unitPrice,
        type:  p.partType ?? 'Hardware',
      })),
    phases: [...proposal.phases]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(ph => ({
        id: ph.id,
        tasks: [...ph.tasks]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(t => ({
            id:   t.id,
            days: t.days,
            rate: t.dayRate,
            mult: t.rateMultiplier ?? 1,
          })),
      })),
  };
  return JSON.stringify(data);
}

/** Returns true if the proposal's current financial data differs from the stored fingerprint. */
export function financiallyChangedSince(proposal: Proposal, storedFingerprint: string): boolean {
  return computeReviewFingerprint(proposal) !== storedFingerprint;
}
