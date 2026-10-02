import type { AiModelRequestBudget } from '@/shared/config/ai-runtime';

export interface AiRequestPreflight extends AiModelRequestBudget {
  estimatedInputTokens: number;
  estimatedRequestTokens: number;
  headroomTokens: number;
  overflowTokens: number;
  allowed: boolean;
}

/**
 * Conservative provider-neutral estimate used before a request is sent.
 * Actual provider usage is still recorded when a request succeeds.
 */
export function estimateSerializedInputTokens(serialized: string): number {
  return Math.ceil(serialized.length / 4);
}

export function preflightAiRequest(
  serialized: string,
  budget: AiModelRequestBudget,
  structuredOutputSchema?: Record<string, unknown>
): AiRequestPreflight {
  // Native response schemas are request input too. Counting their serialized
  // form prevents a strict fallback from crossing its TPM budget even when the
  // human-readable prompt itself fits.
  const requestInput = structuredOutputSchema
    ? `${serialized}\n${JSON.stringify(structuredOutputSchema)}`
    : serialized;
  const estimatedInputTokens = estimateSerializedInputTokens(requestInput);
  const estimatedRequestTokens = estimatedInputTokens + budget.maxCompletionTokens;
  const budgetDelta =
    budget.safeRequestTokens - estimatedRequestTokens - budget.safetyMarginTokens;
  return {
    estimatedInputTokens,
    maxCompletionTokens: budget.maxCompletionTokens,
    estimatedRequestTokens,
    safeRequestTokens: budget.safeRequestTokens,
    safetyMarginTokens: budget.safetyMarginTokens,
    headroomTokens: Math.max(0, budgetDelta),
    overflowTokens: Math.max(0, -budgetDelta),
    allowed: budgetDelta >= 0,
  };
}
