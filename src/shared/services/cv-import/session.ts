import { prisma } from '@/shared/lib/prisma';
import {
  CvImportEntityType,
  CvImportReviewStatus,
  CvImportSessionStatus,
  type Prisma,
} from '@/generated/prisma/client';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { EntitlementRequiredError } from '@/shared/entitlements/server';
import { StructuredEvidenceValidationError } from '../structured-evidence';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { CvPipelineError } from '../cv-extraction/errors';
import { loadOwnedExtraction } from '../stored-cv';
import { buildImportCandidates } from './candidates';
import { createCanonicalRecord } from './canonical';
import { validateImportPayload, parseStoredImportPayload } from './payloads';
import { ENTITY_TYPE_LABELS, isBulkConfirmable } from './classification';
import { identityProposals, type IdentityField } from './identity-fields';
import type { ImportConflictCode } from './classification';

/**
 * The import session: one stored CV being imported into one Career Profile.
 *
 * Opening a session is idempotent and free — no quota, no AI, no canonical
 * writes. Proposals exist so the user can look at them, and looking at your own
 * CV should never cost anything.
 */

export interface ImportCandidateView {
  id: string;
  entityType: CvImportEntityType;
  reviewStatus: CvImportReviewStatus;
  conflictCode: string | null;
  structuredData: unknown;
  sourceExcerpt: string;
  confidence: number | null;
  /** True where this type may be confirmed as a group rather than one by one. */
  bulkConfirmable: boolean;
  createdEntityId: string | null;
}

export interface ImportSessionView {
  id: string;
  storedCvId: string;
  extractionId: string;
  profileId: string;
  status: CvImportSessionStatus;
  reconciliationStatus: string | null;
  candidates: ImportCandidateView[];
  /** Per-type counts for the review summary, in review order. */
  summary: { entityType: CvImportEntityType; label: string; proposed: number; duplicate: number; conflict: number; confirmed: number }[];
}

function toCandidateView(row: {
  id: string;
  entityType: CvImportEntityType;
  reviewStatus: CvImportReviewStatus;
  conflictCode: string | null;
  structuredData: Prisma.JsonValue;
  sourceExcerpt: string;
  confidence: number | null;
  createdEntityId: string | null;
}): ImportCandidateView {
  return {
    id: row.id,
    entityType: row.entityType,
    reviewStatus: row.reviewStatus,
    conflictCode: row.conflictCode,
    structuredData: row.structuredData,
    sourceExcerpt: row.sourceExcerpt,
    confidence: row.confidence,
    bulkConfirmable: isBulkConfirmable(row.entityType),
    createdEntityId: row.createdEntityId,
  };
}

const SUMMARY_ORDER: CvImportEntityType[] = [
  CvImportEntityType.EXPERIENCE,
  CvImportEntityType.EDUCATION,
  CvImportEntityType.PROJECT,
  CvImportEntityType.SKILL,
  CvImportEntityType.CERTIFICATION,
  CvImportEntityType.LICENCE,
  CvImportEntityType.PROFESSIONAL_REGISTRATION,
  CvImportEntityType.TRAINING,
  CvImportEntityType.LANGUAGE,
  CvImportEntityType.VOLUNTEERING,
  CvImportEntityType.OTHER_EVIDENCE,
  CvImportEntityType.IDENTITY_UPDATE,
  CvImportEntityType.PROFILE_SUMMARY_UPDATE,
];

function summarise(candidates: ImportCandidateView[]): ImportSessionView['summary'] {
  return SUMMARY_ORDER.map((entityType) => {
    const forType = candidates.filter((candidate) => candidate.entityType === entityType);
    const count = (status: CvImportReviewStatus) =>
      forType.filter((candidate) => candidate.reviewStatus === status).length;
    const proposed = count(CvImportReviewStatus.PROPOSED) + count(CvImportReviewStatus.EDITED);
    const confirmed = count(CvImportReviewStatus.CONFIRMED);
    const labels = ENTITY_TYPE_LABELS[entityType];
    return {
      entityType,
      label: forType.length === 1 ? labels.one : labels.many,
      proposed,
      duplicate: count(CvImportReviewStatus.DUPLICATE),
      conflict: count(CvImportReviewStatus.CONFLICT),
      confirmed,
    };
  }).filter((group) => group.proposed + group.duplicate + group.conflict + group.confirmed > 0);
}

/**
 * Open (or resume) the import of a stored CV into a Career Profile.
 *
 * `(storedCvId, profileId)` is unique, so a user who refreshes, comes back a day
 * later or double-clicks the button lands on the SAME session with the same
 * candidate ids — which is what makes resuming an interrupted import safe, and
 * what stops a second visit proposing every job twice.
 *
 * Candidates are generated once. Re-opening never regenerates them, because the
 * user may already have edited, rejected or confirmed some and regenerating
 * would silently discard those decisions.
 */
export async function openImportSession(args: {
  userId: string;
  storedCvId: string;
  extractionId: string;
  profileId: string;
  accountFullName: string;
}): Promise<ImportSessionView> {
  const profile = await loadOwnedProfileData(args.userId, args.profileId);
  if (!profile) throw new CvPipelineError('NOT_FOUND', 404);

  const { extraction, structured } = await loadOwnedExtraction(args.userId, args.extractionId);
  if (extraction.storedCvId !== args.storedCvId) throw new CvPipelineError('NOT_FOUND', 404);

  const existing = await prisma.cvImportSession.findUnique({
    where: { storedCvId_profileId: { storedCvId: args.storedCvId, profileId: args.profileId } },
    include: { candidates: { orderBy: { createdAt: 'asc' } } },
  });
  if (existing) {
    if (existing.userId !== args.userId) throw new CvPipelineError('FORBIDDEN', 403);
    const candidates = existing.candidates.map(toCandidateView);
    return {
      id: existing.id,
      storedCvId: existing.storedCvId,
      extractionId: existing.extractionId,
      profileId: existing.profileId,
      status: existing.status,
      reconciliationStatus: existing.reconciliationStatus,
      candidates,
      summary: summarise(candidates),
    };
  }

  const drafts = buildImportCandidates({
    extraction: structured,
    profile,
    accountFullName: args.accountFullName,
  });

  const session = await prisma.cvImportSession.create({
    data: {
      userId: args.userId,
      storedCvId: args.storedCvId,
      extractionId: args.extractionId,
      profileId: args.profileId,
      status: drafts.length > 0 ? CvImportSessionStatus.REVIEWING : CvImportSessionStatus.DRAFT,
      reconciliationStatus: 'not_requested',
      candidates: {
        create: drafts.map((item) => ({
          userId: args.userId,
          storedCvId: args.storedCvId,
          extractionId: args.extractionId,
          profileId: args.profileId,
          entityType: item.entityType,
          structuredData: item.structuredData as Prisma.InputJsonValue,
          sourceExcerpt: item.sourceExcerpt,
          sourceLocation: (item.sourceLocation ?? undefined) as Prisma.InputJsonValue | undefined,
          confidence: item.confidence,
          reviewStatus: item.reviewStatus,
          conflictCode: item.conflictCode,
          parserVersion: extraction.parserVersion,
          dedupeKey: item.dedupeKey,
        })),
      },
    },
    include: { candidates: { orderBy: { createdAt: 'asc' } } },
  });

  const candidates = session.candidates.map(toCandidateView);
  return {
    id: session.id,
    storedCvId: session.storedCvId,
    extractionId: session.extractionId,
    profileId: session.profileId,
    status: session.status,
    reconciliationStatus: session.reconciliationStatus,
    candidates,
    summary: summarise(candidates),
  };
}

/** Load a session the user owns, with its candidates. */
export async function loadImportSession(userId: string, sessionId: string): Promise<ImportSessionView> {
  const session = await prisma.cvImportSession.findFirst({
    where: { id: sessionId, userId },
    include: { candidates: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) throw new CvPipelineError('NOT_FOUND', 404);
  const candidates = session.candidates.map(toCandidateView);
  return {
    id: session.id,
    storedCvId: session.storedCvId,
    extractionId: session.extractionId,
    profileId: session.profileId,
    status: session.status,
    reconciliationStatus: session.reconciliationStatus,
    candidates,
    summary: summarise(candidates),
  };
}

export type CandidateDecision =
  | { candidateId: string; action: 'confirm'; edited?: unknown }
  | { candidateId: string; action: 'reject' };

export interface DecisionOutcome {
  candidateId: string;
  /** What actually happened, so the UI never has to infer it. */
  outcome:
    | 'imported'
    | 'rejected'
    | 'already_imported'
    | 'blocked_by_limit'
    | 'unresolved_conflict'
    | 'invalid'
    /** This one candidate failed unexpectedly. It stays proposed and reviewable. */
    | 'failed';
  createdEntityId?: string;
  /** Present for `blocked_by_limit`, carrying the live entitlement decision. */
  decision?: CapabilityDecision;
}

export interface ApplyDecisionsResult {
  sessionId: string;
  outcomes: DecisionOutcome[];
  imported: number;
  /** Candidates left reviewable because capacity ran out — never discarded. */
  pendingCapacity: number;
  /** Candidates that could not be saved for any other reason — also not discarded. */
  failed: number;
  session: ImportSessionView;
}

/**
 * Apply the user's decisions to a batch of candidates.
 *
 * Each candidate is applied in its OWN transaction, deliberately. A single
 * transaction across the batch would mean one full reusable-evidence allowance
 * rolls back twenty perfectly valid work experiences, which is exactly the
 * "do not fail the whole import" case: canonical career records are uncapped and
 * must all land, while `OtherEvidence` beyond the allowance simply stays
 * proposed and reviewable for later.
 *
 * Within a candidate the write and its provenance stamp ARE atomic, so a
 * canonical row can never exist without the confirmed candidate that records
 * where it came from.
 *
 * That isolation has to cover EVERY failure, not the two the design anticipated.
 * A candidate that trips a validator or a database constraint is one candidate's
 * problem: it is reported as such and left proposed, rather than turning twenty
 * good records into an opaque 500.
 */
export async function applyCandidateDecisions(args: {
  userId: string;
  sessionId: string;
  decisions: CandidateDecision[];
}): Promise<ApplyDecisionsResult> {
  const session = await prisma.cvImportSession.findFirst({
    where: { id: args.sessionId, userId: args.userId },
    select: { id: true, profileId: true },
  });
  if (!session) throw new CvPipelineError('NOT_FOUND', 404);

  const outcomes: DecisionOutcome[] = [];
  let imported = 0;
  let pendingCapacity = 0;
  let failed = 0;

  for (const decision of args.decisions) {
    const candidate = await prisma.cvImportCandidate.findFirst({
      where: { id: decision.candidateId, sessionId: session.id, userId: args.userId },
    });
    if (!candidate) {
      outcomes.push({ candidateId: decision.candidateId, outcome: 'invalid' });
      continue;
    }

    if (decision.action === 'reject') {
      await prisma.cvImportCandidate.update({
        where: { id: candidate.id },
        data: { reviewStatus: CvImportReviewStatus.REJECTED },
      });
      outcomes.push({ candidateId: candidate.id, outcome: 'rejected' });
      continue;
    }

    // Idempotency: a retried or double-submitted confirmation resolves to the
    // row that already exists rather than creating a second one.
    if (candidate.reviewStatus === CvImportReviewStatus.CONFIRMED && candidate.createdEntityId) {
      outcomes.push({
        candidateId: candidate.id,
        outcome: 'already_imported',
        createdEntityId: candidate.createdEntityId,
      });
      continue;
    }

    // An edit replaces the payload but never the provenance: `sourceExcerpt`,
    // `extractionId` and `parserVersion` stay as the record of what the DOCUMENT
    // said, which is the whole point of keeping them.
    let payload: unknown;
    try {
      payload = validateImportPayload(
        candidate.entityType,
        decision.edited ?? candidate.structuredData
      );
    } catch {
      outcomes.push({ candidateId: candidate.id, outcome: 'invalid' });
      failed += 1;
      continue;
    }

    try {
      if (candidate.entityType === CvImportEntityType.IDENTITY_UPDATE) {
        const applied = await applyIdentityUpdate(args.userId, candidate.id, payload);
        outcomes.push({ candidateId: candidate.id, outcome: 'imported', createdEntityId: applied });
        imported += 1;
        continue;
      }

      const created = await prisma.$transaction(async (tx) => {
        const entity = await createCanonicalRecord({
          tx,
          userId: args.userId,
          profileId: session.profileId,
          entityType: candidate.entityType,
          payload,
        });
        await tx.cvImportCandidate.update({
          where: { id: candidate.id },
          data: {
            reviewStatus: CvImportReviewStatus.CONFIRMED,
            structuredData: payload as Prisma.InputJsonValue,
            conflictCode: null,
            createdEntityType: entity.entityType,
            createdEntityId: entity.entityId,
            confirmedAt: new Date(),
            confirmedByUserId: args.userId,
          },
        });
        return entity;
      });
      outcomes.push({ candidateId: candidate.id, outcome: 'imported', createdEntityId: created.entityId });
      imported += 1;
    } catch (error) {
      if (error instanceof EntitlementRequiredError) {
        // Capacity is full. The candidate stays exactly as it was — reviewable,
        // importable later, and costing nothing in the meantime.
        pendingCapacity += 1;
        outcomes.push({ candidateId: candidate.id, outcome: 'blocked_by_limit', decision: error.decision });
        continue;
      }
      if (error instanceof CvPipelineError && error.code === 'CANDIDATE_CONFLICT') {
        outcomes.push({ candidateId: candidate.id, outcome: 'unresolved_conflict' });
        continue;
      }
      if (error instanceof StructuredEvidenceValidationError) {
        // The canonical validator refused this payload. One candidate's problem.
        outcomes.push({ candidateId: candidate.id, outcome: 'invalid' });
        failed += 1;
        continue;
      }
      // Anything else is a defect, not a user error — but it is still confined to
      // the candidate that caused it. Logged with real detail here, because the
      // response deliberately carries none.
      console.error(
        `[cv-import] Candidate ${candidate.id} (${candidate.entityType}) failed:`,
        error instanceof Error ? error.message : error
      );
      outcomes.push({ candidateId: candidate.id, outcome: 'failed' });
      failed += 1;
    }
  }

  await updateSessionStatus(session.id);
  return {
    sessionId: session.id,
    outcomes,
    imported,
    pendingCapacity,
    failed,
    session: await loadImportSession(args.userId, session.id),
  };
}

/**
 * Apply a confirmed identity proposal to the SHARED ProfileIdentity.
 *
 * Only the COLUMNS this one field maps to are written, and only when the
 * candidate carried them. A phone contributes three columns and they are written
 * together — writing the number without its dial code is what left the picker
 * blank beside a full international string, so the split is applied as a unit
 * and never half of it.
 *
 * `rawValue` and `field` are provenance and routing; neither is a column and
 * neither is written. The account's own `User.name` and verified `User.email`
 * are never touched from here either: those are authentication facts, and a CV
 * is not evidence about them.
 */
async function applyIdentityUpdate(userId: string, candidateId: string, payload: unknown): Promise<string> {
  const data = payload as {
    field?: string;
    fullName?: string;
    email?: string;
    phoneDialCode?: string;
    phoneNumber?: string;
    phoneCountry?: string;
    linkedin?: string;
    github?: string;
    website?: string;
  };

  const columns = {
    ...(data.fullName ? { fullName: data.fullName } : {}),
    ...(data.email ? { email: data.email } : {}),
    ...(data.phoneDialCode ? { phoneDialCode: data.phoneDialCode } : {}),
    ...(data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
    ...(data.phoneCountry ? { phoneCountry: data.phoneCountry } : {}),
    ...(data.linkedin ? { linkedin: data.linkedin } : {}),
    ...(data.github ? { github: data.github } : {}),
    ...(data.website ? { website: data.website } : {}),
  };

  const identity = await prisma.profileIdentity.upsert({
    where: { userId },
    // `fullName` is NOT NULL on the table and the row may not exist yet, so a
    // first proposal for some other field still has to supply one.
    create: { userId, ...columns, fullName: data.fullName ?? '' },
    update: columns,
    select: { id: true },
  });
  await prisma.cvImportCandidate.update({
    where: { id: candidateId },
    data: {
      reviewStatus: CvImportReviewStatus.CONFIRMED,
      structuredData: data as Prisma.InputJsonValue,
      conflictCode: null,
      createdEntityType: 'profile_identity',
      createdEntityId: identity.id,
      confirmedAt: new Date(),
      confirmedByUserId: userId,
    },
  });
  return identity.id;
}

/**
 * The provenance stamp on a detail the user typed during review.
 *
 * Candidates normally carry a verbatim quote from the document, and that quote
 * is the durable evidence for the canonical record it creates. A value the CV
 * never contained has no such quote, and inventing one would corrupt exactly the
 * audit trail the excerpt exists to provide — so it says plainly where the value
 * came from instead.
 */
export const USER_SUPPLIED_EXCERPT = 'Added during review — not read from the CV';

/**
 * Add an identity detail the CV did not contain.
 *
 * The alternative was telling a user whose CV has no LinkedIn URL to abandon the
 * import and go and find the profile form, which is the kind of dead end that
 * makes people give up halfway. The value still becomes a reviewable candidate
 * and still needs confirming — it does not shortcut the one path by which
 * anything reaches `ProfileIdentity`.
 */
export async function addUserSuppliedIdentity(args: {
  userId: string;
  sessionId: string;
  field: IdentityField;
  value: string;
}): Promise<ImportSessionView> {
  const session = await prisma.cvImportSession.findFirst({
    where: { id: args.sessionId, userId: args.userId },
    select: { id: true, storedCvId: true, extractionId: true, profileId: true },
  });
  if (!session) throw new CvPipelineError('NOT_FOUND', 404);

  const value = args.value.trim();
  if (!value) throw new CvPipelineError('INVALID_PARSER_OUTPUT', 422);

  // Routed through the same field builder the parser uses, so a typed phone is
  // split into its three columns exactly as an imported one is. One contract for
  // the shape of an identity value, whoever supplied it.
  const [proposal] = identityProposals(identityFromField(args.field, value));
  if (!proposal) throw new CvPipelineError('INVALID_PARSER_OUTPUT', 422);

  const payload = { ...proposal.payload, field: proposal.field, rawValue: proposal.raw };
  const dedupeKey = `${CvImportEntityType.IDENTITY_UPDATE}:user:${proposal.field}`;

  await prisma.cvImportCandidate.upsert({
    where: { sessionId_dedupeKey: { sessionId: session.id, dedupeKey } },
    create: {
      userId: args.userId,
      sessionId: session.id,
      storedCvId: session.storedCvId,
      extractionId: session.extractionId,
      profileId: session.profileId,
      entityType: CvImportEntityType.IDENTITY_UPDATE,
      structuredData: payload as Prisma.InputJsonValue,
      sourceExcerpt: USER_SUPPLIED_EXCERPT,
      confidence: null,
      reviewStatus: CvImportReviewStatus.EDITED,
      parserVersion: USER_SUPPLIED_PARSER_VERSION,
      dedupeKey,
    },
    update: {
      structuredData: payload as Prisma.InputJsonValue,
      reviewStatus: CvImportReviewStatus.EDITED,
      conflictCode: null,
    },
  });

  await updateSessionStatus(session.id);
  return loadImportSession(args.userId, session.id);
}

/** Stamped instead of a parser version, because no parser produced this. */
const USER_SUPPLIED_PARSER_VERSION = 'user-supplied@1';

/** Build the minimal extracted-identity shape one field's value implies. */
function identityFromField(field: IdentityField, value: string) {
  return field === 'phone' ? { phone: value } : { [field]: value };
}

/**
 * Recompute a session's status from its candidates.
 *
 * PARTIALLY_IMPORTED is a real, common state and is kept distinct from
 * COMPLETED: a user who imported their jobs but left ten evidence proposals
 * pending on a full allowance has not finished, and telling them they have would
 * hide work they can still come back to.
 */
async function updateSessionStatus(sessionId: string): Promise<void> {
  const counts = await prisma.cvImportCandidate.groupBy({
    by: ['reviewStatus'],
    where: { sessionId },
    _count: { _all: true },
  });
  const by = (status: CvImportReviewStatus) =>
    counts.find((row) => row.reviewStatus === status)?._count._all ?? 0;

  const outstanding =
    by(CvImportReviewStatus.PROPOSED) + by(CvImportReviewStatus.EDITED) + by(CvImportReviewStatus.CONFLICT);
  const confirmed = by(CvImportReviewStatus.CONFIRMED);

  const status =
    outstanding === 0
      ? CvImportSessionStatus.COMPLETED
      : confirmed > 0
        ? CvImportSessionStatus.PARTIALLY_IMPORTED
        : CvImportSessionStatus.REVIEWING;

  await prisma.cvImportSession.update({
    where: { id: sessionId },
    data: { status, ...(status === CvImportSessionStatus.COMPLETED ? { importedAt: new Date() } : {}) },
  });
}

/**
 * Entity types that a bulk "add everything safe" must never sweep up.
 *
 * Identity and the professional summary both OVERWRITE something shared rather
 * than adding a row beside it — a phone number, a LinkedIn URL, the paragraph at
 * the top of the user's CV. Each of those gets its own explicit decision, which
 * is also why they are grouped separately in the review UI.
 */
export const INDIVIDUAL_DECISION_ONLY: readonly CvImportEntityType[] = [
  CvImportEntityType.IDENTITY_UPDATE,
  CvImportEntityType.PROFILE_SUMMARY_UPDATE,
];

export function requiresIndividualDecision(entityType: CvImportEntityType): boolean {
  return INDIVIDUAL_DECISION_ONLY.includes(entityType);
}

/**
 * The candidates it is safe to confirm without opening each one.
 *
 * Excludes duplicates, conflicts and anything already decided — "confirm all
 * safe items" must never quietly resolve a contradiction or re-import something
 * the profile already holds — and excludes the overwriting types above.
 */
export function safeToConfirmInBulk(session: ImportSessionView): string[] {
  return session.candidates
    .filter(
      (candidate) =>
        candidate.reviewStatus === CvImportReviewStatus.PROPOSED &&
        !requiresIndividualDecision(candidate.entityType)
    )
    .map((candidate) => candidate.id);
}

export { parseStoredImportPayload };
export type { ImportConflictCode };
