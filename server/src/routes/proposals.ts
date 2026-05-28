import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import {
  getAllProposals, getProposalById, createProposal, updateProposal, deleteProposal,
} from '../repositories/proposalRepo';
import { saveVersion, listVersions, getVersionSnapshot } from '../repositories/versionRepo';
import { createShare, listShares, deleteShare, getProposalByShareToken } from '../repositories/shareRepo';
import { sendEmail, statusChangeEmail } from '../shared/email';
import { getAppSettingsDirect, SETTING_KEYS } from '../repositories/settingsRepo';
import { getAllUsers } from '../repositories/userRepo';
import { maybeCreateOpportunity, maybeUpdateOpportunity } from './crm';
import { log } from '../shared/logger';
import type { Proposal } from '../types/index';

const router = Router();

router.get('/',     requireAuth, async (_req, res) => { res.json(await getAllProposals()); });
router.post('/',    requireAuth, async (req,  res) => {
  const body = req.body as Proposal;
  if (!body?.id || !body?.projectName) { res.status(400).json({ error: 'id and projectName are required' }); return; }
  let created = await createProposal(body);
  const opp = await maybeCreateOpportunity(
    created.id, created.projectName, created.client, created.accountManager, created.crmCompanyId,
  );
  if (opp) {
    await updateProposal(created.id, { ...created, atOpportunityId: opp.opportunityId, atOpportunityUrl: opp.url });
    created = { ...created, atOpportunityId: opp.opportunityId, atOpportunityUrl: opp.url };
    log('info', 'crm', `Opportunity created for proposal "${created.projectName}"`, { details: { proposalId: created.id, opportunityId: opp.opportunityId } });
  }
  log('info', 'proposal', `Proposal created: "${created.projectName}" (${created.reference ?? created.id})`, { details: { client: created.client }, userId: req.user?.id, userName: req.user?.name });
  res.status(201).json(created);
});
router.get('/:id',  requireAuth, async (req, res) => {
  const p = await getProposalById(req.params.id);
  p ? res.json(p) : res.sendStatus(404);
});
router.put('/:id',  requireAuth, async (req, res) => {
  const body = req.body as Proposal;
  const existing = await getProposalById(req.params.id);
  await updateProposal(req.params.id, body);
  if (body.atOpportunityId) {
    maybeUpdateOpportunity(
      body.atOpportunityId,
      body.projectName ?? '',
      body.client ?? '',
      body.accountManager ?? '',
    ).catch(() => {});
  }
  saveVersion(req.params.id, JSON.stringify(body), req.user?.name ?? 'system').catch(() => {});
  // Fire-and-forget status change email
  if (existing && existing.status !== body.status) {
    (async () => {
      try {
        const cfg = await getAppSettingsDirect();
        const appUrl = (cfg[SETTING_KEYS.APP_URL] ?? '').trim();
        const allUsers = await getAllUsers();
        const amUser = allUsers.find(u => u.name.toLowerCase() === (body.accountManager ?? '').toLowerCase());
        const ownerUser = allUsers.find(u => u.id === body.ownerId);
        const recipients = [amUser?.email, ownerUser?.email].filter(Boolean) as string[];
        if (recipients.length > 0) {
          const { subject, html } = statusChangeEmail(body.projectName, body.client, existing.status, body.status, req.user?.name ?? 'System', appUrl, body.id);
          await sendEmail({ to: recipients, subject, html, senderEmail: req.user?.email ?? undefined });
        }
      } catch { /* never let email break the response */ }
    })();
  }
  res.json(body);
});
router.delete('/:id', requireAuth, async (req, res) => {
  const existing = await getProposalById(req.params.id);
  await deleteProposal(req.params.id);
  log('warn', 'proposal', `Proposal deleted: "${existing?.projectName ?? req.params.id}"`, { details: { id: req.params.id, client: existing?.client }, userId: req.user?.id, userName: req.user?.name });
  res.sendStatus(204);
});

// ─── Version history ──────────────────────────────────────────────────────────
router.get('/:id/versions',           requireAuth, async (req, res) => { res.json(await listVersions(req.params.id)); });
router.get('/:id/versions/:vid',      requireAuth, async (req, res) => {
  const snap = await getVersionSnapshot(req.params.vid);
  snap ? res.json(JSON.parse(snap)) : res.sendStatus(404);
});
router.post('/:id/versions/:vid/restore', requireAuth, async (req, res) => {
  const snap = await getVersionSnapshot(req.params.vid);
  if (!snap) { res.sendStatus(404); return; }
  const restored = JSON.parse(snap) as Proposal;
  await updateProposal(req.params.id, restored);
  res.json(restored);
});

// ─── Share links ──────────────────────────────────────────────────────────────
router.post('/:id/share', requireAuth, async (req, res) => {
  const token = await createShare(req.params.id, req.user?.name ?? 'unknown', (req.body as { expiresAt?: string }).expiresAt);
  res.json({ token });
});
router.get('/:id/shares',       requireAuth, async (req, res) => { res.json(await listShares(req.params.id)); });
router.delete('/:id/shares/:token', requireAuth, async (req, res) => {
  await deleteShare(req.params.token); res.sendStatus(204);
});
router.get('/shared/:token', async (req, res) => {
  const p = await getProposalByShareToken(req.params.token);
  p ? res.json(p) : res.sendStatus(404);
});

export default router;
