// AI evaluation entry points. Prompts are composed in prompt-composer.ts from
// the versioned occupation profile; every output is validated against a Zod
// schema at the orchestrator boundary.

import type { ZodType } from 'zod';
import { THINKING_BUDGETS } from '@/shared/lib/config';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { AISemanticOutput, JobMatchDataV2, JobMatchDataV2Draft } from '@/shared/types/ai';
import type { Classification } from '@/shared/types/classification';
import type { OccupationProfile } from '@/shared/occupations/types';
import { INDUSTRY_IDS } from '@/shared/constants/sector-keywords';
import { OCCUPATION_IDS } from '@/shared/occupations/registry';
import {
  AIClassificationSchema,
  AISemanticOutputSchema,
  AIJobMatchV2RawSchema,
  type AIClassificationOutput,
} from '@/shared/schemas/ai-output';
import { composeSemanticPrompt, composeJobMatchPrompt } from './prompt-composer';
import {
  generateJSONFromAI,
  generateJSONFromAIWithProvenance,
  type AIResultWithProvenance,
} from './ai-orchestrator';
import type { AiTelemetryContext } from './ai-telemetry-context';
import { normalizeJobMatchDataV2 } from './job-match-ledger';

/**
 * Lightweight occupation classification for CVs the deterministic tiers could
 * not resolve. Runs on a truncated excerpt with thinking disabled — this is
 * extraction, not evaluation — and is never metered against user quota.
 */
export async function getClassification(
  cvExcerpt: string,
  targetRoleTitle?: string,
  telemetry: AiTelemetryContext = {}
): Promise<AIClassificationOutput | null> {
  const prompt = `Classify the candidate below. Return ONLY a JSON object, no markdown.

Occupation codes (pick exactly one; use "generic" only if none fits):
${OCCUPATION_IDS.join(', ')}

Sector codes (the employment ENVIRONMENT, not the occupation — a data analyst at an NHS trust is still a data analyst):
${INDUSTRY_IDS.join(', ')}

Seniority: entry | mid | senior | lead | unknown

Base the occupation on job titles held, day-to-day responsibilities, and tools —
not on sector vocabulary alone.
${targetRoleTitle ? `\nThe candidate's stated target role is: "${targetRoleTitle}". Weight it strongly.\n` : ''}
CV excerpt:
"""
${cvExcerpt}
"""

Schema:
{ "occupation": "one occupation code", "sector": "one sector code", "seniority": "entry|mid|senior|lead|unknown", "confidence": number 0..1 }`;

  return generateJSONFromAI<AIClassificationOutput>({
    ...telemetry,
    capability: 'ai_target_classification',
    prompt,
    temperature: 0,
    thinkingBudget: THINKING_BUDGETS.classification,
    schema: AIClassificationSchema,
  });
}

/** Occupation-aware semantic evaluation of an already-classified CV. */
export async function getSemanticCVFeedback(
  cvText: string,
  baseResult: CVAnalysisResult,
  profile: OccupationProfile,
  classification: Classification,
  telemetry: AiTelemetryContext = {}
): Promise<AISemanticOutput | null> {
  const result = await getSemanticCVFeedbackWithProvenance(cvText, baseResult, profile, classification, telemetry);
  return result?.data ?? null;
}

export async function getSemanticCVFeedbackWithProvenance(
  cvText: string,
  baseResult: CVAnalysisResult,
  profile: OccupationProfile,
  classification: Classification,
  telemetry: AiTelemetryContext = {}
): Promise<AIResultWithProvenance<AISemanticOutput> | null> {
  // Zod's loose objects widen the inferred type with an index signature, so
  // the schema is bridged to the declared output interface explicitly.
  return generateJSONFromAIWithProvenance<AISemanticOutput>({
    ...telemetry,
    capability: 'ai_enhanced_ats_analysis',
    prompt: composeSemanticPrompt(cvText, baseResult, profile, classification),
    temperature: 0.1,
    thinkingBudget: THINKING_BUDGETS.semanticFeedback,
    schema: AISemanticOutputSchema as unknown as ZodType<AISemanticOutput>,
  });
}

/** Occupation-aware JD-vs-CV evaluation with deduction-ledger scoring. */
export async function getJobMatchFeedback(
  cvText: string,
  jobDescription: string,
  profile: OccupationProfile,
  classification: Classification,
  telemetry: AiTelemetryContext = {}
): Promise<JobMatchDataV2 | null> {
  const result = await getJobMatchFeedbackWithProvenance(cvText, jobDescription, profile, classification, telemetry);
  return result?.data ?? null;
}

export async function getJobMatchFeedbackWithProvenance(
  cvText: string,
  jobDescription: string,
  profile: OccupationProfile,
  classification: Classification,
  telemetry: AiTelemetryContext = {}
): Promise<AIResultWithProvenance<JobMatchDataV2> | null> {
  const result = await generateJSONFromAIWithProvenance<JobMatchDataV2Draft>({
    ...telemetry,
    capability: 'job_match_analysis',
    prompt: composeJobMatchPrompt(cvText, jobDescription, profile, classification),
    temperature: 0.1,
    thinkingBudget: THINKING_BUDGETS.jobMatch,
    schema: AIJobMatchV2RawSchema as unknown as ZodType<JobMatchDataV2Draft>,
  });

  return result
    ? { data: normalizeJobMatchDataV2(result.data, cvText), provenance: result.provenance }
    : null;
}

