export type SupportedAiProvider = 'gemini' | 'groq';

export type AiUsageCapability =
  | 'ai_target_classification'
  | 'ai_enhanced_ats_analysis'
  | 'job_match_analysis'
  | 'profile_reconciliation'
  | 'cv_import_reconciliation'
  | 'cv_regeneration';

interface ModelPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export interface AiModelRequestBudget {
  maxCompletionTokens: number;
  safeRequestTokens: number;
  safetyMarginTokens: number;
}

export interface AiProviderDefinition {
  provider: SupportedAiProvider;
  label: string;
  model: string;
  apiKeyEnv: 'GEMINI_API_KEY' | 'GROQ_API_KEY';
  maxCompletionTokensEnv: 'GEMINI_MAX_OUTPUT_TOKENS' | 'GROQ_MAX_OUTPUT_TOKENS';
  requestBudget: AiModelRequestBudget;
  reasoningEffortByCapability?: Partial<Record<AiUsageCapability, 'low' | 'medium' | 'high'>>;
  pricing: ModelPricing | null;
}

/**
 * Ordered provider/model runtime configuration. Array order is fallback order.
 * Pricing uses the providers' published per-million-token rates; unknown pricing
 * must remain null rather than being estimated.
 */
export const AI_PROVIDER_DEFINITIONS: readonly AiProviderDefinition[] = [
  {
    provider: 'gemini',
    label: 'Gemini',
    model: 'gemini-3.8-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    maxCompletionTokensEnv: 'GEMINI_MAX_OUTPUT_TOKENS',
    requestBudget: {
      maxCompletionTokens: 8_192,
      safeRequestTokens: 32_768,
      safetyMarginTokens: 512,
    },
    pricing: { inputUsdPerMillionTokens: 1.5, outputUsdPerMillionTokens: 9 },
  },
  {
    provider: 'groq',
    label: 'Groq',
    model: 'openai/gpt-oss-120b',
    apiKeyEnv: 'GROQ_API_KEY',
    maxCompletionTokensEnv: 'GROQ_MAX_OUTPUT_TOKENS',
    requestBudget: {
      maxCompletionTokens: 3_500,
      safeRequestTokens: 8_000,
      safetyMarginTokens: 512,
    },
    reasoningEffortByCapability: { cv_regeneration: 'low' },
    pricing: { inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.6 },
  },
] as const;

const envInt = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const AI_RUNTIME_CONFIG = {
  providers: AI_PROVIDER_DEFINITIONS.map((definition) => ({
    ...definition,
    apiKey: process.env[definition.apiKeyEnv]?.trim() ?? '',
    requestBudget: {
      ...definition.requestBudget,
      maxCompletionTokens: envInt(
        definition.maxCompletionTokensEnv,
        definition.requestBudget.maxCompletionTokens
      ),
    },
  })),
  timeoutMs: envInt('AI_PROVIDER_TIMEOUT_MS', 45_000),
} as const;

export function requestBudgetFor(
  provider: SupportedAiProvider,
  model: string
): AiModelRequestBudget {
  const definition = AI_RUNTIME_CONFIG.providers.find(
    (candidate) => candidate.provider === provider && candidate.model === model
  );
  if (!definition) {
    throw new Error(`No AI request budget configured for ${provider}/${model}.`);
  }
  return definition.requestBudget;
}

export function aiProviderEnvironmentErrors(
  env: Readonly<Record<string, string | undefined>>
): string[] {
  const configured = AI_PROVIDER_DEFINITIONS.some(
    ({ apiKeyEnv }) => Boolean(env[apiKeyEnv]?.trim())
  );
  return configured
    ? []
    : [`At least one supported AI provider must be configured: ${AI_PROVIDER_DEFINITIONS.map(({ apiKeyEnv }) => apiKeyEnv).join(' or ')}`];
}

export function estimateAiCostUsd(
  provider: string,
  model: string,
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  const definition = AI_PROVIDER_DEFINITIONS.find(
    (candidate) => candidate.provider === provider && candidate.model === model
  );
  if (!definition?.pricing) return null;
  return (
    inputTokens * definition.pricing.inputUsdPerMillionTokens +
    outputTokens * definition.pricing.outputUsdPerMillionTokens
  ) / 1_000_000;
}
