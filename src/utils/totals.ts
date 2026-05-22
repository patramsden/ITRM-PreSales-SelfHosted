import type { Proposal, ProposalTotals, RateCard } from '../types';
import { HOURS_PER_DAY, hourlyRate } from './rates';

export const PM_RATE = 0.20;

export function calcTotals(proposal: Proposal, rateCards?: RateCard[]): ProposalTotals {
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
      const rc = (proposal.useRateCardCost && rateCards)
        ? rateCards.find(r => r.role === task.role)
        : undefined;

      if (task.unit === 'hours') {
        const hours = task.days * HOURS_PER_DAY;
        const hrSell = hourlyRate(task.dayRate);
        const hrCost = rc ? hourlyRate(rc.costRate) : hrSell * 0.7;
        baseConsultancySell += hours * hrSell * multiplier;
        consultancyCost += hours * hrCost * multiplier;
      } else {
        const dayCost = rc ? rc.costRate : task.dayRate * 0.7;
        baseConsultancySell += task.days * task.dayRate * multiplier;
        consultancyCost += task.days * dayCost * multiplier;
      }
    }
  }

  const pmValue = baseConsultancySell * PM_RATE;
  const consultancySell = baseConsultancySell + pmValue;

  // Apply consultancy discount (never reduces sell below 0)
  const discType = proposal.consultancyDiscountType;
  const discAmt  = proposal.consultancyDiscountAmount ?? 0;
  let consultancyDiscountValue = 0;
  if (discAmt > 0 && discType) {
    consultancyDiscountValue = discType === 'monetary'
      ? Math.min(discAmt, consultancySell)
      : Math.min(consultancySell * (discAmt / 100), consultancySell);
  }
  const consultancyDiscountedSell = consultancySell - consultancyDiscountValue;

  const markupAmount = partsSell * (proposal.markupPct / 100);
  const grandTotal = partsSell + markupAmount + consultancyDiscountedSell;
  const totalCost = partsCost + consultancyCost + pmValue * 0.7;
  const marginPct = grandTotal > 0 ? ((grandTotal - totalCost) / grandTotal) * 100 : 0;

  return { partsCost, partsSell, baseConsultancySell, pmValue, consultancySell, consultancyDiscountValue, consultancyDiscountedSell, consultancyCost, markupAmount, grandTotal, marginPct };
}
