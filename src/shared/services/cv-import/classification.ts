import { CvImportEntityType } from '@/generated/prisma/client';

/**
 * How an imported entity type is treated by the commercial allowances.
 *
 * This is the rule the previous corrective phase established, expressed once so
 * the importer cannot quietly re-introduce the bug it fixed: canonical Career
 * Profile records describe a user's career history and completing a profile is
 * not a commercial allowance, so they consume nothing. Reusable evidence
 * (`OtherEvidence`) is a distinct product feature and is the ONLY entity type
 * that consumes `profile_evidence_storage` — and only once the user confirms it.
 */

/** Entity types that become canonical Career Profile records. Uncapped. */
export const CANONICAL_PROFILE_ENTITY_TYPES = [
  CvImportEntityType.EXPERIENCE,
  CvImportEntityType.PROJECT,
  CvImportEntityType.EDUCATION,
  CvImportEntityType.SKILL,
  CvImportEntityType.CERTIFICATION,
  CvImportEntityType.TRAINING,
  CvImportEntityType.LICENCE,
  CvImportEntityType.PROFESSIONAL_REGISTRATION,
  CvImportEntityType.LANGUAGE,
  CvImportEntityType.VOLUNTEERING,
] as const;

/**
 * The only entity type that consumes the reusable-evidence allowance, and only
 * when CONFIRMED. Proposed, edited-but-unconfirmed, rejected, duplicate and
 * conflicting candidates consume nothing whatever their type.
 */
export const REUSABLE_EVIDENCE_ENTITY_TYPE = CvImportEntityType.OTHER_EVIDENCE;

export function consumesReusableEvidenceAllowance(entityType: CvImportEntityType): boolean {
  return entityType === REUSABLE_EVIDENCE_ENTITY_TYPE;
}

export function isCanonicalProfileEntity(entityType: CvImportEntityType): boolean {
  return (CANONICAL_PROFILE_ENTITY_TYPES as readonly CvImportEntityType[]).includes(entityType);
}

/**
 * Application-scoped evidence is deliberately absent from this enum.
 *
 * CV import populates the CAREER PROFILE. `ApplicationEvidenceContext` and
 * `ProfileEvidenceApproval` are vacancy-specific and are created only when a
 * user approves evidence against a particular application, which import must
 * never do on their behalf — an approval is a claim about a specific job.
 */
export const IMPORT_NEVER_CREATES = [
  'ApplicationEvidenceContext',
  'ProfileEvidenceApproval',
] as const;

/** Human-facing group labels for the review summary. */
export const ENTITY_TYPE_LABELS: Record<CvImportEntityType, { one: string; many: string }> = {
  IDENTITY_UPDATE: { one: 'contact detail', many: 'contact details' },
  PROFILE_SUMMARY_UPDATE: { one: 'professional summary', many: 'professional summaries' },
  EXPERIENCE: { one: 'work experience', many: 'work experiences' },
  PROJECT: { one: 'project', many: 'projects' },
  EDUCATION: { one: 'education record', many: 'education records' },
  SKILL: { one: 'skill', many: 'skills' },
  CERTIFICATION: { one: 'certification', many: 'certifications' },
  TRAINING: { one: 'training record', many: 'training records' },
  LICENCE: { one: 'licence', many: 'licences' },
  PROFESSIONAL_REGISTRATION: { one: 'professional registration', many: 'professional registrations' },
  LANGUAGE: { one: 'language', many: 'languages' },
  VOLUNTEERING: { one: 'volunteering record', many: 'volunteering records' },
  OTHER_EVIDENCE: { one: 'reusable evidence item', many: 'reusable evidence items' },
};

/**
 * Entity types safe to confirm in bulk without individual review.
 *
 * Skills and languages are short, low-risk facts a user can scan as a group;
 * making someone approve twenty-four skills one at a time is what makes an
 * import feel like data entry. Employment, education and credentials always get
 * an individual look — they carry dates, institutions and claims that matter.
 */
export const BULK_CONFIRMABLE_ENTITY_TYPES: readonly CvImportEntityType[] = [
  CvImportEntityType.SKILL,
  CvImportEntityType.LANGUAGE,
];

export function isBulkConfirmable(entityType: CvImportEntityType): boolean {
  return BULK_CONFIRMABLE_ENTITY_TYPES.includes(entityType);
}

/**
 * Stable codes for conflicts a user must resolve explicitly. Each one is a
 * situation where importing silently would put something on a CV that the
 * source document does not support.
 */
export const IMPORT_CONFLICT_CODES = [
  /** A field the canonical table requires was not stated in the CV. */
  'MISSING_REQUIRED_FIELD',
  /** The same role at the same employer already exists with different dates. */
  'CONFLICTING_DATES',
  /** The same qualification already exists against a different institution. */
  'CONTRADICTORY_INSTITUTION',
  /** The CV's name differs materially from the account's confirmed name. */
  'IDENTITY_MISMATCH',
  /** The same employer appears twice as a current role. */
  'DUPLICATE_CURRENT_EMPLOYMENT',
  /** The end date precedes the start date. */
  'IMPOSSIBLE_DATE_ORDER',
  /**
   * The profile already holds a different value for this identity field. Never
   * resolved automatically: a CV is not evidence that it is more current than
   * what the user typed, and overwriting a confirmed phone or LinkedIn URL from
   * a document is exactly the silent-overwrite this pipeline forbids.
   */
  'IDENTITY_VALUE_DIFFERS',
  /**
   * Read out of the CV but not resolvable to a canonical form — a national-format
   * phone number on a CV that never says which country, a URL that classifies as
   * something other than the field it was found in. Kept and shown rather than
   * discarded, with the raw wording intact, for the user to complete.
   */
  'AMBIGUOUS_VALUE',
  /** This Career Track already has a different professional summary. */
  'SUMMARY_ALREADY_SET',
  /**
   * The CV wrote a handle as a label ("linkedIn/amara-okafor") with no address
   * behind it, so the URL was worked out from the handle. Held for a check
   * rather than accepted: on the document that prompted this rule the label and
   * the real hyperlink disagreed, so a handle shows intent, not an address.
   */
  'UNVERIFIED_LINK',
] as const;

export type ImportConflictCode = (typeof IMPORT_CONFLICT_CODES)[number];
