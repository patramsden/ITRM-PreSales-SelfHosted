import type { Proposal } from '../types';
import type { ReviewThreshold } from '../config/approvals';

/**
 * Builds a Microsoft Teams "new meeting" deep-link pre-filled with review details.
 * Opens in the Teams desktop or web client, dropping the user straight into
 * the meeting compose view.
 *
 * Teams URL scheme:
 *   https://teams.microsoft.com/l/meeting/new
 *     ?subject=<encoded>
 *     &content=<encoded>      (meeting description / agenda)
 *     &attendees=<csv emails>
 *     &startTime=<ISO 8601>
 *     &endTime=<ISO 8601>
 *
 * Add invitees (account manager, TRB chairs, etc.) by passing the `attendees`
 * array — they appear in the To: field of the invite.
 */
export function buildTeamsMeetingUrl(
  proposal: Proposal,
  review: ReviewThreshold,
  attendees: string[] = []
): string {
  const { startISO, endISO } = nextWorkingSlot(review.durationMins);

  const subject = `${review.shortLabel} – ${proposal.projectName} (${proposal.client})`;

  const body = [
    `${review.label}`,
    '',
    `Proposal:   ${proposal.projectName}`,
    `Client:     ${proposal.client}`,
    `Account Mgr: ${proposal.accountManager || 'TBC'}`,
    `Ticket Ref: ${proposal.ticketRef || 'N/A'}`,
    '',
    review.description,
    '',
    'Please review the proposal in ITRM PreSales before this meeting.',
  ].join('\n');

  const params = new URLSearchParams({
    subject,
    content: body,
    startTime: startISO,
    endTime: endISO,
  });

  if (attendees.length > 0) {
    params.set('attendees', attendees.join(','));
  }

  return `https://teams.microsoft.com/l/meeting/new?${params.toString()}`;
}

/** Returns an Outlook Web calendar compose URL as a fallback. */
export function buildOutlookUrl(
  proposal: Proposal,
  review: ReviewThreshold,
  attendees: string[] = []
): string {
  const { startISO, endISO } = nextWorkingSlot(review.durationMins);

  const subject = `${review.shortLabel} – ${proposal.projectName} (${proposal.client})`;
  const body = `${review.label}\n\nProposal: ${proposal.projectName}\nClient: ${proposal.client}\nAccount Manager: ${proposal.accountManager || 'TBC'}`;

  const params = new URLSearchParams({
    subject,
    body,
    startdt: startISO,
    enddt: endISO,
    path: '/calendar/action/compose',
    rru: 'addevent',
  });

  if (attendees.length > 0) {
    params.set('to', attendees.join(';'));
  }

  return `https://outlook.office.com/calendar/action/compose?${params.toString()}`;
}

// ─── helper ──────────────────────────────────────────────────────────────────

function nextWorkingSlot(durationMins: number): { startISO: string; endISO: string } {
  const now = new Date();
  // Find next working day at 09:00
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  // Skip weekends
  while (start.getDay() === 0 || start.getDay() === 6) {
    start.setDate(start.getDate() + 1);
  }
  start.setHours(9, 0, 0, 0);

  const end = new Date(start.getTime() + durationMins * 60 * 1000);

  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}
