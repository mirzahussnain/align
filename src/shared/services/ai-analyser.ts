// AI evaluation entry points. Prompts are composed in prompt-composer.ts from
// the versioned occupation profile; every output is validated against a Zod
// schema at the orchestrator boundary.

import type { ZodType } from 'zod';
import { THINKING_BUDGETS } from '@/shared/lib/config';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { AISemanticOutput, AIJobMatchOutput } from '@/shared/types/ai';
import type { Classification } from '@/shared/types/classification';
import type { OccupationProfile } from '@/shared/occupations/types';
import { INDUSTRY_IDS } from '@/shared/constants/sector-keywords';
import { OCCUPATION_IDS } from '@/shared/occupations/registry';
import {
  AIClassificationSchema,
  AISemanticOutputSchema,
  AIJobMatchOutputSchema,
  type AIClassificationOutput,
} from '@/shared/schemas/ai-output';
import { composeSemanticPrompt, composeJobMatchPrompt } from './prompt-composer';
import { generateJSONFromAI } from './ai-orchestrator';

/**
 * Lightweight occupation classification for CVs the deterministic tiers could
 * not resolve. Runs on a truncated excerpt with thinking disabled — this is
 * extraction, not evaluation — and is never metered against user quota.
 */
export async function getClassification(
  cvExcerpt: string,
  targetRoleTitle?: string
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
  classification: Classification
): Promise<AISemanticOutput | null> {
  // Zod's loose objects widen the inferred type with an index signature, so
  // the schema is bridged to the declared output interface explicitly.
  return generateJSONFromAI<AISemanticOutput>({
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
  classification: Classification
): Promise<AIJobMatchOutput | null> {
  return generateJSONFromAI<AIJobMatchOutput>({
    prompt: composeJobMatchPrompt(cvText, jobDescription, profile, classification),
    temperature: 0.1,
    thinkingBudget: THINKING_BUDGETS.jobMatch,
    schema: AIJobMatchOutputSchema as unknown as ZodType<AIJobMatchOutput>,
  });
}

