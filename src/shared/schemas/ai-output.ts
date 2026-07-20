// Zod validation for AI provider output — the trust boundary between model
// responses and everything that persists or renders them.
//
// Policy: validate STRICTLY only the fields code actually reads (wrong types
// there corrupt scores); default or passthrough everything else so a harmless
// model addition never discards a whole result. Numeric scores are clamped
// rather than rejected — a matchScore of 103 is a model rounding artifact,
// not a reason to throw the analysis away.

import { z } from 'zod';
import { isKnownIndustry, type Industry } from '@/shared/constants/sector-keywords';
import { isKnownOccupation } from '@/shared/occupations/registry';
import type { OccupationId, Seniority } from '@/shared/types/classification';

const score0to10 = z.coerce.number().transform(n => Math.min(10, Math.max(0, Math.round(n))));
const score0to100 = z.coerce.number().transform(n => Math.min(100, Math.max(0, Math.round(n))));
const confidence01 = z.coerce.number().transform(n => Math.min(1, Math.max(0, n)));

/** Untrusted string → known sector id, defaulting to `general`. */
const sectorField = z
  .string()
  .transform((value): Industry => (isKnownIndustry(value) ? value : 'general'));

/** Untrusted string → known occupation id, defaulting to `generic`. */
const occupationField = z
  .string()
  .transform((value): OccupationId => (isKnownOccupation(value) ? value : 'generic'));

const stringArray = z.array(z.string()).catch([]);

const rewriteSuggestion = z.looseObject({
  original: z.string(),
  suggested: z.string(),
  rationale: z.string().catch(''),
});

/**
 * Semantic evaluation output (scoring v2): classification happens before this
 * call, so there are no industry/tech-detection fields.
 */
export const AISemanticOutputSchema = z.looseObject({
  summaryScore: score0to10,
  summaryFeedback: z.string().catch(''),
  impactScore: score0to10,
  impactFeedback: z.string().catch(''),
  additionalKeywords: z
    .array(
      z.looseObject({
        keyword: z.string(),
        category: z.string().catch('General'),
        count: z.coerce.number().catch(1),
      })
    )
    .catch([]),
  rewrites: z.array(rewriteSuggestion).catch([]),
  alignmentNote: z.string().catch(''),
  detectedRole: z.string().catch(''),
  credentialObservations: stringArray,
  riskFlags: stringArray,
  clichés: stringArray,
});

const selectionCriterion = z.looseObject({
  id: z.string(),
  text: z.string(),
  type: z.enum(['essential', 'desirable', 'unknown']).catch('unknown'),
  category: z
    .enum(['qualification', 'experience', 'skill', 'knowledge', 'value', 'credential', 'availability', 'other'])
    .catch('other'),
  evidenceRequired: z.boolean().catch(false),
});

export const AIJobMatchOutputSchema = z.looseObject({
  jobTitle: z.string().optional(),
  jobCompany: z.string().optional(),
  selectionCriteria: z.array(selectionCriterion).catch([]),
  mandatorySkills: z.looseObject({
    present: stringArray,
    missing: stringArray,
    partial: stringArray,
  }),
  desirableSkills: z.looseObject({
    present: stringArray,
    missing: stringArray,
  }),
  domainFit: z.looseObject({
    roleDomain: z.string().catch(''),
    candidateDomain: z.string().catch(''),
    mismatch: z.boolean().catch(false),
    overlapAreas: stringArray,
    detail: z.string().catch(''),
  }),
  eligibilityFlags: z
    .array(
      z.looseObject({
        flag: z.string(),
        detail: z.string().catch(''),
        datesInvolved: z.string().catch(''),
      })
    )
    .catch([]),
  scoringBreakdown: z
    .array(
      z.looseObject({
        item: z.string(),
        classification: z.string().catch('missing'),
        deduction: z.coerce.number().catch(0),
        reason: z.string().catch(''),
      })
    )
    .catch([]),
  matchScore: score0to100,
  matchFeedback: z.string().catch(''),
  experienceGap: z.string().catch(''),
  tailoredRewrites: z
    .array(
      z.looseObject({
        original: z.string(),
        suggested: z.string(),
        rationale: z.string().catch(''),
        caveat: z.string().optional(),
      })
    )
    .catch([]),
  // cv_build_spec feeds the rewrite/regenerate pipeline; keep its shape intact.
  cv_build_spec: z.looseObject({
    recommended_template: z.string().catch('sharp_minimal'),
    template_rationale: z.string().catch(''),
    section_order: stringArray,
    lead_project: z.string().catch(''),
    summary_angle: z.string().catch(''),
    skills_to_surface: stringArray,
    skills_to_deprioritise: stringArray,
    bullets_to_rewrite: z
      .array(
        z.looseObject({
          project_or_role: z.string(),
          original_label: z.string().catch(''),
          new_label: z.string().catch(''),
          new_body: z.string(),
        })
      )
      .catch([]),
    visa_note_required: z.boolean().catch(false),
    cover_letter_angle: z.string().catch(''),
  }),
});

const seniorityField = z
  .string()
  .transform((value): Seniority =>
    value === 'entry' || value === 'mid' || value === 'senior' || value === 'lead' ? value : 'unknown'
  );

/** Output contract for the lightweight classification micro-call. */
export const AIClassificationSchema = z.looseObject({
  occupation: occupationField.catch('generic'),
  sector: sectorField.catch('general'),
  seniority: seniorityField.catch('unknown'),
  confidence: confidence01.catch(0.5),
});

export type AIClassificationOutput = z.infer<typeof AIClassificationSchema>;
