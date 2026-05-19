import type { Proposal, ProposalRole, User } from '../types';
import { isPresalesAdmin } from '../contexts/AuthContext';

export function getProposalRole(proposal: Proposal, user: User | null): ProposalRole {
  if (!user) return 'reader';
  if (isPresalesAdmin(user)) return 'admin';
  if (proposal.ownerId === user.id) return 'owner';
  if (proposal.collaboratorIds.includes(user.id)) return 'collaborator';
  return 'reader';
}

export function canEdit(proposal: Proposal, user: User | null): boolean {
  const role = getProposalRole(proposal, user);
  return role === 'owner' || role === 'collaborator' || role === 'admin';
}

export function canDelete(proposal: Proposal, user: User | null): boolean {
  const role = getProposalRole(proposal, user);
  return role === 'owner' || role === 'admin';
}

export function canManageCollaborators(proposal: Proposal, user: User | null): boolean {
  const role = getProposalRole(proposal, user);
  return role === 'owner' || role === 'admin';
}
