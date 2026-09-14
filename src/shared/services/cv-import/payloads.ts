import { z } from 'zod';
import { CvImportEntityType } from '@/generated/prisma/client';
import { CvPipelineError } from '../cv-extraction/errors';
import {
  ExtractedCredentialSchema,
  ExtractedEducationSchema,
  ExtractedExperienceSchema,
  ExtractedIdentitySchema,
  ExtractedLanguageSchema,
  ExtractedOtherEvidenceSchema,
  ExtractedProjectSchema,
  ExtractedSkillSchema,
  ExtractedTrainingSchema,
  ExtractedVolunteeringSchema,
  SourceLocationSchema,
} from '../cv-extraction/types';
import { IDENTITY_FIELDS } from './identity-fields';

/**
 * Typed payload validators, one per import entity type.
 *
 * A candidate's `structuredData` is a Json column, and users EDIT candidates
 * before confirming them, so the edited value arrives from the client. Accepting
 * arbitrary JSON there would let a request write anything at all into a
 * canonical profile row via the confirmation path, so every payload — parser-
 * produced or user-edited — is validated against these schemas.
 *
 * The shapes are the extraction shapes, minus the provenance fields: a user may
 * correct a job title, but `excerpt`, `sourceLocation` and `parserVersion` are
 * the record of what the DOCUMENT said and are held on the row itself, where an
 * edit cannot reach them.
 */

/**
 * Provenance fields are stripped from every payload schema: they live on the
 * candidate ROW, where a user edit cannot reach them.
 */
const PROVENANCE_KEYS = { excerpt: true, sourceLocation: true } as const;

/**
 * A proposed change to ONE field of shared identity.
 *
 * The payload carries the `ProfileIdentity` columns that field maps to (a phone
 * contributes three of them), the field name so the review UI and the apply path
 * both know what is being decided, and the raw wording the CV used. Every column
 * is optional and none is ever applied without explicit confirmation — this is a
 * proposal about the account holder's own details, made by a parser.
 *
 * `rawValue` is accepted but is provenance, not content: the apply path writes
 * columns and ignores it, so an edited candidate cannot smuggle a value through.
 */
export const IdentityUpdatePayloadSchema = ExtractedIdentitySchema.extend({
  field: z.enum(IDENTITY_FIELDS),
  rawValue: z.string().trim().max(400).optional(),
});

/**
 * A proposed `Profile.professionalSummary`.
 *
 * Capped at the same length the parser caps a summary at, so a user editing the
 * proposal cannot post something the profile form itself would refuse.
 */
export const ProfileSummaryPayloadSchema = z.object({
  professionalSummary: z.string().trim().min(1).max(2000),
  rawValue: z.string().trim().max(2000).optional(),
});

export const IMPORT_PAYLOAD_SCHEMAS = {
  [CvImportEntityType.IDENTITY_UPDATE]: IdentityUpdatePayloadSchema,
  [CvImportEntityType.PROFILE_SUMMARY_UPDATE]: ProfileSummaryPayloadSchema,
  [CvImportEntityType.EXPERIENCE]: ExtractedExperienceSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.PROJECT]: ExtractedProjectSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.EDUCATION]: ExtractedEducationSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.SKILL]: ExtractedSkillSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.CERTIFICATION]: ExtractedCredentialSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.TRAINING]: ExtractedTrainingSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.LICENCE]: ExtractedCredentialSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.PROFESSIONAL_REGISTRATION]: ExtractedCredentialSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.LANGUAGE]: ExtractedLanguageSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.VOLUNTEERING]: ExtractedVolunteeringSchema.omit(PROVENANCE_KEYS),
  [CvImportEntityType.OTHER_EVIDENCE]: ExtractedOtherEvidenceSchema.omit(PROVENANCE_KEYS),
} as const;

export type ImportPayload<T extends CvImportEntityType> = z.infer<(typeof IMPORT_PAYLOAD_SCHEMAS)[T]>;

/**
 * Validate a candidate payload for its entity type.
 *
 * Throws a stable pipeline error rather than a Zod error: the message reaches a
 * user, and "Expected string, received null at experience.0.company" is not
 * something anyone can act on.
 */
export function validateImportPayload<T extends CvImportEntityType>(
  entityType: T,
  value: unknown
): ImportPayload<T> {
  const schema = IMPORT_PAYLOAD_SCHEMAS[entityType];
  if (!schema) throw new CvPipelineError('INVALID_PARSER_OUTPUT', 422);
  const result = schema.safeParse(value);
  if (!result.success) throw new CvPipelineError('INVALID_PARSER_OUTPUT', 422);
  return result.data as ImportPayload<T>;
}

/** Parse a stored payload, returning null instead of throwing. */
export function parseStoredImportPayload<T extends CvImportEntityType>(
  entityType: T,
  value: unknown
): ImportPayload<T> | null {
  const schema = IMPORT_PAYLOAD_SCHEMAS[entityType];
  if (!schema) return null;
  const result = schema.safeParse(value);
  return result.success ? (result.data as ImportPayload<T>) : null;
}

export { SourceLocationSchema };
