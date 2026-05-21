/**
 * Reporting API — flat proposal data for Power BI and other BI tools.
 *
 * Authentication: Bearer token (service API key from Settings → API Access,
 * or a regular admin session token).
 *
 * Endpoints:
 *   GET /api/report/proposals          — flat summary rows, one per proposal
 *   GET /api/report/pipeline           — aggregated totals grouped by status
 *
 * Power BI setup:
 *   1. In Power BI Desktop choose Get Data → Web
 *   2. Switch to Advanced, enter the URL and add an HTTP header:
 *      Authorization: Bearer <your-service-api-key>
 *   3. Power BI will parse the JSON array directly into a table
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../shared/auth';
import { getAllProposals } from '../repositories/proposalRepo';
import { getAllUsers } from '../repositories/userRepo';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PM_RATE = 0.20;

function calcTotals(proposal: {
  parts: Array<{ unitCost: number; unitPrice: number; quantity: number; quotes: Array<{ selected?: boolean; cost: number }> }>;
  phases: Array<{ tasks: Array<{ days: number; dayRate: number; rateMultiplier?: number }> }>;
  markupPct: number;
}) {
  let partsCost = 0, partsSell = 0;
  for (const part of proposal.parts) {
    const sel = part.quotes.find(q => q.selected);
    partsCost += (sel ? sel.cost : part.unitCost) * part.quantity;
    partsSell += part.unitPrice * part.quantity;
  }
  let consultancyCost = 0, baseConsultancySell = 0;
  for (const phase of proposal.phases) {
    for (const task of phase.tasks) {
      const m = task.rateMultiplier ?? 1;
      consultancyCost     += task.days * task.dayRate * 0.7 * m;
      baseConsultancySell += task.days * task.dayRate * m;
    }
  }
  const pmValue         = baseConsultancySell * PM_RATE;
  const consultancySell = baseConsultancySell + pmValue;
  const markupAmount    = partsSell * (proposal.markupPct / 100);
  const grandTotal      = partsSell + markupAmount + consultancySell;
  const totalCost       = partsCost + consultancyCost + pmValue * 0.7;
  const marginPct       = grandTotal > 0 ? ((grandTotal - totalCost) / grandTotal) * 100 : 0;
  return { partsCost, partsSell, consultancyCost, consultancySell, markupAmount, grandTotal, marginPct };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const STATUSES = ['Draft', 'In Progress', 'Approved', 'With Account Manager', 'Won', 'Lost'] as const;

// ─── GET /api/report/proposals ────────────────────────────────────────────────

router.get('/proposals', requireAuth, requireAdmin, async (_req, res) => {
  const [proposals, users] = await Promise.all([getAllProposals(), getAllUsers()]);
  const userMap = Object.fromEntries((users as Array<{ id: string; name: string }>).map(u => [u.id, u.name]));

  const rows = proposals.map(p => {
    const t = calcTotals(p);
    return {
      id:              p.id,
      projectName:     p.projectName,
      client:          p.client,
      accountManager:  p.accountManager ?? '',
      owner:           userMap[p.ownerId] ?? p.ownerId,
      status:          p.status,
      currency:        p.currency,
      ticketRef:       p.ticketRef ?? '',
      dateCreated:     p.dateCreated,
      dateModified:    p.dateModified,
      partsCount:      p.parts.length,
      phasesCount:     p.phases.length,
      tasksCount:      p.phases.reduce((n, ph) => n + ph.tasks.length, 0),
      milestonesCount: (p.milestones ?? []).length,
      partsCost:       round2(t.partsCost),
      partsSell:       round2(t.partsSell),
      markupAmount:    round2(t.markupAmount),
      consultancyCost: round2(t.consultancyCost),
      consultancySell: round2(t.consultancySell),
      grandTotal:      round2(t.grandTotal),
      marginPct:       round2(t.marginPct),
      crmCompanyId:    p.crmCompanyId ?? '',
      clientContact:   p.clientContact ?? '',
    };
  });

  res.set('Cache-Control', 'no-store').json(rows);
});

// ─── GET /api/report/pipeline ─────────────────────────────────────────────────

router.get('/pipeline', requireAuth, requireAdmin, async (_req, res) => {
  const proposals = await getAllProposals();

  const summary = STATUSES.map(status => {
    const group  = proposals.filter(p => p.status === status);
    const totals = group.map(p => calcTotals(p));
    return {
      status,
      count:        group.length,
      totalValue:   round2(totals.reduce((s, t) => s + t.grandTotal, 0)),
      avgValue:     group.length > 0 ? round2(totals.reduce((s, t) => s + t.grandTotal, 0) / group.length) : 0,
      avgMarginPct: group.length > 0 ? round2(totals.reduce((s, t) => s + t.marginPct, 0)  / group.length) : 0,
    };
  });

  const decided = proposals.filter(p => p.status === 'Won' || p.status === 'Lost').length;
  const won     = proposals.filter(p => p.status === 'Won').length;
  const winRate = decided > 0 ? round2((won / decided) * 100) : 0;

  res.set('Cache-Control', 'no-store').json({ summary, winRate, generatedAt: new Date().toISOString() });
});

export default router;
