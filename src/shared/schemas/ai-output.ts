// Zod validation for AI provider output — the trust boundary between model
// responses and everything that persists or renders them.
//
// Policy: validate STRICTLY only the fields code actually reads (wrong types
// there corrupt scores); default or passthrough everything else so a harmless
// model addition never discards a whole result. Numeric scores are clamped
// rather than rejected — a matchScore of 103 is a model rounding artifact,
// not a reason to throw the analysis away.

import { z } from 'zod';
import { isKnownIndustry, type Sector } from '@/shared/constants/sector-keywords';
import { isKnownOccupation } from '@/shared/occupations/registry';
import type { OccupationId, Seniority } from '@/shared/types/classification';
import type { JobMatchDataV2, JobMatchDataV2Draft } from '@/shared/types/ai';

const score0to10 = z.coerce.number().transform(n => Math.min(10, Math.max(0, Math.round(n))));
const confidence01 = z.coerce.number().transform(n => Math.min(1, Math.max(0, n)));

/** Untrusted string → known sector id, defaulting to `general`. */
const sectorField = z
  .string()
  .transform((value): Sector => (isKnownIndustry(value) ? value : 'general'));

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

const cvBuildSpec = z.looseObject({
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
});

const nonNegativePoints = z.coerce.number().int().min(0);

const requirementEvidence = z.looseObject({
  source: z.enum(['cv', 'profile', 'practical_fact', 'user_context']),
  sourceRef: z.string().optional(),
  text: z.string().min(1),
  location: z.string().optional(),
  approved: z.boolean().optional(),
});

const requirementDeduction = z.looseObject({
  points: nonNegativePoints,
  reason: z.string(),
  rubric: z.enum([
    'met',
    'mandatory_core_missing',
    'mandatory_supporting_missing',
    'partial_match',
    'desirable_missing',
    'eligibility',
    'other',
  ]),
});

const requirementDraft = z.looseObject({
  text: z.string().min(1),
  importance: z.enum(['mandatory', 'desirable']),
  category: z.enum([
    'qualification',
    'experience',
    'skill',
    'tool',
    'methodology',
    'duty',
    'knowledge',
    'value',
    'credential',
    'eligibility',
    'availability',
    'other',
  ]),
  sourceSection: z.enum(['job_description', 'person_specification']),
  evidenceRequired: z.boolean(),
  status: z.enum(['met', 'partial', 'not_met', 'contradicted', 'unclear']),
  evidence: z.array(requirementEvidence),
  confidence: z.coerce.number().min(0).max(1),
  deduction: requirementDeduction,
});

const domainFitV2 = z.looseObject({
  roleDomain: z.string(),
  candidateDomain: z.string(),
  status: z.enum(['aligned', 'partial', 'mismatch']),
  overlapAreas: z.array(z.string()),
  detail: z.string(),
  confidence: z.coerce.number().min(0).max(1),
  deduction: z.looseObject({
    points: nonNegativePoints,
    reason: z.string(),
  }),
});

const jobMatchV2Base = {
  schemaVersion: z.literal(2),
  jobTitle: z.string().optional(),
  jobCompany: z.string().optional(),
  domainFit: domainFitV2,
  matchFeedback: z.string(),
  experienceGap: z.string(),
  tailoredRewrites: z
    .array(
      z.looseObject({
        original: z.string(),
        suggested: z.string(),
        rationale: z.string(),
        caveat: z.string().optional(),
      })
    )
    .catch([]),
  cv_build_spec: cvBuildSpec,
} as const;

/** Model-facing v2 output. IDs and matchScore are deliberately absent. */
export const AIJobMatchV2RawSchema = z
  .looseObject({
    ...jobMatchV2Base,
    requirements: z.array(requirementDraft).min(1),
  })
  .superRefine((data, ctx) => {
    const requirementTexts = new Set<string>();
    for (const [index, requirement] of data.requirements.entries()) {
      const normalizedText = requirement.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
      if (requirementTexts.has(normalizedText)) {
        ctx.addIssue({
          code: 'custom',
          path: ['requirements', index, 'text'],
          message: 'Each job requirement must appear exactly once',
        });
      }
      requirementTexts.add(normalizedText);
    }
  }) satisfies z.ZodType<JobMatchDataV2Draft>;

/** Persisted v2 output after server-owned IDs and arithmetic have been applied. */
export const JobMatchDataV2Schema = z
  .looseObject({
    ...jobMatchV2Base,
    requirements: z.array(requirementDraft.extend({ id: z.string().min(1) })).min(1),
    matchScore: z.coerce.number().int().min(0).max(100),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (const [index, requirement] of data.requirements.entries()) {
      if (ids.has(requirement.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['requirements', index, 'id'],
          message: `Duplicate requirement id: ${requirement.id}`,
        });
      }
      ids.add(requirement.id);
    }

    const deductions = data.requirements.reduce((sum, requirement) => sum + requirement.deduction.points, 0);
    const expectedScore = Math.max(0, Math.min(100, 100 - deductions - data.domainFit.deduction.points));
    if (data.matchScore !== expectedScore) {
      ctx.addIssue({
        code: 'custom',
        path: ['matchScore'],
        message: `Expected ${expectedScore} from the persisted deduction ledger`,
      });
    }
  }) satisfies z.ZodType<JobMatchDataV2>;

/** Parse only the canonical persisted format. Versionless data is invalid. */
export function parseStoredJobMatchData(value: unknown): JobMatchDataV2 | null {
  const parsed = JobMatchDataV2Schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

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
