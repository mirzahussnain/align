import { prisma } from '@/shared/lib/prisma';
import { CvImportReviewStatus, type Prisma } from '@/generated/prisma/client';
import { THINKING_BUDGETS } from '@/shared/lib/config';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { checkCapability, EntitlementRequiredError } from '@/shared/entitlements/server';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  reservationFingerprint,
} from '../capability-reservation';
import {
  AiOperationError,
  OperationConflictError,
  OperationInProgressError,
  markOperationRunning,
  reservationIsRunning,
} from '../ai-failure';
import { logReservationEvent } from '../reservation-observability';
import { generateJSONFromAI } from '../ai-orchestrator';
import { CvPipelineError } from '../cv-extraction/errors';
import { loadImportSession } from './session';
import type { CapabilityDecision } from '@/shared/entitlements/registry';

/**
 * Comparing an imported CV against an EXISTING Career Profile.
 *
 * A distinct capability from `profile_reconciliation`, which compares stored
 * profile evidence against a job-match requirement ledger and needs a job-match
 * analysis to exist. These are two different questions asked of two different
 * inputs, and giving them one allowance would mean using your import comparison
 * silently costs you your job-application comparison.
 *
 * Everything before the model is free: uploading, parsing, storing proposals,
 * detecting duplicates and reviewing them all cost nothing. Only a comparison
 * that actually reaches a provider and returns a usable result is charged.
 */

export const CV_IMPORT_RECONCILIATION_CAPABILITY = 'cv_import_reconciliation' as const;

export type ReconciliationVerdict = 'duplicate_of' | 'update_of' | 'new';

export interface ReconciliationFinding {
  candidateId: string;
  verdict: ReconciliationVerdict;
  /** The existing profile record this matches, when the verdict names one. */
  existingRecordId?: string;
  rationale: string;
}

export interface ReconciliationSummary {
  ranAt: string;
  findings: ReconciliationFinding[];
  /** Counts for the review header, so the UI needs no second pass. */
  duplicates: number;
  updates: number;
  fresh: number;
}

export type ReconcileOutcome =
  | { status: 'completed'; summary: ReconciliationSummary }
  | { status: 'skipped_empty_profile' }
  | { status: 'unavailable'; decision: CapabilityDecision };

interface RawFinding {
  candidateId?: unknown;
  verdict?: unknown;
  existingRecordId?: unknown;
  rationale?: unknown;
}

/**
 * Validate the model's findings against what actually exists.
 *
 * Every id is re-resolved against this session's candidates and this profile's
 * records; anything the model invented, duplicated or pointed at another user's
 * data is dropped rather than trusted. Dropping is right here — a reconciliation
 * finding is advice about a proposal, and bad advice should vanish rather than
 * fail an import the user can complete perfectly well by hand.
 */
export function validateFindings(
  raw: unknown,
  candidateIds: Set<string>,
  existingIds: Set<string>
): ReconciliationFinding[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const findings: ReconciliationFinding[] = [];

  for (const entry of raw as RawFinding[]) {
    if (!entry || typeof entry !== 'object') continue;
    const candidateId = typeof entry.candidateId === 'string' ? entry.candidateId.trim() : '';
    if (!candidateIds.has(candidateId) || seen.has(candidateId)) continue;

    const verdict = entry.verdict;
    if (verdict !== 'duplicate_of' && verdict !== 'update_of' && verdict !== 'new') continue;

    const existingRecordId =
      typeof entry.existingRecordId === 'string' ? entry.existingRecordId.trim() : '';
    // "This duplicates something" is only meaningful if it says WHAT. A verdict
    // pointing at a record that is not in this profile is discarded outright.
    if (verdict !== 'new' && !existingIds.has(existingRecordId)) continue;

    seen.add(candidateId);
    findings.push({
      candidateId,
      verdict,
      ...(verdict === 'new' ? {} : { existingRecordId }),
      rationale: typeof entry.rationale === 'string' ? entry.rationale.trim().slice(0, 400) : '',
    });
  }

  return findings;
}

/** Flatten a profile into the id-addressed inventory the comparison needs. */
function existingInventory(profile: Awaited<ReturnType<typeof loadOwnedProfileData>>) {
  if (!profile) return [] as { id: string; kind: string; text: string }[];
  return [
    ...profile.experience.map((item) => ({
      id: item.id,
      kind: 'experience',
      text: `${item.jobTitle} at ${item.company} (${item.startDate}–${item.current ? 'present' : item.endDate || 'unstated'})`,
    })),
    ...profile.education.map((item) => ({
      id: item.id,
      kind: 'education',
      text: `${item.degree}, ${item.university} (${item.startDate || 'unstated'}–${item.endDate || 'unstated'})`,
    })),
    ...profile.projects.map((item) => ({ id: item.id, kind: 'project', text: item.name })),
    ...profile.skills.flatMap((group) =>
      group.skillItems.map((skill) => ({ id: skill.id, kind: 'skill', text: skill.name }))
    ),
    ...profile.certifications.map((item) => ({
      id: item.id,
      kind: 'certification',
      text: `${item.name}${item.issuer ? ` — ${item.issuer}` : ''}`,
    })),
    ...profile.trainings.map((item) => ({ id: item.id, kind: 'training', text: item.course })),
    ...profile.licences.map((item) => ({ id: item.id, kind: 'licence', text: item.officialName })),
    ...profile.professionalRegistrations.map((item) => ({
      id: item.id,
      kind: 'registration',
      text: `${item.officialName} — ${item.issuingBody}`,
    })),
    ...profile.languages.map((item) => ({ id: item.id, kind: 'language', text: item.language })),
    ...profile.volunteering.map((item) => ({
      id: item.id,
      kind: 'volunteering',
      text: `${item.role} at ${item.organisation}`,
    })),
    ...profile.otherEvidence.map((item) => ({ id: item.id, kind: 'other', text: item.title })),
  ];
}

/**
 * Run reconciliation for an import session.
 *
 * Order is the reservation-ledger canonical one: validate cheap inputs, build a
 * stable operation identity, reserve, call the provider, validate the output,
 * persist, commit once. A failure at any point before the commit releases the
 * unit, so nothing is charged for a comparison the user never received.
 */
export async function reconcileImportSession(args: {
  userId: string;
  sessionId: string;
  operationId: string;
}): Promise<ReconcileOutcome> {
  const session = await loadImportSession(args.userId, args.sessionId);
  const profile = await loadOwnedProfileData(args.userId, session.profileId);
  if (!profile) throw new CvPipelineError('NOT_FOUND', 404);

  const existing = existingInventory(profile);
  // A brand-new draft profile has nothing to compare against. Charging a
  // lifetime allowance to be told "all of this is new" would be indefensible,
  // so this path never reaches the ledger at all.
  if (existing.length === 0) {
    await prisma.cvImportSession.update({
      where: { id: session.id },
      data: { reconciliationStatus: 'not_requested' },
    });
    return { status: 'skipped_empty_profile' };
  }

  const reviewable = session.candidates.filter(
    (candidate) =>
      candidate.reviewStatus === CvImportReviewStatus.PROPOSED ||
      candidate.reviewStatus === CvImportReviewStatus.DUPLICATE ||
      candidate.reviewStatus === CvImportReviewStatus.CONFLICT
  );
  if (reviewable.length === 0) return { status: 'skipped_empty_profile' };

  const decision = await checkCapability(args.userId, CV_IMPORT_RECONCILIATION_CAPABILITY);
  if (!decision.allowed) {
    // The fallback path, and it is a real one: proposals stay reviewable and the
    // import continues by hand. First value is never blocked on this.
    await prisma.cvImportSession.update({
      where: { id: session.id },
      data: { reconciliationStatus: 'unavailable' },
    });
    return { status: 'unavailable', decision };
  }

  const capability = CV_IMPORT_RECONCILIATION_CAPABILITY;
  const fingerprint = reservationFingerprint([
    capability,
    args.userId,
    session.storedCvId,
    session.extractionId,
    session.profileId,
  ]);

  let reserve;
  try {
    reserve = await reserveCapability({
      userId: args.userId,
      capability,
      operationId: args.operationId,
      fingerprint,
    });
  } catch (error) {
    // Fail closed: a ledger failure is never read as "no usage".
    console.error(
      '[cv-import-reconcile] Reservation ledger unavailable; failing closed:',
      error instanceof Error ? error.message : error
    );
    throw new AiOperationError({ capability, operationId: args.operationId, reason: 'reservation_failure' });
  }

  if (reserve.status === 'conflict') {
    logReservationEvent('fingerprint_conflict', { userId: args.userId, capability, operationId: args.operationId });
    throw new OperationConflictError(capability, args.operationId);
  }
  if (reserve.status === 'exhausted') {
    await prisma.cvImportSession.update({
      where: { id: session.id },
      data: { reconciliationStatus: 'unavailable' },
    });
    return { status: 'unavailable', decision: reserve.decision };
  }
  if (reserve.status === 'recovered') {
    // Already charged and completed — return what was stored rather than paying
    // for the same comparison twice.
    const stored = await prisma.cvImportSession.findUnique({
      where: { id: session.id },
      select: { reconciliationSummary: true },
    });
    const summary = stored?.reconciliationSummary as ReconciliationSummary | null;
    if (summary) return { status: 'completed', summary };
    logReservationEvent('result_unavailable', {
      userId: args.userId,
      capability,
      operationId: args.operationId,
      charged: true,
      retryable: false,
    });
    throw new AiOperationError({
      capability,
      operationId: args.operationId,
      reason: 'result_unavailable',
      charged: true,
    });
  }
  // `unmetered` never occurs for a quota capability, but the ledger's result type
  // covers both, so the running-check only applies where a unit is actually held.
  if (reserve.status === 'reserved') {
    if (reservationIsRunning(reserve.reservation)) {
      logReservationEvent('duplicate_operation_detected', { userId: args.userId, capability, operationId: args.operationId });
      throw new OperationInProgressError(capability, args.operationId);
    }
    await markOperationRunning(args.userId, capability, args.operationId);
  }

  const release = async (reason: string) => {
    await releaseCapability({ userId: args.userId, capability, operationId: args.operationId, reason });
    logReservationEvent('reservation_released', { userId: args.userId, capability, operationId: args.operationId, reason });
    await prisma.cvImportSession
      .update({ where: { id: session.id }, data: { reconciliationStatus: 'failed' } })
      .catch(() => undefined);
  };

  const prompt = `You are comparing details extracted from a candidate's CV against the records already stored in their Career Profile.

For each PROPOSED IMPORT, decide whether it is:
- "duplicate_of": the profile already holds this exact fact
- "update_of": the profile holds this fact but the CV states it more completely or more recently
- "new": the profile does not hold this fact

Rules:
- Use only the exact ids given in the two inventories.
- Never invent a proposal id, a record id, a fact, an employer, a date or a qualification.
- Use "duplicate_of" or "update_of" only when you can name the exact existing record id.
- Judge on the text provided. Do not assume two similar job titles are the same role at different employers.
- Return one entry per proposal at most. Proposals you are unsure about are "new".

EXISTING PROFILE RECORDS
${existing.map((item) => `[${item.id}] ${item.kind} | ${item.text}`).join('\n')}

PROPOSED IMPORTS
${reviewable.map((item) => `[${item.id}] ${item.entityType} | ${item.sourceExcerpt}`).join('\n')}

Return only JSON in this shape:
{ "findings": [ { "candidateId": "exact id", "verdict": "duplicate_of | update_of | new", "existingRecordId": "exact id or omitted", "rationale": "why" } ] }`;

  let raw: { findings?: unknown } | null = null;
  try {
    raw = await generateJSONFromAI<{ findings?: unknown }>({
      capability: 'cv_import_reconciliation',
      userId: args.userId,
      operationId: args.operationId,
      prompt,
      temperature: 0.1,
      thinkingBudget: THINKING_BUDGETS.cvImportReconcile,
    });
  } catch (error) {
    console.warn(
      '[cv-import-reconcile] Provider failed:',
      error instanceof Error ? error.message : error
    );
  }

  if (!raw) {
    await release('provider_unavailable');
    throw new AiOperationError({ capability, operationId: args.operationId, reason: 'provider_unavailable' });
  }

  const findings = validateFindings(
    raw.findings,
    new Set(reviewable.map((candidate) => candidate.id)),
    new Set(existing.map((item) => item.id))
  );

  const summary: ReconciliationSummary = {
    ranAt: new Date().toISOString(),
    findings,
    duplicates: findings.filter((finding) => finding.verdict === 'duplicate_of').length,
    updates: findings.filter((finding) => finding.verdict === 'update_of').length,
    fresh: findings.filter((finding) => finding.verdict === 'new').length,
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cvImportSession.update({
        where: { id: session.id },
        data: {
          reconciliationStatus: 'completed',
          reconciliationOperationId: args.operationId,
          reconciliationRanAt: new Date(),
          reconciliationSummary: summary as unknown as Prisma.InputJsonValue,
        },
      });
      // A duplicate verdict marks the candidate so the review can group it, but
      // it never rejects or imports anything: the user decides, and a wrong
      // verdict must not be able to silently drop one of their jobs.
      for (const finding of summary.findings) {
        if (finding.verdict !== 'duplicate_of') continue;
        await tx.cvImportCandidate.updateMany({
          where: { id: finding.candidateId, sessionId: session.id, reviewStatus: CvImportReviewStatus.PROPOSED },
          data: { reviewStatus: CvImportReviewStatus.DUPLICATE },
        });
      }
    });
  } catch (error) {
    console.error(
      '[cv-import-reconcile] Persistence failed:',
      error instanceof Error ? error.message : error
    );
    await release('persistence_failure');
    throw new AiOperationError({ capability, operationId: args.operationId, reason: 'persistence_failure' });
  }

  const commit = await commitCapability({
    userId: args.userId,
    capability,
    operationId: args.operationId,
    resultRef: session.id,
  });
  if (commit.status !== 'committed') {
    logReservationEvent('finalisation_failed', { userId: args.userId, capability, operationId: args.operationId });
    throw new AiOperationError({ capability, operationId: args.operationId, reason: 'reservation_failure' });
  }
  logReservationEvent('reservation_committed', {
    userId: args.userId,
    capability,
    operationId: args.operationId,
    resultType: 'analysis',
    charged: true,
  });

  return { status: 'completed', summary };
}

export { EntitlementRequiredError };
