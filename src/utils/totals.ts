import type { Proposal, ProposalTotals } from '../types';

export const PM_RATE = 0.20;

export function calcTotals(proposal: Proposal): ProposalTotals {
  let partsCost = 0;
  let partsSell = 0;

  for (const part of proposal.parts) {
    const selectedQuote = part.quotes.find(q => q.selected);
    const unitCost = selectedQuote ? selectedQuote.cost : part.unitCost;
    partsCost += unitCost * part.quantity;
    partsSell += part.unitPrice * part.quantity;
  }

  let consultancyCost = 0;
  let baseConsultancySell = 0;

  for (const phase of proposal.phases) {
    for (const task of phase.tasks) {
      const multiplier = task.rateMultiplier ?? 1;
      consultancyCost    += task.days * task.dayRate * 0.7 * multiplier;
      baseConsultancySell += task.days * task.dayRate * multiplier;
    }
  }

  const pmValue = baseConsultancySell * PM_RATE;
  const consultancySell = baseConsultancySell + pmValue;

  const markupAmount = partsSell * (proposal.markupPct / 100);
  const grandTotal = partsSell + markupAmount + consultancySell;
  const totalCost = partsCost + consultancyCost + pmValue * 0.7;
  const marginPct = grandTotal > 0 ? ((grandTotal - totalCost) / grandTotal) * 100 : 0;

  return { partsCost, partsSell, baseConsultancySell, pmValue, consultancySell, consultancyCost, markupAmount, grandTotal, marginPct };
}
