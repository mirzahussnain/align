import { createHash } from 'node:crypto';
import { CvImportEntityType, CvImportReviewStatus } from '@/generated/prisma/client';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { isProfileDateBefore } from '@/shared/utils/date';
import { normaliseSkillName } from '@/shared/utils/skill-normalization';
import type { CvExtractionPayload, CvSourceLocation } from '../cv-extraction/types';
import type { ImportConflictCode } from './classification';
import { compareWithCurrent, identityProposals, IDENTITY_FIELD_LABELS } from './identity-fields';

/**
 * Turning an extraction into reviewable proposals.
 *
 * Nothing here writes to a canonical table. Every output is a candidate the user
 * will see, and the interesting work is deciding which of them are already in
 * the profile (DUPLICATE), which contradict what is already there (CONFLICT),
 * and which are missing something the database will insist on
 * (MISSING_REQUIRED_FIELD) — because each of those is a case where importing
 * silently would either duplicate the user's history or put an unsupported
 * claim on their CV.
 */

export interface CandidateDraft {
  entityType: CvImportEntityType;
  structuredData: Record<string, unknown>;
  sourceExcerpt: string;
  sourceLocation: CvSourceLocation | null;
  confidence: number | null;
  reviewStatus: CvImportReviewStatus;
  conflictCode: ImportConflictCode | null;
  dedupeKey: string;
}

/** Case- and whitespace-insensitive comparison key for free-text identity. */
function key(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean)
    .join('|');
}

/**
 * A stable, bounded id for a proposal within its session.
 *
 * Hashed because the natural key ("senior staff nurse|manchester royal
 * infirmary") is unbounded, and this backs a unique index. Stability is what
 * makes candidate generation idempotent: re-running extraction on the same CV
 * resolves to the same rows instead of proposing everything twice.
 */
function dedupeKey(entityType: CvImportEntityType, natural: string): string {
  return `${entityType}:${createHash('sha256').update(natural).digest('hex').slice(0, 32)}`;
}

/** The existing profile, reduced to the comparison keys duplicate detection needs. */
interface ProfileIndex {
  experience: Map<string, { startDate: string; endDate: string; current: boolean }>;
  currentEmployers: Set<string>;
  education: Map<string, string>;
  educationByDegree: Map<string, string>;
  projects: Set<string>;
  skills: Set<string>;
  certifications: Set<string>;
  training: Set<string>;
  licences: Set<string>;
  registrations: Set<string>;
  languages: Set<string>;
  volunteering: Set<string>;
  otherEvidence: Set<string>;
  fullName: string;
}

export function indexProfile(profile: ProfileData): ProfileIndex {
  const experience = new Map<string, { startDate: string; endDate: string; current: boolean }>();
  const currentEmployers = new Set<string>();
  for (const item of profile.experience) {
    experience.set(key(item.jobTitle, item.company), {
      startDate: item.startDate,
      endDate: item.endDate,
      current: item.current,
    });
    if (item.current) currentEmployers.add(key(item.company));
  }

  const education = new Map<string, string>();
  const educationByDegree = new Map<string, string>();
  for (const item of profile.education) {
    education.set(key(item.degree, item.university), item.university);
    educationByDegree.set(key(item.degree), item.university);
  }

  return {
    experience,
    currentEmployers,
    education,
    educationByDegree,
    projects: new Set(profile.projects.map((item) => key(item.name))),
    skills: new Set(
      profile.skills.flatMap((group) => group.skillItems.map((skill) => normaliseSkillName(skill.name)))
    ),
    certifications: new Set(profile.certifications.map((item) => key(item.name, item.issuer))),
    training: new Set(profile.trainings.map((item) => key(item.course, item.provider))),
    licences: new Set(profile.licences.map((item) => key(item.officialName, item.issuingBody))),
    registrations: new Set(
      profile.professionalRegistrations.map((item) => key(item.officialName, item.issuingBody))
    ),
    languages: new Set(profile.languages.map((item) => key(item.language))),
    volunteering: new Set(profile.volunteering.map((item) => key(item.role, item.organisation))),
    otherEvidence: new Set(profile.otherEvidence.map((item) => key(item.title))),
    fullName: key(profile.personal.fullName),
  };
}

function statusFor(
  duplicate: boolean,
  conflict: ImportConflictCode | null
): { reviewStatus: CvImportReviewStatus; conflictCode: ImportConflictCode | null } {
  // A conflict outranks a duplicate: "this contradicts what you have" needs a
  // decision, while "you already have this" needs only an acknowledgement.
  if (conflict) return { reviewStatus: CvImportReviewStatus.CONFLICT, conflictCode: conflict };
  if (duplicate) return { reviewStatus: CvImportReviewStatus.DUPLICATE, conflictCode: null };
  return { reviewStatus: CvImportReviewStatus.PROPOSED, conflictCode: null };
}

/** An end before a start is always terminal, whatever else the entry says. */
function impossibleOrder(start: string | null, end: string | null): boolean {
  return Boolean(start && end && isProfileDateBefore(end, start));
}

function draft(
  entityType: CvImportEntityType,
  natural: string,
  payload: Record<string, unknown>,
  provenance: { excerpt: string; sourceLocation?: CvSourceLocation },
  state: { duplicate?: boolean; conflict?: ImportConflictCode | null }
): CandidateDraft {
  return {
    entityType,
    structuredData: payload,
    sourceExcerpt: provenance.excerpt,
    sourceLocation: provenance.sourceLocation ?? null,
    confidence: null,
    dedupeKey: dedupeKey(entityType, natural),
    ...statusFor(Boolean(state.duplicate), state.conflict ?? null),
  };
}

export interface BuildCandidatesInput {
  extraction: CvExtractionPayload;
  profile: ProfileData;
  /** The account's confirmed name, used only to detect an identity mismatch. */
  accountFullName: string;
}

/**
 * Build the full set of proposals for importing one extraction into one profile.
 *
 * Deliberately returns EVERY proposal, including duplicates and conflicts.
 * Filtering them out here would be the silent-discard the review step exists to
 * prevent: a user should see "you already have this" and decide, not wonder why
 * three of their jobs did not appear.
 */
export function buildImportCandidates(input: BuildCandidatesInput): CandidateDraft[] {
  const { extraction, profile } = input;
  const index = indexProfile(profile);
  const drafts: CandidateDraft[] = [];

  // ── Identity ───────────────────────────────────────────────────────────────
  // One proposal per FIELD, never applied without confirmation. Each is compared
  // with what the profile already holds, so an empty field is an addition, an
  // identical value is a no-op, and a different value is a conflict the user
  // resolves — the CV might be out of date, or the upload might not be theirs,
  // and we cannot tell which.
  const accountName = key(input.accountFullName) || index.fullName;
  for (const proposal of identityProposals(extraction.identity, extraction.derivedIdentity ?? [])) {
    const verdict = compareWithCurrent(proposal, profile.personal);

    let conflict: ImportConflictCode | null = null;
    if (proposal.field === 'fullName') {
      // The account's own confirmed name gets its established, distinct code:
      // "this CV may not be yours" is a different question from "your profile
      // says something else".
      const cvName = key(proposal.normalised);
      if (cvName && accountName && cvName !== accountName) conflict = 'IDENTITY_MISMATCH';
    }
    if (!conflict && verdict === 'conflict') conflict = 'IDENTITY_VALUE_DIFFERS';
    if (!conflict && proposal.derivedFromLabel) conflict = 'UNVERIFIED_LINK';
    if (!conflict && proposal.needsReview) conflict = 'AMBIGUOUS_VALUE';

    drafts.push({
      ...draft(
        CvImportEntityType.IDENTITY_UPDATE,
        `identity:${proposal.field}`,
        { ...proposal.payload, field: proposal.field, rawValue: proposal.raw },
        { excerpt: `${IDENTITY_FIELD_LABELS[proposal.field]}: ${proposal.raw}` },
        { duplicate: verdict === 'duplicate', conflict }
      ),
      confidence: proposal.confidence,
    });
  }

  // ── Professional summary ───────────────────────────────────────────────────
  // Proposed only when the CV had a summary SECTION. Nothing is assembled out of
  // the rest of the document: a paragraph we wrote would read as the user's own
  // words on a CV they send to employers.
  if (extraction.summary && extraction.summarySource) {
    const existing = profile.personal.professionalSummary?.trim() ?? '';
    const same = existing && key(existing) === key(extraction.summary);
    drafts.push({
      ...draft(
        CvImportEntityType.PROFILE_SUMMARY_UPDATE,
        `summary:${key(extraction.summary).slice(0, 120)}`,
        { professionalSummary: extraction.summary, rawValue: extraction.summary },
        {
          excerpt: extraction.summarySource.excerpt,
          sourceLocation: extraction.summarySource.sourceLocation,
        },
        // An existing summary is never replaced without an explicit decision —
        // it is usually the user's own writing, tuned for the roles they want.
        { duplicate: Boolean(same), conflict: existing && !same ? 'SUMMARY_ALREADY_SET' : null }
      ),
      confidence: 0.85,
    });
  }

  // ── Experience ─────────────────────────────────────────────────────────────
  const seenCurrentEmployers = new Set(index.currentEmployers);
  for (const item of extraction.experience) {
    const naturalKey = key(item.jobTitle, item.company);
    const existing = index.experience.get(naturalKey);
    const employerKey = key(item.company);

    let conflict: ImportConflictCode | null = null;
    // Employer and start date are both NOT NULL on `Experience`. A CV that omits
    // either is asking the user for it, not licensing us to make one up.
    if (!item.company || !item.startDate) conflict = 'MISSING_REQUIRED_FIELD';
    else if (impossibleOrder(item.startDate, item.endDate)) conflict = 'IMPOSSIBLE_DATE_ORDER';
    else if (
      existing &&
      ((item.startDate && existing.startDate && item.startDate !== existing.startDate) ||
        (item.endDate && existing.endDate && item.endDate !== existing.endDate))
    ) {
      conflict = 'CONFLICTING_DATES';
    } else if (item.current && employerKey && seenCurrentEmployers.has(employerKey)) {
      conflict = 'DUPLICATE_CURRENT_EMPLOYMENT';
    }
    if (item.current && employerKey) seenCurrentEmployers.add(employerKey);

    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.EXPERIENCE, naturalKey, payload, { excerpt, sourceLocation }, {
        duplicate: Boolean(existing),
        conflict,
      })
    );
  }

  // ── Education ──────────────────────────────────────────────────────────────
  for (const item of extraction.education) {
    const naturalKey = key(item.degree, item.university);
    const sameInstitution = index.education.has(naturalKey);
    const otherInstitution = index.educationByDegree.get(key(item.degree));

    let conflict: ImportConflictCode | null = null;
    if (!item.university) conflict = 'MISSING_REQUIRED_FIELD';
    else if (impossibleOrder(item.startDate, item.endDate)) conflict = 'IMPOSSIBLE_DATE_ORDER';
    else if (!sameInstitution && otherInstitution && key(otherInstitution) !== key(item.university)) {
      conflict = 'CONTRADICTORY_INSTITUTION';
    }

    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.EDUCATION, naturalKey, payload, { excerpt, sourceLocation }, {
        duplicate: sameInstitution,
        conflict,
      })
    );
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  for (const item of extraction.projects) {
    const naturalKey = key(item.name);
    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.PROJECT, naturalKey, payload, { excerpt, sourceLocation }, {
        duplicate: index.projects.has(naturalKey),
        conflict: impossibleOrder(item.startDate, item.endDate) ? 'IMPOSSIBLE_DATE_ORDER' : null,
      })
    );
  }

  // ── Skills ─────────────────────────────────────────────────────────────────
  for (const item of extraction.skills) {
    const normalised = normaliseSkillName(item.name);
    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.SKILL, normalised, payload, { excerpt, sourceLocation }, {
        duplicate: index.skills.has(normalised),
      })
    );
  }

  // ── Credentials ────────────────────────────────────────────────────────────
  const credentialGroups = [
    { entityType: CvImportEntityType.CERTIFICATION, items: extraction.certifications, existing: index.certifications },
    { entityType: CvImportEntityType.LICENCE, items: extraction.licences, existing: index.licences },
    {
      entityType: CvImportEntityType.PROFESSIONAL_REGISTRATION,
      items: extraction.professionalRegistrations,
      existing: index.registrations,
    },
  ] as const;
  for (const group of credentialGroups) {
    for (const item of group.items) {
      const naturalKey = key(item.officialName, item.issuingBody);
      const { excerpt, sourceLocation, ...payload } = item;
      // A professional registration needs its issuing body — the DB requires it,
      // and "registered" without saying with whom is not a verifiable claim.
      const missingBody =
        group.entityType === CvImportEntityType.PROFESSIONAL_REGISTRATION && !item.issuingBody;
      drafts.push(
        draft(group.entityType, naturalKey, payload, { excerpt, sourceLocation }, {
          duplicate: group.existing.has(naturalKey),
          conflict: missingBody
            ? 'MISSING_REQUIRED_FIELD'
            : impossibleOrder(item.issueDate, item.expiryDate)
              ? 'IMPOSSIBLE_DATE_ORDER'
              : null,
        })
      );
    }
  }

  // ── Training ───────────────────────────────────────────────────────────────
  for (const item of extraction.training) {
    const naturalKey = key(item.course, item.provider);
    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.TRAINING, naturalKey, payload, { excerpt, sourceLocation }, {
        duplicate: index.training.has(naturalKey),
        conflict: impossibleOrder(item.startDate, item.endDate) ? 'IMPOSSIBLE_DATE_ORDER' : null,
      })
    );
  }

  // ── Languages ──────────────────────────────────────────────────────────────
  for (const item of extraction.languages) {
    const naturalKey = key(item.language);
    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.LANGUAGE, naturalKey, payload, { excerpt, sourceLocation }, {
        duplicate: index.languages.has(naturalKey),
      })
    );
  }

  // ── Volunteering ───────────────────────────────────────────────────────────
  for (const item of extraction.volunteering) {
    const naturalKey = key(item.role, item.organisation);
    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.VOLUNTEERING, naturalKey, payload, { excerpt, sourceLocation }, {
        duplicate: index.volunteering.has(naturalKey),
        conflict: !item.organisation
          ? 'MISSING_REQUIRED_FIELD'
          : impossibleOrder(item.startDate, item.endDate)
            ? 'IMPOSSIBLE_DATE_ORDER'
            : null,
      })
    );
  }

  // ── Reusable evidence ──────────────────────────────────────────────────────
  // The only type that can consume the reusable-evidence allowance, and only
  // once confirmed. Proposing it costs nothing.
  for (const item of extraction.otherEvidence) {
    const naturalKey = key(item.title);
    const { excerpt, sourceLocation, ...payload } = item;
    drafts.push(
      draft(CvImportEntityType.OTHER_EVIDENCE, naturalKey, payload, { excerpt, sourceLocation }, {
        duplicate: index.otherEvidence.has(naturalKey),
      })
    );
  }

  // Two proposals with the same dedupe key would violate the session's unique
  // index. That means the CV listed the same thing twice; the first wins and the
  // second is not a separate fact.
  const seen = new Set<string>();
  return drafts.filter((item) => (seen.has(item.dedupeKey) ? false : (seen.add(item.dedupeKey), true)));
}
