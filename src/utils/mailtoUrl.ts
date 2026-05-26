import type { Proposal } from '../types';

interface TrbEmailOptions {
  to?: string;       // approver email address — left blank if unknown
  from?: string;     // sender name (shown in body)
  grossProfit: number;
  grandTotal: number;
}

export function buildTrbMailtoUrl(proposal: Proposal, opts: TrbEmailOptions): string {
  const proposalUrl = `${window.location.origin}/proposals/${proposal.id}`;
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

  const subject = `TRB Review Required: ${proposal.projectName} – ${proposal.client}`;

  const body = [
    `Dear TRB,`,
    ``,
    `A proposal has been submitted for Technical Review Board approval.`,
    `Please review the details below and use the link to approve or reject.`,
    ``,
    `──────────────────────────────────────────`,
    `PROPOSAL DETAILS`,
    `──────────────────────────────────────────`,
    `Project:        ${proposal.projectName}`,
    `Client:         ${proposal.client}`,
    `Account Mgr:    ${proposal.accountManager || 'TBC'}`,
    `Ticket Ref:     ${proposal.ticketRef || 'N/A'}`,
    `Status:         ${proposal.status}`,
    ``,
    `Gross Profit:   ${fmt(opts.grossProfit)}`,
    `Total Value:    ${fmt(opts.grandTotal)}`,
    ``,
    `──────────────────────────────────────────`,
    `REVIEW LINK`,
    `──────────────────────────────────────────`,
    `Open the proposal and submit your decision here:`,
    `${proposalUrl}`,
    ``,
    `You will be able to approve or reject with notes directly in the app.`,
    ``,
    `──────────────────────────────────────────`,
    opts.from ? `Submitted by: ${opts.from}` : '',
    `MSP SalesPro`,
  ].filter(l => l !== undefined).join('\r\n');

  const params = new URLSearchParams();
  if (opts.to) params.set('to', opts.to);
  params.set('subject', subject);
  params.set('body', body);

  // URLSearchParams encodes spaces as +; mailto needs %20
  return `mailto:?${params.toString().replace(/\+/g, '%20')}`;
}
