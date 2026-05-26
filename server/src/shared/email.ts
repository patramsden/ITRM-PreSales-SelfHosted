/**
 * Email engine — supports two providers:
 *
 *  smtp   Traditional SMTP via nodemailer (backward-compatible default)
 *  graph  Microsoft 365 via Microsoft Graph API (modern auth / app registration)
 *         Uses client-credentials flow: no per-user OAuth consent required.
 *         Required Azure AD app permissions: Mail.Send (Application)
 *         The sending mailbox is determined by `senderEmail` (per-call) falling
 *         back to `email.graph.defaultSender`, then `email.from`.
 *
 * Configuration keys (stored in app_settings):
 *   email.enabled             'true' | 'false'
 *   email.provider            'smtp' | 'graph'  (default: 'smtp')
 *
 *   SMTP:
 *     email.host              SMTP hostname
 *     email.port              SMTP port (default 587)
 *     email.secure            'true' to use TLS (port 465)
 *     email.user              SMTP username
 *     email.password          SMTP password (encrypted at rest)
 *     email.from              Sender display name + address
 *
 *   Microsoft 365 / Graph:
 *     email.graph.tenantId         Azure AD tenant ID (GUID)
 *     email.graph.clientId         App registration client ID (GUID)
 *     email.graph.clientSecret     Client secret (encrypted at rest)
 *     email.graph.defaultSender    Fallback mailbox address (e.g. noreply@company.com)
 */

import { getAppSettingsDirect } from '../repositories/settingsRepo';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /**
   * When using the Graph provider, emails are sent FROM this address.
   * This must be a mailbox that the app registration has been granted
   * Mail.Send permission for (any mailbox in the tenant when using
   * application-level Mail.Send).
   * Falls back to email.graph.defaultSender, then email.from.
   */
  senderEmail?: string;
}

// ─── Graph token cache ────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number;  // epoch ms
  cacheKey: string;   // tenantId+clientId combo — invalidate on config change
}

let _tokenCache: TokenCache | null = null;

async function getGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = `${tenantId}:${clientId}`;
  const now      = Date.now();

  // Return cached token if it has > 2 min remaining
  if (_tokenCache && _tokenCache.cacheKey === cacheKey && _tokenCache.expiresAt > now + 120_000) {
    return _tokenCache.token;
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
      }).toString(),
    }
  );

  const data = await res.json() as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Graph token error: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`);
  }

  _tokenCache = {
    token:      data.access_token,
    expiresAt:  now + (data.expires_in ?? 3600) * 1000,
    cacheKey,
  };

  return data.access_token;
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function sendViaSmtp(opts: EmailOptions, s: Record<string, string>): Promise<void> {
  const host     = s['email.host']?.trim();
  const port     = parseInt(s['email.port'] ?? '587', 10);
  const secure   = s['email.secure'] === 'true';
  const user     = s['email.user']?.trim();
  const password = s['email.password']?.trim();
  const from     = s['email.from']?.trim() || 'MSP SalesPro <noreply@example.com>';

  if (!host) throw new Error('SMTP host is not configured (email.host)');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require('nodemailer') as typeof import('nodemailer');
  const transport = nodemailer.createTransport({
    host, port, secure,
    auth: user ? { user, pass: password } : undefined,
  });

  const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
  await transport.sendMail({ from, to, subject: opts.subject, html: opts.html, text: opts.text });
}

async function sendViaGraph(opts: EmailOptions, s: Record<string, string>): Promise<void> {
  const tenantId     = s['email.graph.tenantId']?.trim();
  const clientId     = s['email.graph.clientId']?.trim();
  const clientSecret = s['email.graph.clientSecret']?.trim();
  const defaultFrom  = s['email.graph.defaultSender']?.trim()
                    || s['email.from']?.trim()
                    || '';

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Microsoft 365 email is not fully configured. ' +
      'Set email.graph.tenantId, email.graph.clientId and email.graph.clientSecret in Settings → Email.'
    );
  }

  const senderEmail = (opts.senderEmail ?? defaultFrom).replace(/.*<(.+)>/, '$1').trim();
  if (!senderEmail) {
    throw new Error(
      'No sender email address available. ' +
      'Set email.graph.defaultSender in Settings → Email, or ensure the sending user has an email address.'
    );
  }

  const token   = await getGraphToken(tenantId, clientId, clientSecret);
  const toList  = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(a => ({
    emailAddress: { address: a.replace(/.*<(.+)>/, '$1').trim() },
  }));

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject:      opts.subject,
          body:         { contentType: 'HTML', content: opts.html },
          toRecipients: toList,
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    // Graph returns 202 on success (no body) — anything else is an error
    const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(
      `Graph sendMail failed (HTTP ${res.status}): ` +
      (errBody?.error?.message ?? res.statusText)
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const s = await getAppSettingsDirect();

  if (s['email.enabled'] !== 'true') return; // silently skip if not enabled

  const provider = (s['email.provider'] ?? 'smtp') as 'smtp' | 'graph';

  if (provider === 'graph') {
    await sendViaGraph(opts, s);
  } else {
    await sendViaSmtp(opts, s);
  }
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
  <div class="footer">MSP SalesPro · This is an automated message</div>
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
  proposalName: string, client: string, oldStatus: string, newStatus: string,
  changedBy: string, appUrl: string, proposalId: string,
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
    subject: 'Reset your password',
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
    subject: 'Your MSP SalesPro account',
    html: emailWrapper('Welcome to MSP SalesPro', `
      <p>An account has been created for you.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Email</td><td style="padding:8px;font-weight:600">${email}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:14px">Temp password</td><td style="padding:8px;font-family:monospace">${tempPassword}</td></tr>
      </table>
      <a href="${appUrl}/login" class="btn">Sign In</a>
      <p style="margin-top:24px;font-size:12px;color:#94a3b8">You will be prompted to change your password on first login.</p>
    `),
  };
}
