import type { StructuredCvRewriteOutput } from '@/shared/types/cv-rewrite';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import {
  generateJSONFromAIWithProvenance,
  type ProviderProvenance,
} from './ai-orchestrator';
import { composeRewritePrompt } from './cv-rewrite-prompt';
import { THINKING_BUDGETS } from '@/shared/lib/config';

export type { ProviderProvenance } from './ai-orchestrator';

export interface RewriteWithProvenance {
  output: StructuredCvRewriteOutput;
  /** Which provider/model actually produced this rewrite (for audit provenance). */
  provenance: ProviderProvenance;
}

/**
 * Rewrite a CV into the structured template shape, tailored to one job.
 *
 * The rewriter is ledger-native: it consumes the compact `LedgerNativeRewriteInput`
 * (a generation-specific projection of JobMatchDataV2) and nothing else. The
 * prompt is assembled deterministically by `composeRewritePrompt` and is
 * truth-first — it only ever asks the model to restate evidence it was given.
 * The former mandatory/desirable adapter is gone.
 *
 * Returns null on provider failure so the caller can refuse without spending the
 * user's quota. Truthfulness of the returned content is validated separately by
 * the route before anything is persisted or charged.
 */
export async function rewriteCV(
  input: LedgerNativeRewriteInput
): Promise<StructuredCvRewriteOutput | null> {
  const result = await rewriteCVWithProvenance(input);
  return result ? result.output : null;
}

/**
 * As {@link rewriteCV}, but also returns the coarse provider/model provenance for
 * the winning attempt, so the generation route can persist WHICH provider and
 * model produced the CV (and whether a fallback was used). One route request is
 * still one logical operation charged once, regardless of provider attempts.
 */
export async function rewriteCVWithProvenance(
  input: LedgerNativeRewriteInput
): Promise<RewriteWithProvenance | null> {
  const result = await generateJSONFromAIWithProvenance<StructuredCvRewriteOutput>({
    capability: 'cv_regeneration',
    prompt: composeRewritePrompt(input),
    temperature: 0.2,
    thinkingBudget: THINKING_BUDGETS.rewrite,
  });
  return result ? { output: result.data, provenance: result.provenance } : null;
}
