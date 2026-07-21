import type { RewrittenCVData } from '../templates/types';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import { generateJSONFromAI } from './ai-orchestrator';
import { composeRewritePrompt } from './cv-rewrite-prompt';
import { THINKING_BUDGETS } from '@/shared/lib/config';

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
): Promise<RewrittenCVData | null> {
  return generateJSONFromAI<RewrittenCVData>({
    prompt: composeRewritePrompt(input),
    temperature: 0.2,
    thinkingBudget: THINKING_BUDGETS.rewrite,
  });
}
