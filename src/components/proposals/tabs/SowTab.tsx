import { useState } from 'react';
import { Sparkles, Loader2, Save, RefreshCw, Info, BookOpen } from 'lucide-react';
import type { Proposal } from '../../../types';
import { Button } from '../../ui/Button';
import { generateSoW } from '../../../services/sowGenerator';
import { getAiConfig, PROVIDER_LABELS, PROVIDER_COLORS } from '../../../config/aiConfig';
import { ClausePickerModal } from '../../proposals/ClausePickerModal';
import { RichTextEditor } from '../../ui/RichTextEditor';
import clsx from 'clsx';

interface Props {
  proposal: Proposal;
  editable: boolean;
  onUpdate: (updates: Partial<Proposal>) => void;
}

export function SowTab({ proposal, editable, onUpdate }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState(proposal.sowContent ?? '');
  const [showClausePicker, setShowClausePicker] = useState(false);

  const handleInsertClause = (clauseContent: string) => {
    // Append clause as a new paragraph (works for both HTML and plain text)
    const sep = content ? (content.trimEnd().endsWith('>') ? '' : '<p></p>') : '';
    const newContent = content
      ? `${content}${sep}<p>${clauseContent.replace(/\n/g, '<br>')}</p>`
      : `<p>${clauseContent.replace(/\n/g, '<br>')}</p>`;
    setContent(newContent);
    onUpdate({ sowContent: newContent });
  };

  const config = getAiConfig();
  const providerLabel = PROVIDER_LABELS[config.provider];
  const providerColor = PROVIDER_COLORS[config.provider];

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Pass an MSAL token here if available once MSAL is wired up:
      // const token = await msalInstance.acquireTokenSilent({ scopes: ['https://cognitiveservices.azure.com/.default'] });
      // const text = await generateSoW(proposal, { msalToken: token.accessToken });
      const text = await generateSoW(proposal);
      setContent(text);
      onUpdate({ sowContent: text });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const save = () => onUpdate({ sowContent: content });

  return (
    <div className="max-w-4xl">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Statement of Work</h2>
              {/* Active provider badge */}
              <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', providerColor)}>
                <Sparkles size={10} />
                {providerLabel}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
              {config.provider === 'azure-openai' && 'Using your Azure OpenAI deployment. Authentication via Entra ID.'}
              {config.provider === 'claude' && 'Using Claude Sonnet (Anthropic API).'}
              {config.provider === 'demo' && (
                <>
                  No AI provider configured — showing structured template output.{' '}
                  <a
                    href="#"
                    onClick={e => { e.preventDefault(); setError(CONFIG_HINT); }}
                    className="text-brand-500 hover:underline"
                  >
                    How to configure
                  </a>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {editable && (
              <Button variant="secondary" size="sm" onClick={() => setShowClausePicker(true)}>
                <BookOpen size={14} /> Insert Clause
              </Button>
            )}
            {editable && content && (
              <Button variant="secondary" size="sm" onClick={generate} disabled={generating}>
                <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
                Regenerate
              </Button>
            )}
            <Button onClick={generate} disabled={generating} size="sm">
              {generating
                ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                : <><Sparkles size={14} /> Generate with Copilot</>
              }
            </Button>
          </div>
        </div>

        {/* Error / config hint */}
        {error && (
          <div className="mx-5 mt-4 flex gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <Info size={15} className="flex-shrink-0 mt-0.5" />
            <div className="whitespace-pre-wrap">{error}</div>
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {content ? (
            <>
              <RichTextEditor
                value={content}
                onChange={v => setContent(v)}
                disabled={!editable}
                placeholder="Statement of Work…"
                minHeight="500px"
              />
              {editable && (
                <div className="flex justify-end mt-3">
                  <Button size="sm" onClick={save}>
                    <Save size={14} /> Save SoW
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="py-16 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
                <Sparkles size={22} className="text-brand-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-slate-300">No SoW generated yet</div>
                <div className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-xs">
                  Fill in the Project Summary and add parts / consultancy phases, then click Generate.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showClausePicker && (
        <ClausePickerModal
          onInsert={handleInsertClause}
          onClose={() => setShowClausePicker(false)}
        />
      )}
    </div>
  );
}

const CONFIG_HINT = `To enable live AI generation, add one of the following to your .env file:

── Microsoft Azure OpenAI (recommended for M365 environments) ──────────────
VITE_AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com
VITE_AZURE_OPENAI_DEPLOYMENT=gpt-4o
VITE_AZURE_OPENAI_API_VERSION=2024-08-01-preview
VITE_AZURE_OPENAI_KEY=<your resource key>

  OR — for full Entra ID SSO (no key distribution):
  Leave VITE_AZURE_OPENAI_KEY unset and complete the MSAL setup in
  src/services/msalAuth.ts to acquire a Bearer token with scope
  "https://cognitiveservices.azure.com/.default".

── Claude (Anthropic) ────────────────────────────────────────────────────────
VITE_ANTHROPIC_API_KEY=<your Anthropic API key>

Azure OpenAI is tried first if both are configured.`;
