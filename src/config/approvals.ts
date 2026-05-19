export type TrbStatus     = 'pending' | 'sent' | 'approved' | 'rejected' | 'waived';
export type FiveKStatus   = 'pending' | 'booked' | 'complete' | 'waived';

export interface ReviewThreshold {
  key: 'trb' | 'fiveK';
  label: string;
  shortLabel: string;
  description: string;
  minGP: number;
  /** How the review is initiated — email link or Teams meeting */
  reviewMethod: 'email' | 'teams';
  durationMins: number; // used for Teams reviews only
}

export const REVIEW_THRESHOLDS: ReviewThreshold[] = [
  {
    key: 'trb',
    label: 'Technical Review Board (TRB)',
    shortLabel: 'TRB',
    description: 'Required for all proposals with GP over £750. Send the proposal link to the TRB for async review and sign-off.',
    minGP: 750,
    reviewMethod: 'email',
    durationMins: 0,
  },
  {
    key: 'fiveK',
    label: '5K Commercial Review',
    shortLabel: '5K Review',
    description: 'Required for proposals with GP over £5,000. Escalates to senior commercial approval via a scheduled Teams review.',
    minGP: 5000,
    reviewMethod: 'teams',
    durationMins: 60,
  },
];

export function requiredReviews(grossProfit: number): ReviewThreshold[] {
  return REVIEW_THRESHOLDS.filter(t => grossProfit >= t.minGP);
}
