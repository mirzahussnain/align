import { z } from 'zod';
import { isProfileDate } from '@/shared/utils/date';

/**
 * The validated output of the structured CV parser.
 *
 * This is a PROPOSAL, not profile data. Everything here is "what a parser read
 * out of the document", and nothing reaches a canonical table without passing
 * through a CvImportCandidate and a user confirmation. That is why every field
 * is optional and nothing carries a default that could pass for a stated fact:
 * a missing end date means the CV did not say, never "still employed".
 *
 * Stored on CvExtraction.structuredData, so it is validated on the way in AND on
 * the way out — a payload written by an older parser version must still parse or
 * be treated as unusable rather than silently half-read.
 */

const line = z.string().trim().min(1).max(400);
const longText = z.string().trim().min(1).max(2000);
const profileDate = z
  .string()
  .trim()
  .refine((value) => isProfileDate(value), 'Expected YYYY or YYYY-MM')
  .nullable();

/** Where in the source document a proposal came from, for provenance. */
export const SourceLocationSchema = z.object({
  /** 0-indexed line in the normalised extracted text. */
  line: z.number().int().min(0),
  /** The section heading this fell under, when one was detected. */
  section: z.string().max(120).optional(),
});
export type CvSourceLocation = z.infer<typeof SourceLocationSchema>;

/**
 * Provenance carried by every proposal. Named `sourceLocation` rather than
 * `location` because an Experience already has a `location` of its own (where
 * the job was), and one field cannot mean both.
 */
const sourced = { excerpt: line, sourceLocation: SourceLocationSchema };

/**
 * A link recovered from the document, with whatever provenance the format gave.
 *
 * Server-owned. This is written into `CvExtraction.structuredData` and read back
 * by the import layer; no client ever posts one, which is why a URL here may be
 * trusted to be the document's own address rather than something a request
 * supplied.
 */
export const ExtractedLinkSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  visibleText: z.string().trim().max(300).optional(),
  page: z.number().int().min(1).optional(),
  /** 0-indexed line in the normalised extracted text, when the format placed it. */
  line: z.number().int().min(0).optional(),
  sectionHint: z.string().max(120).optional(),
  surroundingText: z.string().max(400).optional(),
});

export const ExtractedIdentitySchema = z.object({
  fullName: line.optional(),
  email: z.string().trim().email().max(320).optional(),
  /**
   * The phone EXACTLY as the CV wrote it. Kept alongside the split fields, never
   * instead of them: it is the provenance for a proposal the user reviews, and
   * the only honest record when the number could not be parsed.
   */
  phone: z.string().trim().max(40).optional(),
  /** Split form, see src/shared/utils/phone.ts. Absent when the number was ambiguous. */
  phoneDialCode: z.string().trim().max(8).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
  phoneCountry: z.string().trim().length(2).optional(),
  linkedin: z.string().trim().max(300).optional(),
  github: z.string().trim().max(300).optional(),
  website: z.string().trim().max(300).optional(),
  /** Verbatim location text; never split into city/country by the parser. */
  location: z.string().trim().max(160).optional(),
});

export const ExtractedExperienceSchema = z.object({
  jobTitle: line,
  /**
   * Optional here even though `Experience.company` is NOT NULL, because a CV
   * that lists a role without naming an employer is common and the parser must
   * not invent one. A candidate missing a canonically-required field is raised
   * as a CONFLICT for the user to fill in, never silently dropped.
   */
  company: line.optional(),
  location: line.optional(),
  startDate: profileDate,
  endDate: profileDate,
  current: z.boolean(),
  achievements: z.array(longText).max(30),
  ...sourced,
});

export const ExtractedEducationSchema = z.object({
  degree: line,
  /** Optional for the same reason as `company` above — raised, never invented. */
  university: line.optional(),
  startDate: profileDate,
  endDate: profileDate,
  current: z.boolean(),
  grade: line.optional(),
  description: longText.optional(),
  ...sourced,
});

export const ExtractedProjectSchema = z.object({
  name: line,
  startDate: profileDate,
  endDate: profileDate,
  achievements: z.array(longText).max(30),
  /**
   * The stack listed on the project's heading line. Becomes `ProjectSkill`
   * links on confirmation, reusing the profile's existing skills where the names
   * match — the alternative was dropping the list on the floor, which is what
   * used to happen once it had been cut out of the project's name.
   */
  technologies: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  /** `ProjectEntry.repositoryUrl` — the code, when the CV linked to it. */
  repositoryUrl: z.string().trim().max(2000).optional(),
  /** `ProjectEntry.liveUrl` — the running thing, when the CV linked to it. */
  liveUrl: z.string().trim().max(2000).optional(),
  /**
   * Every link found inside this project's block, including the two promoted
   * above. Canonical `ProjectEntry` holds only two URLs; a project that links to
   * a repo, a demo and a write-up would otherwise lose the third silently, and
   * the review card shows what was read rather than what happened to fit.
   */
  sourceLinks: z
    .array(z.object({ url: z.string().trim().max(2000), label: z.string().trim().max(200).optional() }))
    .max(10)
    .optional(),
  ...sourced,
});

export const ExtractedSkillSchema = z.object({
  name: line,
  /** The heading the skill was listed under, e.g. "Technical Skills". */
  category: line.optional(),
  ...sourced,
});

export const ExtractedCredentialSchema = z.object({
  officialName: line,
  issuingBody: line.optional(),
  issueDate: profileDate,
  expiryDate: profileDate,
  ...sourced,
});

export const ExtractedTrainingSchema = z.object({
  course: line,
  provider: line.optional(),
  startDate: profileDate,
  endDate: profileDate,
  ...sourced,
});

export const ExtractedLanguageSchema = z.object({
  language: line,
  /** Verbatim proficiency wording; mapped to the shared scale only on confirm. */
  proficiency: line.optional(),
  ...sourced,
});

export const ExtractedVolunteeringSchema = z.object({
  /** Optional for the same reason as `company` above — raised, never invented. */
  organisation: line.optional(),
  role: line,
  startDate: profileDate,
  endDate: profileDate,
  contribution: longText.optional(),
  ...sourced,
});

export const ExtractedOtherEvidenceSchema = z.object({
  title: line,
  /**
   * Capped at the canonical `OtherEvidence.description` limit rather than the
   * parser's general 2000, so the pipeline cannot propose something the profile
   * would then refuse to store. What the user reviews is what gets saved.
   */
  description: z.string().trim().min(1).max(400),
  ...sourced,
});

/**
 * Version 2 added links, the split phone fields, project URLs and the summary's
 * own provenance.
 */
export const CV_EXTRACTION_SCHEMA_VERSION = 2;

/**
 * Versions this build can still READ.
 *
 * A stored payload from an earlier parser must keep parsing, because an import
 * session a user opened last week cites that extraction and reopening it must
 * not 422. Everything version 2 added is optional, so a version 1 row reads as
 * "this parser did not record links or a split phone" — which is exactly true —
 * rather than as corrupt data. New extractions are always written at the current
 * version; nothing upgrades a stored row in place.
 */
const READABLE_SCHEMA_VERSIONS = [1, 2] as const;

export const CvExtractionPayloadSchema = z.object({
  schemaVersion: z.union([z.literal(READABLE_SCHEMA_VERSIONS[0]), z.literal(READABLE_SCHEMA_VERSIONS[1])]),
  identity: ExtractedIdentitySchema,
  headline: line.optional(),
  summary: longText.optional(),
  /** Verbatim provenance for `summary`, present whenever a summary was read. */
  summarySource: z.object(sourced).optional(),
  /** Every link the extractor recovered, classified downstream. */
  links: z.array(ExtractedLinkSchema).max(200).optional(),
  /**
   * Identity fields whose value was WORKED OUT from a handle the CV wrote as a
   * label, rather than read from a hyperlink or a full address.
   *
   * These are proposals of a different quality and the import layer treats them
   * as such — review-required, never bulk-confirmable. A CV that writes
   * "linkedIn/amara-okafor" probably means `linkedin.com/in/amara-okafor`, and
   * on the document behind this work it did not: the label and the hyperlink
   * disagreed. So the derivation is offered and the user checks it.
   */
  derivedIdentity: z
    .array(
      z.object({
        field: z.enum(['linkedin', 'github', 'website']),
        /** Verbatim, as the CV wrote it. */
        writtenAs: z.string().trim().max(200),
      })
    )
    .max(5)
    .optional(),
  /** Section headings the parser recognised, for the review UI and diagnostics. */
  detectedSections: z.array(z.string().max(120)).max(40),
  experience: z.array(ExtractedExperienceSchema).max(60),
  education: z.array(ExtractedEducationSchema).max(40),
  projects: z.array(ExtractedProjectSchema).max(60),
  skills: z.array(ExtractedSkillSchema).max(200),
  certifications: z.array(ExtractedCredentialSchema).max(60),
  training: z.array(ExtractedTrainingSchema).max(60),
  licences: z.array(ExtractedCredentialSchema).max(40),
  professionalRegistrations: z.array(ExtractedCredentialSchema).max(40),
  languages: z.array(ExtractedLanguageSchema).max(40),
  volunteering: z.array(ExtractedVolunteeringSchema).max(40),
  otherEvidence: z.array(ExtractedOtherEvidenceSchema).max(60),
});

export type CvExtractionPayload = z.infer<typeof CvExtractionPayloadSchema>;
export type ExtractedIdentity = z.infer<typeof ExtractedIdentitySchema>;
export type ExtractedLinkRecord = z.infer<typeof ExtractedLinkSchema>;
export type ExtractedExperience = z.infer<typeof ExtractedExperienceSchema>;
export type ExtractedEducation = z.infer<typeof ExtractedEducationSchema>;
export type ExtractedProject = z.infer<typeof ExtractedProjectSchema>;
export type ExtractedSkill = z.infer<typeof ExtractedSkillSchema>;
export type ExtractedCredential = z.infer<typeof ExtractedCredentialSchema>;
export type ExtractedTraining = z.infer<typeof ExtractedTrainingSchema>;
export type ExtractedLanguage = z.infer<typeof ExtractedLanguageSchema>;
export type ExtractedVolunteering = z.infer<typeof ExtractedVolunteeringSchema>;
export type ExtractedOtherEvidence = z.infer<typeof ExtractedOtherEvidenceSchema>;

/** An empty, valid payload — the honest result for a CV nothing was read from. */
export function emptyExtractionPayload(): CvExtractionPayload {
  return {
    schemaVersion: CV_EXTRACTION_SCHEMA_VERSION,
    identity: {},
    detectedSections: [],
    experience: [],
    education: [],
    projects: [],
    skills: [],
    certifications: [],
    training: [],
    licences: [],
    professionalRegistrations: [],
    languages: [],
    volunteering: [],
    otherEvidence: [],
  };
}

/**
 * Parse stored structured data back into the payload type. Returns null rather
 * than throwing: a row written by an older parser is unusable, not fatal, and
 * the caller degrades to manual entry instead of failing the request.
 */
export function parseStoredExtractionPayload(value: unknown): CvExtractionPayload | null {
  const result = CvExtractionPayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}
