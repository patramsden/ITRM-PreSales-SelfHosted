import * as XLSX from 'xlsx';
import type { Proposal } from '../types';
import { calcTotals, PM_RATE } from './totals';

export function exportProposalToExcel(proposal: Proposal) {
  const wb = XLSX.utils.book_new();
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

  // ── Summary ──────────────────────────────────────────────────────────────
  const summaryData = [
    ['Project Name', proposal.projectName],
    ['Client', proposal.client],
    ['Account Manager', proposal.accountManager],
    ['Status', proposal.status],
    ['Currency', proposal.currency],
    ['Date Created', proposal.dateCreated],
    ['Ticket Ref', proposal.ticketRef ?? ''],
    ['Markup %', proposal.markupPct],
    [],
    ['Objectives', proposal.objectives ?? ''],
    ['Business Requirements', proposal.businessRequirements ?? ''],
    ['Justification', proposal.justification ?? ''],
    ['Constraints', proposal.constraints ?? ''],
    ['Assumptions', proposal.assumptions ?? ''],
    ['Notes', proposal.notes ?? ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

  // ── Parts ─────────────────────────────────────────────────────────────────
  const partsHeaders = ['Description', 'SKU', 'Qty', 'Unit Cost', 'Unit Price', 'Line Cost', 'Line Sell'];
  const partsRows = proposal.parts.map(p => {
    const sel = p.quotes.find(q => q.selected);
    const unitCost = sel ? sel.cost : p.unitCost;
    return [p.description, p.sku ?? '', p.quantity, unitCost, p.unitPrice, unitCost * p.quantity, p.unitPrice * p.quantity];
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([partsHeaders, ...partsRows]), 'Parts');

  // ── Vendor Quotes ─────────────────────────────────────────────────────────
  const quoteHeaders = ['Part', 'Vendor', 'Reference', 'Cost', 'Valid Until', 'Selected', 'Notes'];
  const quoteRows = proposal.parts.flatMap(p =>
    p.quotes.map(q => [p.description, q.vendor, q.reference, q.cost, q.validUntil, q.selected ? 'Yes' : 'No', q.notes ?? ''])
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([quoteHeaders, ...quoteRows]), 'Vendor Quotes');

  // ── Consultancy ───────────────────────────────────────────────────────────
  const consHeaders = ['Phase', 'Task', 'Role', 'Days', 'Day Rate', 'Total'];
  const consRows = proposal.phases.flatMap(ph =>
    ph.tasks.map(t => [ph.name, t.name, t.role, t.days, t.dayRate, t.days * t.dayRate])
  );
  const baseConsultancy = consRows.reduce((s, r) => s + (r[5] as number), 0);
  const pmRow = ['Project Management', `Auto-calculated (${PM_RATE * 100}% of base)`, '', '', '', baseConsultancy * PM_RATE];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([consHeaders, ...consRows, [], pmRow]), 'Consultancy');

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = calcTotals(proposal);
  const totalsData = [
    ['Parts – Cost', fmt(totals.partsCost)],
    ['Parts – Sell', fmt(totals.partsSell)],
    ['Consultancy – Sell', fmt(totals.consultancySell)],
    ['Markup Amount', fmt(totals.markupAmount)],
    ['Grand Total', fmt(totals.grandTotal)],
    ['Margin %', `${totals.marginPct.toFixed(1)}%`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(totalsData), 'Totals');

  XLSX.writeFile(wb, `${proposal.projectName.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
}
