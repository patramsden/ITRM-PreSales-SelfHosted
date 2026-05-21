import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { getProposalForCustomer, signCustomerLink, deleteCustomerLink } from '../repositories/customerLinkRepo';

const router = Router();

// GET /api/customer/:token  — public, no auth
router.get('/:token', async (req, res) => {
  try {
    const result = await getProposalForCustomer(req.params.token);
    if (!result) { res.status(404).json({ error: 'Customer link not found or expired' }); return; }
    res.json(result);
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
