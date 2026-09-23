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

export interface AiProviderDefinition {
  provider: SupportedAiProvider;
  model: string;
  apiKeyEnv: 'GEMINI_API_KEY' | 'GROQ_API_KEY';
  pricing: ModelPricing | null;
}

/**
 * Ordered provider/model runtime configuration. Array order is fallback order.
 * Groq's configured enterprise model has contract-specific pricing, so its cost
 * remains unknown rather than being guessed.
 */
export const AI_PROVIDER_DEFINITIONS: readonly AiProviderDefinition[] = [
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    pricing: { inputUsdPerMillionTokens: 1.5, outputUsdPerMillionTokens: 9 },
  },
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKeyEnv: 'GROQ_API_KEY',
    pricing: null,
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
  })),
  timeoutMs: envInt('AI_PROVIDER_TIMEOUT_MS', 45_000),
  maxOutputTokens: envInt('AI_MAX_OUTPUT_TOKENS', 8_192),
} as const;

export function aiProviderEnvironmentErrors(
  env: Readonly<Record<string, string | undefined>>
): string[] {
  const configured = AI_PROVIDER_DEFINITIONS.some(
    ({ apiKeyEnv }) => Boolean(env[apiKeyEnv]?.trim())
  );
  return configured
    ? []
    : ['At least one supported AI provider must be configured: GEMINI_API_KEY or GROQ_API_KEY'];
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
