export type SupportedAiProvider = 'gemini' | 'groq';

export type AiUsageCapability =
  | 'ai_target_classification'
  | 'ai_enhanced_ats_analysis'
  | 'job_match_analysis'
  | 'profile_reconciliation'
  | 'cv_import_reconciliation'
  | 'cv_regeneration';

/** Stable task identity shared by configuration, execution, and telemetry. */
export type AiTaskPurpose = AiUsageCapability;

export type AiNormalizedFailureReason =
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'INVALID_REQUEST'
  | 'AUTH'
  | 'MODEL_NOT_FOUND'
  | 'PAYLOAD_BUDGET_EXCEEDED'
  | 'INVALID_JSON'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'PROVIDER_ERROR';

interface ModelPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export interface AiModelRequestBudget {
  maxCompletionTokens: number;
  safeRequestTokens: number;
  safetyMarginTokens: number;
}

export interface AiModelCapability {
  provider: SupportedAiProvider;
  model: string;
  contextWindowTokens: number;
  maxCompletionTokens: number;
  structuredOutputSupport: 'json_object' | 'json_schema';
  reasoningSupport: boolean;
  tokenizer: 'conservative_chars';
}

export interface AiAccountExecutionLimit {
  provider: SupportedAiProvider;
  model: string;
  requestBudgetTokens: number;
  safetyMarginTokens: number;
  tokensPerMinute?: number;
  requestsPerMinute?: number;
  requestsPerDay?: number;
}

export interface AiExecutionPolicy {
  maxAttempts: number;
  retryableReasons: readonly AiNormalizedFailureReason[];
  totalDeadlineMs: number;
  minimumAttemptWindowMs: number;
  backoff: {
    kind: 'equal_jitter_exponential';
    initialMs: number;
    maximumMs: number;
  };
}

export const AI_MODEL_CAPABILITIES: readonly AiModelCapability[] = [
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    contextWindowTokens: 1_048_576,
    maxCompletionTokens: 8_192,
    structuredOutputSupport: 'json_schema',
    reasoningSupport: true,
    tokenizer: 'conservative_chars',
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    contextWindowTokens: 131_072,
    maxCompletionTokens: 3_500,
    structuredOutputSupport: 'json_schema',
    reasoningSupport: true,
    tokenizer: 'conservative_chars',
  },
] as const;

export const AI_ACCOUNT_EXECUTION_LIMITS: readonly AiAccountExecutionLimit[] = [
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    requestBudgetTokens: 32_768,
    safetyMarginTokens: 512,
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    requestBudgetTokens: 8_000,
    safetyMarginTokens: 512,
  },
] as const;

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

function configuredBudget(
  provider: SupportedAiProvider,
  model: string
): AiModelRequestBudget {
  const capability = AI_MODEL_CAPABILITIES.find(
    (candidate) => candidate.provider === provider && candidate.model === model
  );
  const accountLimit = AI_ACCOUNT_EXECUTION_LIMITS.find(
    (candidate) => candidate.provider === provider && candidate.model === model
  );
  if (!capability || !accountLimit) {
    throw new Error('AI model capability and account limit configuration must be paired.');
  }
  return {
    maxCompletionTokens: capability.maxCompletionTokens,
    safeRequestTokens: accountLimit.requestBudgetTokens,
    safetyMarginTokens: accountLimit.safetyMarginTokens,
  };
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
    requestBudget: configuredBudget('gemini', 'gemini-3.8-flash'),
    pricing: { inputUsdPerMillionTokens: 1.5, outputUsdPerMillionTokens: 9 },
  },
  {
    provider: 'groq',
    label: 'Groq',
    model: 'openai/gpt-oss-120b',
    apiKeyEnv: 'GROQ_API_KEY',
    maxCompletionTokensEnv: 'GROQ_MAX_OUTPUT_TOKENS',
    requestBudget: configuredBudget('groq', 'openai/gpt-oss-120b'),
    reasoningEffortByCapability: { cv_regeneration: 'low' },
    pricing: { inputUsdPerMillionTokens: 0.15, outputUsdPerMillionTokens: 0.6 },
  },
] as const;

const envInt = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const DEFAULT_AI_EXECUTION_POLICY: AiExecutionPolicy = {
  maxAttempts: 3,
  retryableReasons: ['SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'NETWORK'],
  totalDeadlineMs: 45_000,
  minimumAttemptWindowMs: 250,
  backoff: {
    kind: 'equal_jitter_exponential',
    initialMs: 250,
    maximumMs: 1_000,
  },
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
  executionPolicy: {
    ...DEFAULT_AI_EXECUTION_POLICY,
    totalDeadlineMs: envInt(
      'AI_PROVIDER_TIMEOUT_MS',
      DEFAULT_AI_EXECUTION_POLICY.totalDeadlineMs
    ),
  },
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
