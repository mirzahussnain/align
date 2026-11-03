import { z } from 'zod';
import type { UnifiedCandidateEvidence } from './types';

export const EvidenceSourceTypeSchema = z.enum([
  'SOURCE_CV', 'CAREER_PROFILE', 'PROFILE_EVIDENCE', 'APPLICATION_EVIDENCE', 'HITL', 'VERIFIED_DERIVED_FACT',
]);

export const EvidenceSourceRefSchema = z.strictObject({
  sourceType: EvidenceSourceTypeSchema,
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  fieldPath: z.string().min(1),
  snapshotId: z.string().min(1).optional(),
});

export const CandidateEvidenceItemSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['IDENTITY', 'CONTACT', 'LINK', 'EMPLOYMENT', 'PROJECT', 'EDUCATION', 'CERTIFICATION', 'TRAINING', 'VOLUNTEER', 'OPEN_SOURCE', 'SKILL', 'ACHIEVEMENT', 'OTHER']),
  field: z.string().min(1),
  canonicalText: z.string().min(1),
  canonicalData: z.unknown().optional(),
  sourceEntityId: z.string().min(1).optional(),
  provenance: EvidenceSourceTypeSchema,
  preservationTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  requirementIds: z.array(z.string().min(1)),
  sourceRefs: z.array(EvidenceSourceRefSchema).min(1),
  conflictKey: z.string().min(1).optional(),
});

const entity = z.strictObject({
  id: z.string().min(1),
  sourceEntityId: z.string().min(1).optional(),
  label: z.string().min(1),
  details: z.record(z.string(), z.unknown()),
  evidenceIds: z.array(z.string().min(1)),
});

const link = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  url: z.string().min(1),
  type: z.enum(['EMAIL', 'PHONE', 'LINKEDIN', 'GITHUB', 'PORTFOLIO', 'PERSONAL_WEBSITE', 'PROJECT_LIVE', 'PROJECT_REPOSITORY', 'OTHER']),
  evidenceId: z.string().min(1),
  projectId: z.string().min(1).optional(),
});

export const UnifiedCandidateEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  identity: z.strictObject({ fullName: z.string().optional(), headline: z.string().optional(), evidenceIds: z.array(z.string()).optional() }),
  contact: z.strictObject({ email: z.string().optional(), phone: z.string().optional(), location: z.string().optional(), evidenceIds: z.array(z.string()).optional() }),
  professionalLinks: z.array(link),
  employment: z.array(entity),
  projects: z.array(entity),
  education: z.array(entity),
  certifications: z.array(entity),
  training: z.array(entity),
  volunteerExperience: z.array(entity),
  openSource: z.array(entity),
  skills: z.array(entity.extend({ category: z.string(), name: z.string().min(1) })),
  achievements: z.array(entity),
  otherEvidence: z.array(entity),
  evidenceById: z.record(z.string(), CandidateEvidenceItemSchema),
  sourceRefs: z.array(EvidenceSourceRefSchema),
  conflicts: z.array(z.strictObject({
    key: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(2),
    reason: z.literal('DIFFERENT_AUTHORITATIVE_VALUES'),
  })),
}).superRefine((value, ctx) => {
  for (const [key, item] of Object.entries(value.evidenceById)) {
    if (key !== item.id) ctx.addIssue({ code: 'custom', path: ['evidenceById', key, 'id'], message: 'Evidence map key must equal the stable evidence id' });
  }
  const known = new Set(Object.keys(value.evidenceById));
  for (const [index, linkValue] of value.professionalLinks.entries()) {
    if (!known.has(linkValue.evidenceId)) ctx.addIssue({ code: 'custom', path: ['professionalLinks', index, 'evidenceId'], message: 'Link references unknown evidence' });
  }
}) satisfies z.ZodType<UnifiedCandidateEvidence>;

export const CvGenerationSourceModeSchema = z.enum(['JOB_MATCH', 'CAREER_PROFILE']);
export const CvAtsStrategySchema = z.enum(['STANDARD', 'COMPOSITE']);

export const RequirementLedgerSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  analysisVersion: z.string().min(1),
  requirements: z.array(z.strictObject({
    id: z.string().min(1), text: z.string().trim().min(1), importance: z.enum(['MANDATORY', 'DESIRABLE']),
    category: z.enum(['QUALIFICATION', 'EXPERIENCE', 'SKILL', 'TOOL', 'METHODOLOGY', 'DUTY', 'KNOWLEDGE', 'VALUE', 'CREDENTIAL', 'ELIGIBILITY', 'AVAILABILITY', 'OTHER']),
    evidenceRequired: z.boolean(), clusterKey: z.string().trim().min(1).max(80).optional(), clusterLabel: z.string().trim().min(1).max(120).optional(), sourceSection: z.enum(['JOB_DESCRIPTION', 'PERSON_SPECIFICATION']),
    analysis: z.strictObject({
      status: z.enum(['MET', 'PARTIAL', 'NOT_MET', 'CONTRADICTED', 'UNCLEAR']),
      evidence: z.array(z.strictObject({ source: z.enum(['CV', 'PROFILE', 'PRACTICAL_FACT', 'USER_CONTEXT']), sourceRef: z.string().optional(), text: z.string().min(1), location: z.string().optional(), approved: z.boolean().optional() })),
      confidence: z.number().min(0).max(1),
      deduction: z.strictObject({ points: z.number().int().min(0), reason: z.string(), rubric: z.enum(['MET', 'MANDATORY_CORE_MISSING', 'MANDATORY_SUPPORTING_MISSING', 'PARTIAL_MATCH', 'DESIRABLE_MISSING', 'ELIGIBILITY', 'OTHER']) }),
    }).optional(),
  })).superRefine((items, ctx) => {
    const ids = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Requirement ids must be unique' });
      ids.add(item.id);
    }
  }),
});

export const RequirementReconciliationSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(z.strictObject({
    requirementId: z.string().min(1),
    status: z.enum(['SUPPORTED', 'PARTIAL', 'MISSING', 'CONFLICTED', 'NOT_APPLICABLE', 'CONFIRMED', 'CONFIRMED_MISSING']),
    evidenceIds: z.array(z.string().min(1)),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
  })),
});

const profileDateValue = z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/);
const profileDate = profileDateValue.optional();
const evidenceItem = z.strictObject({
  fieldKind: z.enum(['RESPONSIBILITY', 'ACHIEVEMENT', 'EVIDENCE_LINE', 'COURSEWORK', 'CREDENTIAL_EVIDENCE', 'CONTRIBUTION', 'DESCRIPTION']),
  text: z.string().trim().min(1).max(2000), requirementIds: z.array(z.string().min(1)).min(1),
});
const newEntitySchemas = {
  EXPERIENCE: z.strictObject({ company: z.string().trim().min(1), title: z.string().trim().min(1), employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'FIXED_TERM', 'TEMPORARY_AGENCY', 'INTERNSHIP', 'PLACEMENT', 'APPRENTICESHIP', 'FREELANCE', 'VOLUNTEER']).optional(), startDate: profileDateValue, endDate: profileDate, current: z.boolean().default(false), location: z.string().optional() }),
  PROJECT: z.strictObject({ name: z.string().trim().min(1), startDate: profileDate, endDate: profileDate, liveUrl: z.string().url().optional(), repositoryUrl: z.string().url().optional() }),
  EDUCATION: z.strictObject({ institution: z.string().trim().min(1), qualification: z.string().trim().min(1), startDate: profileDate, endDate: profileDate, current: z.boolean().default(false), grade: z.string().optional() }),
  CERTIFICATION: z.strictObject({ name: z.string().trim().min(1), issuer: z.string().optional(), issueDate: profileDate, expiryDate: profileDate, credentialId: z.string().optional(), credentialUrl: z.string().url().optional() }),
  TRAINING: z.strictObject({ course: z.string().trim().min(1), provider: z.string().optional(), field: z.string().optional(), status: z.string().optional(), startDate: profileDate, endDate: profileDate, result: z.string().optional() }),
  VOLUNTEERING: z.strictObject({ organisation: z.string().trim().min(1), role: z.string().trim().min(1), startDate: profileDate, endDate: profileDate }),
  OPEN_SOURCE: z.strictObject({ projectName: z.string().trim().min(1), role: z.string().optional(), repositoryUrl: z.string().url().optional(), projectUrl: z.string().url().optional(), startDate: profileDate, endDate: profileDate, description: z.string().optional(), technologies: z.array(z.string()).default([]) }),
  OTHER: z.strictObject({ title: z.string().trim().min(1), context: z.string().optional(), period: z.string().optional() }),
} as const;

export const EvidenceCaptureInputSchema = z.strictObject({
  entityKind: z.enum(['EXPERIENCE', 'PROJECT', 'EDUCATION', 'CERTIFICATION', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE', 'OTHER']),
  entity: z.union([
    z.strictObject({ mode: z.literal('EXISTING'), entityId: z.string().min(1), label: z.string().min(1) }),
    z.strictObject({ mode: z.literal('SOURCE_CV'), entityId: z.string().min(1), sourceEntityId: z.string().min(1), label: z.string().min(1), data: z.record(z.string(), z.unknown()) }),
    z.strictObject({ mode: z.literal('NEW'), data: z.record(z.string(), z.unknown()) }),
  ]),
  evidenceItems: z.array(evidenceItem).min(1),
  persistenceScope: z.enum(['CAREER_PROFILE_AND_APPLICATION', 'APPLICATION_ONLY']),
}).superRefine((value, ctx) => {
  if (value.entity.mode === 'EXISTING') return;
  const parsed = newEntitySchemas[value.entityKind].safeParse(value.entity.data);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', path: ['entity', 'data', ...issue.path], message: issue.message });
});

export const CvPlanSectionSchema = z.enum(['PROFILE', 'EXECUTIVE_SUMMARY', 'CORE_EXPERTISE', 'EXPERIENCE', 'SELECTED_IMPACT', 'SKILLS', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE', 'OTHER']);

const cvPlanBase = {
  schemaVersion: z.literal(1),
  sourceMode: CvGenerationSourceModeSchema,
  atsStrategy: CvAtsStrategySchema,
  targetStrategy: z.enum(['PROFILE_ONLY', 'JUNIOR_PROJECT_HEAVY', 'EXPERIENCE_FORWARD', 'SENIOR_LEAD', 'CAREER_CHANGER', 'ACADEMIC_RESEARCH', 'CREDENTIAL_HEAVY']),
  sectionOrder: z.array(CvPlanSectionSchema),
  entityOrder: z.strictObject({
    EXPERIENCE: z.array(z.string().min(1)).optional(),
    EDUCATION: z.array(z.string().min(1)).optional(),
    PROJECTS: z.array(z.string().min(1)).optional(),
  }).optional(),
  density: z.enum(['COMPACT', 'BALANCED', 'SPACIOUS']),
  targetLength: z.enum(['ONE_PAGE', 'ONE_TO_TWO_PAGES', 'TWO_PAGES']),
  includedEvidenceIds: z.array(z.string().min(1)),
  optionalEvidenceIds: z.array(z.string().min(1)),
  omittedEvidence: z.array(z.strictObject({ evidenceId: z.string().min(1), reasonCode: z.enum(['DUPLICATE', 'LOWER_VALUE', 'DENSITY', 'USER_EXCLUDED']), rationale: z.string().min(1) })),
  professionalLinkIds: z.array(z.string().min(1)), projectLinkIds: z.array(z.string().min(1)),
  coveredRequirementIds: z.array(z.string().min(1)), unresolvedRequirementIds: z.array(z.string().min(1)),
} as const;

export const ProposedCvPlanSchema = z.strictObject(cvPlanBase);
export const ApprovedCvPlanSchema = z.strictObject({ ...cvPlanBase, approvedAt: z.string().datetime() });
