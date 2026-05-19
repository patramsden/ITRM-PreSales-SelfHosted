import type { Proposal } from '../types';
import { getAiConfig } from '../config/aiConfig';
import { PM_RATE } from '../utils/totals';
import { api } from '../lib/api';

// ─── Prompt builders ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert presales consultant writing on behalf of ITRM.
Generate a professional, client-facing Statement of Work (SoW) structured as follows:
1. Scope of Work
2. Deliverables
3. Approach & Methodology
4. Exclusions
5. Commercial Summary
6. Acceptance Criteria

Be concise, professional, and use British English. Do not add preamble or closing remarks.`;

function buildUserPrompt(proposal: Proposal): string {
  const phases = proposal.phases.map(ph =>
    `Phase: ${ph.name}\n` +
    ph.tasks.map(t => `  - ${t.name}: ${t.days} day(s) @ £${t.dayRate}/day (${t.role})`).join('\n')
  ).join('\n\n');

  const baseConsultancy = proposal.phases
    .flatMap(ph => ph.tasks)
    .reduce((s, t) => s + t.days * t.dayRate, 0);
  const pmValue = baseConsultancy * PM_RATE;

  const partsSell = proposal.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);

  return `
PROJECT: ${proposal.projectName}
CLIENT: ${proposal.client}
ACCOUNT MANAGER: ${proposal.accountManager || 'TBC'}

OBJECTIVES:
${proposal.objectives || 'Not specified'}

BUSINESS REQUIREMENTS:
${proposal.businessRequirements || 'Not specified'}

CONSTRAINTS:
${proposal.constraints || 'None stated'}

ASSUMPTIONS:
${proposal.assumptions || 'None stated'}

PARTS (${proposal.parts.length} line items):
${proposal.parts.map(p => `  - ${p.description} (qty ${p.quantity}): £${(p.unitPrice * p.quantity).toLocaleString()}`).join('\n') || '  None'}

CONSULTANCY PLAN:
${phases || 'No consultancy phases defined'}
  + Project Management (auto @ ${PM_RATE * 100}%): £${pmValue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}

TOTALS:
  Parts sell:    £${partsSell.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
  Consultancy:   £${(baseConsultancy + pmValue).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
  Grand total:   £${(partsSell + baseConsultancy + pmValue).toLocaleString('en-GB', { minimumFractionDigits: 2 })}

Generate the complete SoW document now.
  `.trim();
}

// ─── Provider calls ───────────────────────────────────────────────────────────

async function callAzureOpenAI(
  endpoint: string,
  deployment: string,
  apiVersion: string,
  apiKey: string | null,
  msalToken: string | null,
  prompt: string
): Promise<string> {
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  if (!msalToken && !apiKey) {
    throw new Error(
      'Azure OpenAI endpoint is configured but no authentication is available. ' +
      'Set VITE_AZURE_OPENAI_KEY in .env, or complete the MSAL setup in src/services/msalAuth.ts.'
    );
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (msalToken) headers['Authorization'] = `Bearer ${msalToken}`;
  else if (apiKey) headers['api-key'] = apiKey;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Azure OpenAI ${res.status}: ${body || res.statusText}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Azure OpenAI returned an empty response.');
  return text;
}

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${body || res.statusText}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? '';
  if (!text) throw new Error('Claude returned an empty response.');
  return text;
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface GenerateOptions {
  /** MSAL Bearer token for Azure OpenAI SSO auth — acquire with scope
   *  "https://cognitiveservices.azure.com/.default". If omitted, falls back
   *  to VITE_AZURE_OPENAI_KEY. */
  msalToken?: string | null;
}

export async function generateSoW(proposal: Proposal, opts: GenerateOptions = {}): Promise<string> {
  // Try server-side generation first (keys stay on the server)
  try {
    const result = await api.post<{ content: string | null; demo?: boolean }>('sow/generate', { proposal });
    if (result.content) return result.content;
    if (result.demo) {
      // Server said demo mode — fall through to local demo builder
      await new Promise(r => setTimeout(r, 1200));
      return buildDemoSoW(proposal);
    }
  } catch {
    // API unreachable (local dev without running API) — fall back to env-var config
  }

  // Local fallback: env-var AI config (dev only) or demo
  const config = getAiConfig();
  const prompt = buildUserPrompt(proposal);

  if (config.provider === 'azure-openai') {
    return callAzureOpenAI(
      config.endpoint,
      config.deployment,
      config.apiVersion,
      config.apiKey,
      opts.msalToken ?? null,
      prompt
    );
  }

  if (config.provider === 'claude') {
    return callClaude(config.apiKey, prompt);
  }

  // Demo fallback — structured template, no API required
  await new Promise(r => setTimeout(r, 1200));
  return buildDemoSoW(proposal);
}

// ─── Demo fallback ────────────────────────────────────────────────────────────

function buildDemoSoW(proposal: Proposal): string {
  const partsSell = proposal.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const baseConsultancy = proposal.phases
    .flatMap(ph => ph.tasks)
    .reduce((s, t) => s + t.days * t.dayRate, 0);
  const pmValue = baseConsultancy * PM_RATE;
  const totalCons = baseConsultancy + pmValue;
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

  return `STATEMENT OF WORK
${proposal.projectName}
Client: ${proposal.client}
Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}

═══════════════════════════════════════════════════

1. SCOPE OF WORK
─────────────────
This Statement of Work defines the professional services to be delivered by ITRM
in support of the ${proposal.projectName} engagement for ${proposal.client}.

${proposal.objectives ? `Objectives: ${proposal.objectives}` : ''}
${proposal.businessRequirements ? `\nBusiness Requirements: ${proposal.businessRequirements}` : ''}

2. DELIVERABLES
───────────────
${proposal.phases.flatMap(ph => ph.tasks.map(t => `• ${t.name} (${t.days} day${t.days !== 1 ? 's' : ''})`)).join('\n') || '• To be confirmed during scoping.'}

3. APPROACH & METHODOLOGY
──────────────────────────
${proposal.phases.length > 0
  ? proposal.phases.map((ph, i) =>
      `Phase ${i + 1} — ${ph.name}\n` +
      ph.tasks.map(t => `  • ${t.name}: ${t.days} day(s), delivered by ${t.role}`).join('\n')
    ).join('\n\n')
  : 'Approach to be confirmed.'
}

  Project Management (${PM_RATE * 100}% of above): ${fmt(pmValue)}

4. EXCLUSIONS
─────────────
Unless separately agreed in writing, the following are out of scope:
• Third-party vendor management beyond coordination described above
• Hardware procurement (quoted separately)
• End-user training not listed as a specific deliverable
• Remediation of pre-existing faults or configuration issues

5. COMMERCIAL SUMMARY
──────────────────────
  Hardware & Software:    ${fmt(partsSell)}
  Professional Services:  ${fmt(totalCons)}
                          ─────────────────────
  Total (excl. VAT):      ${fmt(partsSell + totalCons)}

  All prices are in ${proposal.currency} and subject to VAT at the prevailing rate.
${proposal.assumptions ? `\n  Assumptions: ${proposal.assumptions}` : ''}
${proposal.constraints ? `  Constraints: ${proposal.constraints}` : ''}

6. ACCEPTANCE CRITERIA
───────────────────────
This engagement will be considered complete when:
• All deliverables in Section 2 have been completed and demonstrated
• Written acceptance has been received from the ${proposal.client} project sponsor
• A post-implementation review has been conducted within 5 business days of go-live

─────────────────────────────────────────────────────
Generated by ITRM PreSales · Demo mode
Configure VITE_AZURE_OPENAI_ENDPOINT or VITE_ANTHROPIC_API_KEY for live AI generation.`;
}
