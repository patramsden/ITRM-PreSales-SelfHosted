import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { getProposalForCustomer, signCustomerLink, deleteCustomerLink } from '../repositories/customerLinkRepo';
import { getProposalById, updateProposal } from '../repositories/proposalRepo';
import { getAllUsers } from '../repositories/userRepo';
import { sendEmail, customerSignedEmail, statusChangeEmail } from '../shared/email';
import { getAppSettingsDirect, SETTING_KEYS } from '../repositories/settingsRepo';

const router = Router();

// GET /api/customer/:token  — public, no auth
router.get('/:token', async (req, res) => {
  try {
    const result = await getProposalForCustomer(req.params.token);
    if (!result) { res.status(404).json({ error: 'Customer link not found or expired' }); return; }
    const cfg = await getAppSettingsDirect().catch(() => ({}) as Record<string, string>);
    const layoutRaw  = cfg[SETTING_KEYS.PROPOSAL_LAYOUT] ?? null;
    const logoB64    = cfg['branding.logo'] ?? null;
    const primaryColor = cfg['branding.primaryColor'] ?? '#2B3990';
    const companyName  = cfg['branding.companyName'] ?? 'ITRM';
    res.json({ ...result, layoutRaw, branding: { logoB64, primaryColor, companyName } });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/customer/:token/sign  — public, no auth
router.post('/:token/sign', async (req, res) => {
  try {
    const result = await getProposalForCustomer(req.params.token);
    if (!result) { res.status(404).json({ error: 'Link not found or expired' }); return; }
    if (result.link.approvalStatus !== 'pending') {
      res.status(400).json({ error: 'This link has already been signed' }); return;
    }
    const { status, notes, signerName } = req.body as { status?: string; notes?: string; signerName?: string };
    if (!status || !['approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'status must be approved or rejected' }); return;
    }
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim())
            ?? req.socket.remoteAddress
            ?? 'unknown';
    await signCustomerLink(req.params.token, status as 'approved' | 'rejected', notes ?? '', ip, signerName ?? 'Customer');
    res.json({ signed: true, status });

    // Fire-and-forget: auto-move proposal status + send emails
    (async () => {
      try {
        const proposal = await getProposalById(result.link.proposalId);
        if (!proposal) return;
        const newStatus = status === 'approved' ? 'Won' : 'Lost';
        const oldStatus = proposal.status;
        await updateProposal(proposal.id, { ...proposal, status: newStatus });
        const cfg = await getAppSettingsDirect();
        const appUrl = (cfg[SETTING_KEYS.APP_URL] ?? '').trim();
        const allUsers = await getAllUsers();
        const amUser = allUsers.find(u => u.name.toLowerCase() === (proposal.accountManager ?? '').toLowerCase());
        const ownerUser = allUsers.find(u => u.id === proposal.ownerId);
        const recipients = [amUser?.email, ownerUser?.email].filter(Boolean) as string[];
        if (recipients.length > 0) {
          const sName = signerName ?? 'Customer';
          const signed = customerSignedEmail(proposal.projectName, proposal.client, status as 'approved' | 'rejected', sName, notes ?? '');
          await sendEmail({ to: recipients, subject: signed.subject, html: signed.html });
          if (oldStatus !== newStatus) {
            const sc = statusChangeEmail(proposal.projectName, proposal.client, oldStatus, newStatus, sName, appUrl, proposal.id);
            await sendEmail({ to: recipients, subject: sc.subject, html: sc.html });
          }
        }
      } catch { /* fire and forget */ }
    })();
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// DELETE /api/customer-link/:token  — requires auth
router.delete('/:token', requireAuth, async (req, res) => {
  try {
    await deleteCustomerLink(req.params.token);
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
