import { v4 as uuid } from 'uuid';
import { query } from '../shared/db';
import { getProposalById } from './proposalRepo';
import type { Proposal } from '../types/index';

export interface CustomerLink {
  token: string;
  proposalId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  defaultTheme: 'light' | 'dark';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  signedAt?: string;
  signedByName?: string;
  signerIp?: string;
  signerNotes?: string;
}

function mapRow(r: Record<string, unknown>): CustomerLink {
  return {
    token:          r.token as string,
    proposalId:     r.proposal_id as string,
    createdBy:      r.created_by as string,
    createdAt:      (r.created_at as Date).toISOString(),
    expiresAt:      r.expires_at ? (r.expires_at as Date).toISOString() : undefined,
    defaultTheme:   (r.default_theme as 'light' | 'dark') ?? 'light',
    approvalStatus: (r.approval_status as 'pending' | 'approved' | 'rejected') ?? 'pending',
    signedAt:       r.signed_at ? (r.signed_at as Date).toISOString() : undefined,
    signedByName:   r.signed_by_name as string | undefined,
    signerIp:       r.signer_ip as string | undefined,
    signerNotes:    r.signer_notes as string | undefined,
  };
}

export async function createCustomerLink(
  proposalId: string, createdBy: string, expiresAt?: string, defaultTheme: 'light' | 'dark' = 'light',
): Promise<string> {
  const token = uuid();
  await query(
    `INSERT INTO customer_links (token, proposal_id, created_by, expires_at, default_theme)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, proposalId, createdBy, expiresAt ? new Date(expiresAt) : null, defaultTheme],
  );
  return token;
}

export async function getCustomerLink(token: string): Promise<CustomerLink | null> {
  const rows = await query('SELECT * FROM customer_links WHERE token = $1', [token]);
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

export async function listCustomerLinks(proposalId: string): Promise<CustomerLink[]> {
  const rows = await query(
    'SELECT * FROM customer_links WHERE proposal_id = $1 ORDER BY created_at DESC',
    [proposalId],
  );
  return rows.map(mapRow);
}

export async function deleteCustomerLink(token: string): Promise<void> {
  await query('DELETE FROM customer_links WHERE token = $1', [token]);
}

export async function signCustomerLink(
  token: string, status: 'approved' | 'rejected', notes: string, signerIp: string, signerName: string,
): Promise<void> {
  await query(
    `UPDATE customer_links SET
       approval_status = $2,
       signer_notes    = $3,
       signer_ip       = $4,
       signed_by_name  = $5,
       signed_at       = NOW()
     WHERE token = $1`,
    [token, status, notes, signerIp, signerName],
  );
}

export async function getProposalForCustomer(token: string): Promise<{ proposal: Proposal; link: CustomerLink } | null> {
  const link = await getCustomerLink(token);
  if (!link) return null;
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return null;
  const proposal = await getProposalById(link.proposalId);
  if (!proposal) return null;
  return { proposal, link };
}
