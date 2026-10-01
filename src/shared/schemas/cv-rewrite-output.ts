import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const optionalString = z.string().nullable().transform((value) => value ?? undefined).optional();
const optionalStringArray = z.array(z.string()).nullable().transform((value) => value ?? undefined).optional();

const SourceCvRefSchema = z.strictObject({
  source: z.literal('source_cv'),
  section: z.literal('source_cv'),
  entryId: optionalString,
  evidenceText: optionalString,
});

const LedgerEvidenceRefSchema = z.strictObject({
  source: z.literal('ledger_evidence'),
  requirementId: nonEmptyString,
  evidenceIndex: z.number().int().nonnegative().nullable().transform((value) => value ?? undefined).optional(),
});

const ApprovedProfileRefSchema = z.strictObject({
  source: z.literal('approved_profile'),
  requirementId: nonEmptyString,
  evidenceRef: z.strictObject({ type: nonEmptyString, id: nonEmptyString }),
});

const ApplicationContextRefSchema = z.strictObject({
  source: z.literal('application_context'),
  requirementId: nonEmptyString,
  contextId: nonEmptyString,
});

export const RewriteSourceRefSchema = z.discriminatedUnion('source', [
  SourceCvRefSchema,
  LedgerEvidenceRefSchema,
  ApprovedProfileRefSchema,
  ApplicationContextRefSchema,
]);

const sourceRefs = z.array(RewriteSourceRefSchema).min(1);

export const ProvenancedTextBlockSchema = z.strictObject({ text: nonEmptyString, sourceRefs });
export const ProvenancedBulletSchema = ProvenancedTextBlockSchema.extend({ label: optionalString });
export const ProvenancedExperienceEntrySchema = z.strictObject({
  jobTitle: nonEmptyString, company: nonEmptyString, location: optionalString, type: optionalString,
  startDate: optionalString, endDate: optionalString, achievements: z.array(ProvenancedBulletSchema), sourceRefs,
});
export const ProvenancedProjectEntrySchema = z.strictObject({
  name: nonEmptyString, skills: optionalString, startDate: optionalString, endDate: optionalString,
  achievements: z.array(ProvenancedBulletSchema), sourceRefs,
});
export const ProvenancedEducationEntrySchema = z.strictObject({
  degree: nonEmptyString, university: nonEmptyString, startDate: optionalString, endDate: optionalString,
  grade: optionalString, description: optionalString, sourceRefs,
});
export const ProvenancedSkillItemSchema = z.strictObject({ skill: nonEmptyString, sourceRefs });
export const ProvenancedSkillGroupSchema = ProvenancedTextBlockSchema.extend({
  category: nonEmptyString,
  items: z.array(ProvenancedSkillItemSchema).nullable().transform((value) => value ?? undefined).optional(),
});
export const ProvenancedCertificationEntrySchema = z.strictObject({
  name: nonEmptyString, issuer: optionalString, year: optionalString, sourceRefs,
});

const ContactSchema = z.strictObject({
  email: optionalString, phone: optionalString, website: optionalString,
  linkedin: optionalString, github: optionalString, visaStatus: optionalString,
});

export const StructuredCvRewriteOutputSchema = z.strictObject({
  identity: z.strictObject({
    name: optionalString, professionalTitle: optionalString, location: optionalString,
    contact: ContactSchema.nullable().transform((value) => value ?? undefined).optional(),
    contactRefs: optionalStringArray, sourceRefs,
  }),
  summary: ProvenancedTextBlockSchema.nullable().transform((value) => value ?? undefined).optional(),
  experience: z.array(ProvenancedExperienceEntrySchema),
  projects: z.array(ProvenancedProjectEntrySchema),
  education: z.array(ProvenancedEducationEntrySchema),
  skills: z.array(ProvenancedSkillGroupSchema),
  certifications: z.array(ProvenancedCertificationEntrySchema),
  generationNotes: z.strictObject({
    unsupportedRequirementsNotAdded: z.array(z.string()),
    omittedLowPriorityContent: optionalStringArray,
  }).nullable().transform((value) => value ?? undefined).optional(),
});

/**
 * Strict JSON-schema providers require every property to appear in `required`.
 * Optional values remain optional semantically because their generated schema
 * accepts null; Zod normalizes null back to undefined for existing callers.
 */
function makeStrictProviderSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(makeStrictProviderSchema);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(source).map(([key, child]) => [key, makeStrictProviderSchema(child)])
  ) as Record<string, unknown>;
  const properties = result.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    result.required = Object.keys(properties as Record<string, unknown>);
    result.additionalProperties = false;
  }
  return result;
}

// Reuse repeated provenance blocks through standard JSON Schema references.
// Inline generation repeats the four-variant sourceRef union in every CV
// section and is larger than Groq's entire safe input allowance by itself.
const generatedJsonSchema = z.toJSONSchema(StructuredCvRewriteOutputSchema, {
  io: 'input',
  reused: 'ref',
});
delete generatedJsonSchema.$schema;

export const STRUCTURED_CV_REWRITE_JSON_SCHEMA = makeStrictProviderSchema(generatedJsonSchema) as Record<string, unknown>;
export const STRUCTURED_CV_REWRITE_OUTPUT_CONTRACT = {
  name: 'structured_cv_rewrite',
  runtimeSchema: StructuredCvRewriteOutputSchema,
  jsonSchema: STRUCTURED_CV_REWRITE_JSON_SCHEMA,
} as const;

export type RewriteSourceRef = z.output<typeof RewriteSourceRefSchema>;
export type ProvenancedTextBlock = z.output<typeof ProvenancedTextBlockSchema>;
export type ProvenancedBullet = z.output<typeof ProvenancedBulletSchema>;
export type ProvenancedExperienceEntry = z.output<typeof ProvenancedExperienceEntrySchema>;
export type ProvenancedProjectEntry = z.output<typeof ProvenancedProjectEntrySchema>;
export type ProvenancedEducationEntry = z.output<typeof ProvenancedEducationEntrySchema>;
export type ProvenancedSkillItem = z.output<typeof ProvenancedSkillItemSchema>;
export type ProvenancedSkillGroup = z.output<typeof ProvenancedSkillGroupSchema>;
export type ProvenancedCertificationEntry = z.output<typeof ProvenancedCertificationEntrySchema>;
export type StructuredCvRewriteOutput = z.output<typeof StructuredCvRewriteOutputSchema>;
