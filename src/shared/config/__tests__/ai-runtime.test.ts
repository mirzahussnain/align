import { describe, expect, it } from 'vitest';

import {
  AI_PROVIDER_DEFINITIONS,
  aiProviderEnvironmentErrors,
  estimateAiCostUsd,
} from '@/shared/config/ai-runtime';

describe('AI runtime provider configuration', () => {
  it('keeps one ordered Gemini attempt before Groq', () => {
    expect(AI_PROVIDER_DEFINITIONS.map(({ provider, model }) => ({ provider, model }))).toEqual([
      { provider: 'gemini', model: 'gemini-3.5-flash' },
      { provider: 'groq', model: 'openai/gpt-oss-120b' },
    ]);
  });

  it('calculates cost only when model pricing and both token counts are available', () => {
    expect(estimateAiCostUsd('gemini', 'gemini-3.5-flash', 100, 50)).toBeCloseTo(0.0006, 10);
    expect(estimateAiCostUsd('gemini', 'gemini-3.5-flash', null, 50)).toBeNull();
    expect(estimateAiCostUsd('groq', 'openai/gpt-oss-120b', 100, 50)).toBeCloseTo(0.000045, 10);
    expect(estimateAiCostUsd('gemini', 'unknown-model', 100, 50)).toBeNull();
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
