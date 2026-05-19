/**
 * AI provider configuration.
 *
 * Priority order: Azure OpenAI → Claude → Demo
 *
 * ─── Azure OpenAI (recommended for Microsoft 365 environments) ───────────────
 *
 * Azure OpenAI Service runs the same GPT-4o models that power Microsoft 365
 * Copilot, deployed inside your own Azure subscription. Data never leaves your
 * tenant and authentication goes through Entra ID — no separate API keys need
 * to be distributed to users.
 *
 * Required .env variables:
 *   VITE_AZURE_OPENAI_ENDPOINT    https://<resource>.openai.azure.com
 *   VITE_AZURE_OPENAI_DEPLOYMENT  gpt-4o          (your deployment name)
 *   VITE_AZURE_OPENAI_API_VERSION 2024-08-01-preview
 *
 * Authentication — choose one:
 *   VITE_AZURE_OPENAI_KEY         your Azure OpenAI resource key  (quick start)
 *   — OR —
 *   Leave the key unset and complete the MSAL setup in src/services/msalAuth.ts
 *   so the app acquires a Bearer token with scope
 *   "https://cognitiveservices.azure.com/.default". This is the fully SSO path
 *   with no key distribution needed.
 *
 * Setup steps:
 *   1. Azure Portal → Azure OpenAI → Create resource (or use existing)
 *   2. Deploy a model: Azure OpenAI Studio → Deployments → Deploy gpt-4o
 *   3. Copy the endpoint and key (or assign "Cognitive Services User" role to
 *      your Entra app registration for MSAL token auth)
 *
 * ─── Claude (Anthropic) ──────────────────────────────────────────────────────
 *
 *   VITE_ANTHROPIC_API_KEY        your Anthropic API key
 *
 * ─── Demo mode ───────────────────────────────────────────────────────────────
 *
 * If no keys are configured the generator produces a structured template
 * so the UI is always functional.
 */

export type AiProvider = 'azure-openai' | 'claude' | 'demo';

interface AzureOpenAiConfig {
  provider: 'azure-openai';
  endpoint: string;
  deployment: string;
  apiVersion: string;
  apiKey: string | null;  // null = use MSAL Bearer token
}

interface ClaudeConfig {
  provider: 'claude';
  apiKey: string;
}

interface DemoConfig {
  provider: 'demo';
}

export type AiConfig = AzureOpenAiConfig | ClaudeConfig | DemoConfig;

const env = (import.meta as unknown as { env: Record<string, string> }).env;

/** Build config purely from env vars (build-time). */
export function getAiConfig(): AiConfig {
  const azureEndpoint   = env?.VITE_AZURE_OPENAI_ENDPOINT;
  const azureDeployment = env?.VITE_AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o';
  const azureApiVersion = env?.VITE_AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview';
  const azureKey        = env?.VITE_AZURE_OPENAI_KEY ?? null;
  const claudeKey       = env?.VITE_ANTHROPIC_API_KEY;

  if (azureEndpoint) {
    return { provider: 'azure-openai', endpoint: azureEndpoint, deployment: azureDeployment, apiVersion: azureApiVersion, apiKey: azureKey };
  }
  if (claudeKey) {
    return { provider: 'claude', apiKey: claudeKey };
  }
  return { provider: 'demo' };
}

/** Build config from DB settings (runtime). Falls back to env vars if DB not configured. */
export function getAiConfigFromSettings(s: Record<string, string>): AiConfig {
  const provider = s['ai.provider'];

  if (provider === 'azure' || (provider !== 'anthropic' && s['ai.azure.endpoint'])) {
    const endpoint   = s['ai.azure.endpoint']   || env?.VITE_AZURE_OPENAI_ENDPOINT;
    const deployment = s['ai.azure.deployment']  || env?.VITE_AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
    const apiVersion = s['ai.azure.apiVersion']  || env?.VITE_AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
    const apiKey     = s['ai.azure.key']         || env?.VITE_AZURE_OPENAI_KEY || null;
    if (endpoint) return { provider: 'azure-openai', endpoint, deployment, apiVersion, apiKey };
  }

  if (provider === 'anthropic' || (provider !== 'azure' && s['ai.anthropic.key'])) {
    const apiKey = s['ai.anthropic.key'] || env?.VITE_ANTHROPIC_API_KEY;
    if (apiKey) return { provider: 'claude', apiKey };
  }

  // Last resort: env vars
  return getAiConfig();
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  'azure-openai': 'Azure OpenAI',
  'claude': 'Claude (Anthropic)',
  'demo': 'Demo mode',
};

export const PROVIDER_COLORS: Record<AiProvider, string> = {
  'azure-openai': 'bg-blue-50 text-blue-700 border-blue-200',
  'claude':       'bg-orange-50 text-orange-700 border-orange-200',
  'demo':         'bg-gray-100 text-gray-500 border-gray-200',
};
