import { v4 as uuid } from 'uuid';
import { query } from '../shared/db';
import { getProposalById } from './proposalRepo';
import type { Proposal } from '../types/index';

export interface ShareRecord {
  token: string; proposalId: string; createdBy: string; createdAt: string; expiresAt?: string;
}

export async function createShare(proposalId: string, createdBy: string, expiresAt?: string): Promise<string> {
  const token = uuid();
  await query(
    'INSERT INTO proposal_shares (token,proposal_id,created_by,expires_at) VALUES ($1,$2,$3,$4)',
    [token, proposalId, createdBy, expiresAt ? new Date(expiresAt) : null],
  );
  return token;
}

export async function listShares(proposalId: string): Promise<ShareRecord[]> {
  const rows = await query(
    'SELECT token,proposal_id,created_by,created_at,expires_at FROM proposal_shares WHERE proposal_id=$1 ORDER BY created_at DESC',
    [proposalId],
  );
  return rows.map(r => ({
    token:      r.token as string,
    proposalId: r.proposal_id as string,
    createdBy:  r.created_by  as string,
    createdAt:  (r.created_at as Date).toISOString(),
    expiresAt:  r.expires_at ? (r.expires_at as Date).toISOString() : undefined,
  }));
}

export async function deleteShare(token: string): Promise<void> {
  await query('DELETE FROM proposal_shares WHERE token=$1', [token]);
}

export async function getProposalByShareToken(token: string): Promise<Proposal | null> {
  const rows = await query('SELECT proposal_id,expires_at FROM proposal_shares WHERE token=$1', [token]);
  if (!rows.length) return null;
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) return null;
  return getProposalById(row.proposal_id as string);
}
