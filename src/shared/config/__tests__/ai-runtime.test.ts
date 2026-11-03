import { describe, expect, it } from 'vitest';

import {
  AI_ACCOUNT_EXECUTION_LIMITS,
  AI_MODEL_CAPABILITIES,
  AI_PROVIDER_DEFINITIONS,
  DEFAULT_AI_EXECUTION_POLICY,
  aiProviderEnvironmentErrors,
  estimateAiCostUsd,
  requestBudgetFor,
} from '@/shared/config/ai-runtime';

describe('AI runtime provider configuration', () => {
  it('keeps one ordered Gemini attempt before Groq', () => {
    expect(AI_PROVIDER_DEFINITIONS.map(({ provider, label, model }) => ({ provider, label, model }))).toEqual([
      { provider: 'gemini', label: 'Gemini', model: 'gemini-3.8-flash' },
      { provider: 'groq', label: 'Groq', model: 'openai/gpt-oss-120b' },
    ]);
  });

  it('calculates cost only when model pricing and both token counts are available', () => {
    expect(estimateAiCostUsd('gemini', 'gemini-3.8-flash', 100, 50)).toBeCloseTo(0.0006, 10);
    expect(estimateAiCostUsd('gemini', 'gemini-3.8-flash', null, 50)).toBeNull();
    expect(estimateAiCostUsd('groq', 'openai/gpt-oss-120b', 100, 50)).toBeCloseTo(0.000045, 10);
    expect(estimateAiCostUsd('gemini', 'unknown-model', 100, 50)).toBeNull();
  });

  it('uses model-specific request budgets instead of one shared output reservation', () => {
    expect(requestBudgetFor('gemini', 'gemini-3.8-flash')).toEqual({
      maxCompletionTokens: 8_192,
      safeRequestTokens: 32_768,
      safetyMarginTokens: 512,
    });
    expect(requestBudgetFor('groq', 'openai/gpt-oss-120b')).toEqual({
      maxCompletionTokens: 3_500,
      safeRequestTokens: 8_000,
      safetyMarginTokens: 512,
    });
  });

  it('keeps model capabilities separate from account request envelopes', () => {
    const model = AI_MODEL_CAPABILITIES.find(({ provider }) => provider === 'groq');
    const account = AI_ACCOUNT_EXECUTION_LIMITS.find(({ provider }) => provider === 'groq');

    expect(model).toMatchObject({
      model: 'openai/gpt-oss-120b',
      contextWindowTokens: 131_072,
      maxCompletionTokens: 3_500,
      structuredOutputSupport: 'json_schema',
    });
    expect(account).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      requestBudgetTokens: 8_000,
      safetyMarginTokens: 512,
    });
    expect(model).not.toHaveProperty('requestBudgetTokens');
    expect(account).not.toHaveProperty('contextWindowTokens');
  });

  it('centralizes bounded transient retry policy', () => {
    expect(DEFAULT_AI_EXECUTION_POLICY).toMatchObject({
      maxAttempts: 3,
      retryableReasons: ['SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'NETWORK'],
      totalDeadlineMs: 45_000,
      minimumAttemptWindowMs: 250,
      backoff: {
        kind: 'equal_jitter_exponential',
        initialMs: 250,
        maximumMs: 1_000,
      },
    });
  });

  it('defines a positive usable input allowance for every configured model', () => {
    for (const definition of AI_PROVIDER_DEFINITIONS) {
      const budget = requestBudgetFor(definition.provider, definition.model);
      expect(budget.safeRequestTokens).toBeGreaterThan(
        budget.maxCompletionTokens + budget.safetyMarginTokens
      );
    }
  });
});

describe('production AI provider environment validation', () => {
  it('accepts Gemini only', () => {
    expect(aiProviderEnvironmentErrors({ GEMINI_API_KEY: 'gemini-key' })).toEqual([]);
  });

  it('accepts Groq only', () => {
    expect(aiProviderEnvironmentErrors({ GROQ_API_KEY: 'groq-key' })).toEqual([]);
  });

  it('accepts both providers', () => {
    expect(
      aiProviderEnvironmentErrors({ GEMINI_API_KEY: 'gemini-key', GROQ_API_KEY: 'groq-key' })
    ).toEqual([]);
  });

  it('rejects an environment with neither provider', () => {
    expect(aiProviderEnvironmentErrors({})).toEqual([
      'At least one supported AI provider must be configured: GEMINI_API_KEY or GROQ_API_KEY',
    ]);
  });
});
