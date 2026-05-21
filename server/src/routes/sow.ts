import { Router } from 'express';
import { requireAuth } from '../shared/auth';
import { getAppSettingsDirect, SETTING_KEYS } from '../repositories/settingsRepo';
import type { Proposal } from '../types/index';

const router = Router();

const SOW_SYSTEM_PROMPT = `You are an expert presales consultant writing on behalf of ITRM.
Generate a professional, client-facing Statement of Work (SoW) structured as follows:
1. Scope of Work
2. Deliverables
3. Approach & Methodology
4. Exclusions
5. Commercial Summary
6. Acceptance Criteria

Be concise, professional, and use British English. Do not add preamble or closing remarks.`;

function buildPrompt(p: Proposal): string {
  const phases = p.phases.map(ph =>
    `Phase: ${ph.name}\n` +
    ph.tasks.map(t => `  - ${t.name}: ${t.days} day(s) @ £${t.dayRate}/day (${t.role})`).join('\n'),
  ).join('\n\n');

  const baseConsultancy = p.phases.flatMap(ph => ph.tasks).reduce((s, t) => s + t.days * t.dayRate, 0);
  const pmValue   = baseConsultancy * 0.20;
  const partsSell = p.parts.reduce((s, pt) => s + pt.unitPrice * pt.quantity, 0);

  return `PROJECT: ${p.projectName}
CLIENT: ${p.client}
OBJECTIVES: ${p.objectives || 'Not specified'}
BUSINESS REQUIREMENTS: ${p.businessRequirements || 'Not specified'}
CONSTRAINTS: ${p.constraints || 'None stated'}
ASSUMPTIONS: ${p.assumptions || 'None stated'}
PARTS (${p.parts.length} line items):
${p.parts.map(pt => `  - ${pt.description} (qty ${pt.quantity}): £${(pt.unitPrice * pt.quantity).toLocaleString()}`).join('\n') || '  None'}
CONSULTANCY PLAN:
${phases || 'No phases defined'}
  + Project Management (20%): £${pmValue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
TOTALS:
  Parts sell:    £${partsSell.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
  Consultancy:   £${(baseConsultancy + pmValue).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
  Grand total:   £${(partsSell + baseConsultancy + pmValue).toLocaleString('en-GB', { minimumFractionDigits: 2 })}

Generate the complete SoW document now.`.trim();
}

// POST /api/sow/generate
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { proposal } = req.body as { proposal?: Proposal };
    if (!proposal) { res.status(400).json({ error: 'proposal is required' }); return; }

    const settings = await getAppSettingsDirect().catch(() => ({} as Record<string, string>));
    const provider  = settings[SETTING_KEYS.AI_PROVIDER] ?? 'demo';

    if (provider === 'azure') {
      const endpoint   = settings[SETTING_KEYS.AI_AZURE_ENDPOINT];
      const deployment = settings[SETTING_KEYS.AI_AZURE_DEPLOY]  || 'gpt-4o';
      const apiVersion = settings[SETTING_KEYS.AI_AZURE_VERSION]  || '2024-08-01-preview';
      const apiKey     = settings[SETTING_KEYS.AI_AZURE_KEY];
      if (!endpoint) { res.status(400).json({ error: 'Azure OpenAI endpoint not configured' }); return; }

      const r = await fetch(
        `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'api-key': apiKey } : {}) },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: SOW_SYSTEM_PROMPT },
              { role: 'user',   content: buildPrompt(proposal) },
            ],
            max_tokens: 2000, temperature: 0.7,
          }),
        },
      );
      if (!r.ok) { const err = await r.text(); res.status(502).json({ error: `Azure OpenAI error: ${err}` }); return; }
      const data = await r.json() as { choices: { message: { content: string } }[] };
      res.json({ content: data.choices?.[0]?.message?.content ?? '' });
      return;
    }

    if (provider === 'anthropic') {
      const apiKey = settings[SETTING_KEYS.AI_ANTHROPIC_KEY];
      if (!apiKey) { res.status(400).json({ error: 'Anthropic API key not configured' }); return; }

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 2000,
          system: SOW_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildPrompt(proposal) }],
        }),
      });
      if (!r.ok) { const err = await r.text(); res.status(502).json({ error: `Anthropic error: ${err}` }); return; }
      const data = await r.json() as { content: { text: string }[] };
      res.json({ content: data.content?.[0]?.text ?? '' });
      return;
    }

    // Demo fallback
    res.json({ content: null, demo: true });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
