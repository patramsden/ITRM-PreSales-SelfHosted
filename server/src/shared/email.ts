import { getAppSettingsDirect } from '../repositories/settingsRepo';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const s = await getAppSettingsDirect();
  if (s['email.enabled'] !== 'true') return; // silently skip if not configured

  const host     = s['email.host']?.trim();
  const port     = parseInt(s['email.port'] ?? '587', 10);
  const secure   = s['email.secure'] === 'true';
  const user     = s['email.user']?.trim();
  const password = s['email.password']?.trim();
  const from     = s['email.from']?.trim() || 'ITRM PreSales <noreply@example.com>';

  if (!host) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require('nodemailer') as typeof import('nodemailer');

  const transport = nodemailer.createTransport({
    host, port, secure,
    auth: user ? { user, pass: password } : undefined,
  });

  const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
  await transport.sendMail({ from, to, subject: opts.subject, html: opts.html, text: opts.text });
}

// ─── Email templates ──────────────────────────────────────────────────────────

export function emailWrapper(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:0}
.card{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden}
.header{background:#2B3990;padding:24px 32px;color:#fff}
.header h1{margin:0;font-size:20px;font-weight:700}
.body{padding:32px}
.footer{padding:16px 32px;background:#f1f5f9;text-align:center;font-size:12px;color:#94a3b8}
.btn{display:inline-block;padding:12px 24px;background:#2B3990;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-top:16px}
</style></head><body>
<div class="card">
  <div class="header"><h1>${title}</h1></div>
  <div class="body">${body}</div>
  <div class="footer">ITRM PreSales · This is an automated message</div>
</div></body></html>`;
}

export function proposalLinkEmail(proposalName: string, client: string, appUrl: string, proposalId: string): { subject: string; html: string } {
  return {
    subject: `Proposal ready for review: ${proposalName}`,
    html: emailWrapper('Proposal Ready for Review', `
      <p>A proposal has been shared with you for review.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Project</td><td style="padding:8px;font-weight:600">${proposalName}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Client</td><td style="padding:8px">${client}</td></tr>
      </table>
      <a href="${appUrl}/proposals/${proposalId}" class="btn">View Proposal</a>
    `),
  };
}

export function customerSignedEmail(proposalName: string, client: string, status: 'approved' | 'rejected', signerName: string, notes: string): { subject: string; html: string } {
  const color = status === 'approved' ? '#059669' : '#dc2626';
  const label = status === 'approved' ? 'Approved' : 'Rejected';
  return {
    subject: `Customer ${label.toLowerCase()} proposal: ${proposalName}`,
    html: emailWrapper(`Customer ${label} Proposal`, `
      <p>The customer has <strong style="color:${color}">${label.toLowerCase()}</strong> the proposal.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Project</td><td style="padding:8px;font-weight:600">${proposalName}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Client</td><td style="padding:8px">${client}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Signed by</td><td style="padding:8px">${signerName}</td></tr>
        ${notes ? `<tr><td style="padding:8px;color:#64748b;font-size:14px">Notes</td><td style="padding:8px;font-style:italic">"${notes}"</td></tr>` : ''}
      </table>
    `),
  };
}

export function statusChangeEmail(
  proposalName: string,
  client: string,
  oldStatus: string,
  newStatus: string,
  changedBy: string,
  appUrl: string,
  proposalId: string,
): { subject: string; html: string } {
  const color = newStatus === 'Won' ? '#059669' : newStatus === 'Lost' ? '#dc2626' : '#2B3990';
  return {
    subject: `Proposal status updated: ${proposalName} → ${newStatus}`,
    html: emailWrapper(`Proposal Status: ${newStatus}`, `
      <p>A proposal status has been updated.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Project</td><td style="padding:8px;font-weight:600">${proposalName}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Client</td><td style="padding:8px">${client}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Previous status</td><td style="padding:8px">${oldStatus}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">New status</td><td style="padding:8px;font-weight:700;color:${color}">${newStatus}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Changed by</td><td style="padding:8px">${changedBy}</td></tr>
      </table>
      <a href="${appUrl}/proposals/${proposalId}" class="btn">View Proposal</a>
    `),
  };
}

export function passwordResetEmail(resetUrl: string, userName: string): { subject: string; html: string } {
  return {
    subject: 'Reset your ITRM PreSales password',
    html: emailWrapper('Password Reset', `
      <p>Hi ${userName},</p>
      <p>A password reset was requested for your account. Click the button below to set a new password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" class="btn">Reset Password</a>
      <p style="margin-top:24px;font-size:12px;color:#94a3b8">If you didn't request this, you can safely ignore this email.</p>
    `),
  };
}

export function newUserEmail(email: string, tempPassword: string, appUrl: string): { subject: string; html: string } {
  return {
    subject: 'Your ITRM PreSales account',
    html: emailWrapper('Welcome to ITRM PreSales', `
      <p>An account has been created for you on ITRM PreSales.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Email</td><td style="padding:8px;font-weight:600">${email}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Temp password</td><td style="padding:8px;font-family:monospace">${tempPassword}</td></tr>
      </table>
      <a href="${appUrl}/login" class="btn">Sign In</a>
      <p style="margin-top:24px;font-size:12px;color:#94a3b8">You will be prompted to change your password on first login.</p>
    `),
  };
}
