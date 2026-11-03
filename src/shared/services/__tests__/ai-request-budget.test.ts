import { describe, expect, it } from 'vitest';
import { preflightAiRequest } from '@/shared/services/ai-request-budget';

const budget = {
  maxCompletionTokens: 3_500,
  safeRequestTokens: 8_000,
  safetyMarginTokens: 512,
};

describe('AI request budget preflight', () => {
  it('includes input, completion reservation, and safety margin', () => {
    expect(preflightAiRequest('x'.repeat(4_000), budget)).toEqual({
      estimatedInputTokens: 1_000,
      maxCompletionTokens: 3_500,
      estimatedRequestTokens: 4_500,
      safeRequestTokens: 8_000,
      safetyMarginTokens: 512,
      headroomTokens: 2_988,
      overflowTokens: 0,
      allowed: true,
    });
  });

  it('allows the exact safe request boundary', () => {
    const result = preflightAiRequest('x'.repeat(15_952), budget);
    expect(result.estimatedInputTokens).toBe(3_988);
    expect(result.estimatedRequestTokens + result.safetyMarginTokens).toBe(8_000);
    expect(result.headroomTokens).toBe(0);
    expect(result.overflowTokens).toBe(0);
    expect(result.allowed).toBe(true);
  });

  it('rejects one input token over the safe request boundary', () => {
    const result = preflightAiRequest('x'.repeat(15_953), budget);
    expect(result.estimatedInputTokens).toBe(3_989);
    expect(result.estimatedRequestTokens + result.safetyMarginTokens).toBe(8_001);
    expect(result.headroomTokens).toBe(0);
    expect(result.overflowTokens).toBe(1);
    expect(result.allowed).toBe(false);
  });

  it('counts a native response schema as provider request input', () => {
    const result = preflightAiRequest('prompt', budget, {
      type: 'object',
      properties: { certifications: { type: 'array' } },
    });

    expect(result.estimatedInputTokens).toBeGreaterThan(2);
    expect(result.estimatedRequestTokens).toBe(
      result.estimatedInputTokens + budget.maxCompletionTokens
    );
  });
});
