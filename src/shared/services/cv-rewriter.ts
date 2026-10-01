import type { StructuredCvRewriteOutput } from '@/shared/types/cv-rewrite';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import { STRUCTURED_CV_REWRITE_OUTPUT_CONTRACT } from '@/shared/schemas/cv-rewrite-output';
import {
  generateJSONFromAIWithProvenance,
  type ProviderProvenance,
} from './ai-orchestrator';
import type { AiRequestPreflight } from './ai-request-budget';
import type { AiTelemetryContext } from './ai-telemetry-context';
import { serializeCanonicalRewriteContext } from './cv-rewrite-serializer';
import { THINKING_BUDGETS } from '@/shared/lib/config';

export type { ProviderProvenance } from './ai-orchestrator';

export interface RewriteWithProvenance {
  output: StructuredCvRewriteOutput;
  /** Which provider/model actually produced this rewrite (for audit provenance). */
  provenance: ProviderProvenance;
  /** Safe, numeric-only diagnostics for the winning provider attempt. */
  requestDiagnostics: AiRequestPreflight;
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
  input: LedgerNativeRewriteInput,
  telemetry: AiTelemetryContext = {}
): Promise<StructuredCvRewriteOutput | null> {
  const result = await rewriteCVWithProvenance(input, telemetry);
  return result ? result.output : null;
}

/**
 * As {@link rewriteCV}, but also returns the coarse provider/model provenance for
 * the winning attempt, so the generation route can persist WHICH provider and
 * model produced the CV (and whether a fallback was used). One route request is
 * still one logical operation charged once, regardless of provider attempts.
 */
export async function rewriteCVWithProvenance(
  input: LedgerNativeRewriteInput,
  telemetry: AiTelemetryContext = {}
): Promise<RewriteWithProvenance | null> {
  const result = await generateJSONFromAIWithProvenance<StructuredCvRewriteOutput>({
    ...telemetry,
    capability: 'cv_regeneration',
    // Build from the live input for every provider attempt. This is important for
    // correction retries and lets the orchestrator apply provider-specific
    // serialization without reusing a stale prompt.
    serializePrompt: (attempt) => serializeCanonicalRewriteContext(input, attempt),
    temperature: 0.2,
    thinkingBudget: THINKING_BUDGETS.rewrite,
    // Reject malformed provider JSON at the orchestration boundary so the next
    // configured provider can be attempted instead of accepting an unusable
    // winner and failing later in route-level provenance validation.
    structuredOutput: STRUCTURED_CV_REWRITE_OUTPUT_CONTRACT,
  });
  return result
    ? {
        output: result.data,
        provenance: result.provenance,
        requestDiagnostics: result.requestDiagnostics,
      }
    : null;
}
