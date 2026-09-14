import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { buildProfileCandidates } from '@/shared/services/profile-reconciler';
import {
  assertCapability,
  assertApplicationApprovalLimit,
  assertStoredEvidenceLimit,
  EntitlementRequiredError,
} from '@/shared/entitlements/server';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  createResultForReservation,
  reservationFingerprint,
  hashContent,
} from '@/shared/services/capability-reservation';
import {
  AiOperationError,
  OperationConflictError,
  OperationInProgressError,
  ResultUnavailableError,
  markOperationRunning,
  reservationIsRunning,
} from '@/shared/services/ai-failure';
import { logReservationEvent } from '@/shared/services/reservation-observability';
import {
  createCanonicalEvidence,
  describeStructuredEvidence,
  StructuredEvidenceValidationError,
  validateStructuredEvidence,
} from '@/shared/services/structured-evidence';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

const CAPABILITY = 'human_evidence_capture' as const;

/** Prisma model name per ProfileEvidenceRef type, for existence checks on recovery. */
const EVIDENCE_MODEL_BY_TYPE: Record<string, string> = {
  experience: 'experience',
  project: 'projectEntry',
  education: 'education',
  skill: 'skill',
  certification: 'certification',
  training: 'training',
  licence: 'licence',
  professional_registration: 'professionalRegistration',
  language: 'language',
  volunteering: 'volunteering',
  other: 'otherEvidence',
};

async function profileEvidenceExists(profileId: string, type: string, id: string): Promise<boolean> {
  const model = EVIDENCE_MODEL_BY_TYPE[type];
  if (!model) return false;
  const delegate = (prisma as unknown as Record<string, { findFirst: (args: unknown) => Promise<unknown> }>)[model];
  const found = await delegate.findFirst({ where: { id, profileId }, select: { id: true } });
  return Boolean(found);
}

/**
 * Recover a committed HITL capture without creating a duplicate. The reservation
 * for this operation already committed, so the persisted record is authoritative:
 * verify it still exists and belongs to the user/profile, then rebuild the exact
 * deterministic response from the (re-sent, re-validated) request payload. A
 * missing record means the committed result is unrecoverable.
 */
async function recoverEvidenceCapture(args: {
  userId: string;
  profileId: string;
  resultRef: string | null;
  operationId: string;
  description: { label: string; text: string };
}): Promise<NextResponse> {
  const { userId, profileId, resultRef, operationId, description } = args;
  const unavailable = () =>
    new ResultUnavailableError({ capability: CAPABILITY, operationId, repairable: false });
  if (!resultRef) throw unavailable();

  if (resultRef.startsWith('context:')) {
    const id = resultRef.slice('context:'.length);
    const row = await prisma.applicationEvidenceContext.findFirst({
      where: { id, userId, profileId },
      select: { id: true },
    });
    if (!row) throw unavailable();
    return NextResponse.json(
      { applicationEvidenceContextId: row.id, userApproved: true, label: description.label, text: description.text },
      { status: 200 }
    );
  }

  if (resultRef.startsWith('evidence:')) {
    const rest = resultRef.slice('evidence:'.length);
    const sep = rest.lastIndexOf(':');
    const type = rest.slice(0, sep);
    const id = rest.slice(sep + 1);
    if (!(await profileEvidenceExists(profileId, type, id))) throw unavailable();
    return NextResponse.json(
      {
        evidenceRef: { type, id },
        evidenceText: description.text,
        evidenceLocation: `${description.label} · Career Profile`,
        userApproved: true,
      },
      { status: 200 }
    );
  }
  throw unavailable();
}

const eligibleStatuses = new Set(['partial', 'not_met', 'contradicted', 'unclear']);
const CaptureSchema = z.object({
  analysisId: z.string().min(1),
  profileId: z.string().min(1),
  requirementId: z.string().min(1),
  reuseInProfile: z.boolean(),
  kind: z.string().min(1),
  details: z.unknown(),
  confirmed: z.literal(true),
});

async function assertEligible(userId: string, analysisId: string, requirementId: string) {
  const analysis = await prisma.jobMatch.findFirst({
    where: { id: analysisId, userId },
    select: { resultJson: true },
  });
  const requirement = parseStoredJobMatchData((analysis?.resultJson as Record<string, unknown> | undefined)?.jobMatchData)?.requirements.find(
    (item) => item.id === requirementId
  );
  if (!requirement) throw new APIError('Requirement not found for this analysis.', 404);
  if (!eligibleStatuses.has(requirement.status)) {
    throw new APIError('This requirement cannot receive additional evidence.', 400);
  }
}

export async function GET(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view profile evidence.', 401);
    const profileId = new URL(request.url).searchParams.get('profileId') ?? '';
    const profile = await loadOwnedProfileData(session.user.id, profileId);
    if (!profile) throw new APIError('Profile not found.', 404);
    await assertCapability(session.user.id, 'reuse_evidence_across_applications');
    return NextResponse.json({ profileId: profile.profileId, candidates: buildProfileCandidates(profile) });
  });
}

export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to add evidence.', 401);
    const parsed = CaptureSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const input = parsed.data;

    const profile = await loadOwnedProfileData(session.user.id, input.profileId);
    if (!profile) throw new APIError('Profile not found.', 404);
    await assertEligible(session.user.id, input.analysisId, input.requirementId);

    let parsedEvidence;
    try {
      parsedEvidence = validateStructuredEvidence(input.kind, input.details);
    } catch (error) {
      if (error instanceof StructuredEvidenceValidationError) throw new APIError(error.message, 400);
      throw error;
    }

    await assertCapability(session.user.id, 'human_evidence_capture');
    // The per-application approval cap (Free: 2) is enforced atomically in the
    // creator below, over the live count for this analysis, so an idempotent retry
    // of an already-created approval is never falsely rejected. A fast pre-check
    // here keeps the common over-limit case cheap; only the non-reuse branch
    // creates an application-scoped approval, so reuse is not capped by it.
    if (!input.reuseInProfile) {
      await assertApplicationApprovalLimit(session.user.id, input.analysisId);
    }
    if (input.reuseInProfile) {
      await assertCapability(session.user.id, 'reuse_evidence_across_applications');
      // Only an `other` capture creates a qualifying reusable evidence record;
      // every other kind writes a canonical Career Profile record (experience,
      // skill, education, …), which is career history and is never charged
      // against the stored-evidence allowance. Cheap pre-check only — the
      // authoritative one runs inside the creator transaction below.
      if (parsedEvidence.kind === 'other') {
        await assertCapability(session.user.id, 'profile_evidence_storage');
      }
    }

    const description = describeStructuredEvidence(parsedEvidence.kind, parsedEvidence.details);
    const operationId = request.headers.get('x-operation-id') ?? crypto.randomUUID();
    const resultType = input.reuseInProfile ? 'evidence' : 'context';
    logReservationEvent('operation_started', {
      userId: session.user.id,
      capability: CAPABILITY,
      operationId,
      resultType,
    });

    // ── Atomic reservation (canonical ordering) ─────────────────────────────
    // This capture is deterministic but quota-controlled. A unit is held after
    // all validation/eligibility/entitlement gates and before the write, and
    // released if the write fails; the created record is the commit's resultRef.
    const fingerprint = reservationFingerprint([
      CAPABILITY,
      session.user.id,
      input.analysisId,
      input.requirementId,
      parsedEvidence.kind,
      String(input.reuseInProfile),
      hashContent(JSON.stringify(parsedEvidence.details)),
    ]);

    let reserve;
    try {
      reserve = await reserveCapability({ userId: session.user.id, capability: CAPABILITY, operationId, fingerprint });
    } catch (error) {
      console.error(
        '[profile-evidence] Reservation ledger unavailable; failing closed:',
        error instanceof Error ? error.message : error
      );
      throw new AiOperationError({ capability: CAPABILITY, operationId, reason: 'reservation_failure' });
    }
    if (reserve.status === 'conflict') {
      logReservationEvent('fingerprint_conflict', { userId: session.user.id, capability: CAPABILITY, operationId });
      throw new OperationConflictError(CAPABILITY, operationId);
    }
    if (reserve.status === 'exhausted') throw new EntitlementRequiredError(reserve.decision);
    if (reserve.status === 'recovered') {
      // Already committed under this operation id — return the existing record.
      logReservationEvent('committed_result_recovered', {
        userId: session.user.id,
        capability: CAPABILITY,
        operationId,
        resultType,
      });
      return await recoverEvidenceCapture({
        userId: session.user.id,
        profileId: profile.profileId,
        resultRef: reserve.reservation.resultRef,
        operationId,
        description,
      });
    }

    // Create-then-commit idempotency: a prior attempt already created the record
    // (its ref is recorded on the still-held reservation) but its commit did not
    // land. Finalise — commit is idempotent — and recover the existing record
    // rather than creating a duplicate. Checked BEFORE the in-progress guard so a
    // legitimate finalisation retry is never mistaken for a live duplicate.
    if (reserve.status === 'reserved' && reserve.reservation.resultRef) {
      const commit = await commitCapability({
        userId: session.user.id,
        capability: CAPABILITY,
        operationId,
        resultRef: reserve.reservation.resultRef,
      });
      if (commit.status !== 'committed') {
        logReservationEvent('finalisation_failed', { userId: session.user.id, capability: CAPABILITY, operationId });
        throw new AiOperationError({ capability: CAPABILITY, operationId, reason: 'reservation_failure' });
      }
      logReservationEvent('reservation_committed', {
        userId: session.user.id,
        capability: CAPABILITY,
        operationId,
        resultType,
        charged: true,
      });
      return await recoverEvidenceCapture({
        userId: session.user.id,
        profileId: profile.profileId,
        resultRef: reserve.reservation.resultRef,
        operationId,
        description,
      });
    }

    let reservationHeld = reserve.status === 'reserved';
    if (reserve.status === 'reserved') {
      if (reservationIsRunning(reserve.reservation)) {
        logReservationEvent('duplicate_operation_detected', { userId: session.user.id, capability: CAPABILITY, operationId });
        throw new OperationInProgressError(CAPABILITY, operationId);
      }
      await markOperationRunning(session.user.id, CAPABILITY, operationId);
      logReservationEvent('operation_running', { userId: session.user.id, capability: CAPABILITY, operationId, resultType });
    }

    const releaseCapture = async (reason: string) => {
      if (!reservationHeld) return;
      reservationHeld = false;
      await releaseCapability({ userId: session.user.id, capability: CAPABILITY, operationId, reason });
      logReservationEvent('reservation_released', { userId: session.user.id, capability: CAPABILITY, operationId, reason });
    };

    // Create the record and record its reference on the reservation ATOMICALLY,
    // so a commit failure afterwards can never lose the link and a retry recovers
    // the record instead of creating a duplicate. The creator runs at most once
    // per operation id (DB-enforced under the advisory lock).
    let created;
    try {
      created = await createResultForReservation({
        userId: session.user.id,
        capability: CAPABILITY,
        operationId,
        creator: async (tx) => {
          if (input.reuseInProfile) {
            // Authoritative reusable-evidence capacity check, under the same
            // transaction as the create so it cannot be raced. Canonical career
            // history is exempt.
            if (parsedEvidence.kind === 'other') {
              await assertStoredEvidenceLimit(session.user.id, tx);
            }
            const ref = await createCanonicalEvidence(profile.profileId, parsedEvidence.kind, parsedEvidence.details, tx);
            return { resultRef: `evidence:${ref.type}:${ref.id}`, value: ref };
          }
          // Authoritative per-application cap, counted under the same transaction
          // as the create so it cannot be raced. Throws the canonical entitlement
          // error, which the route surfaces without mutating approval state.
          await assertApplicationApprovalLimit(session.user.id, input.analysisId, tx);
          const saved = await tx.applicationEvidenceContext.create({
            data: {
              userId: session.user.id,
              jobMatchId: input.analysisId,
              profileId: profile.profileId,
              requirementId: input.requirementId,
              kind: parsedEvidence.kind.toUpperCase() as never,
              details: parsedEvidence.details,
              approvedAt: new Date(),
            },
            select: { id: true },
          });
          return { resultRef: `context:${saved.id}`, value: { id: saved.id } };
        },
      });
    } catch (error) {
      logReservationEvent('persistence_failed', { userId: session.user.id, capability: CAPABILITY, operationId, resultType });
      await releaseCapture('persistence_failure');
      throw error;
    }

    if (created.status === 'lapsed') {
      // The hold expired out from under this attempt — surface a retryable error.
      throw new AiOperationError({ capability: CAPABILITY, operationId, reason: 'reservation_failure' });
    }
    logReservationEvent('persistence_succeeded', { userId: session.user.id, capability: CAPABILITY, operationId, resultType });

    // Commit exactly once against the recorded reference. Idempotent.
    const commit = await commitCapability({
      userId: session.user.id,
      capability: CAPABILITY,
      operationId,
      resultRef: created.resultRef,
    });
    if (commit.status !== 'committed') {
      logReservationEvent('finalisation_failed', { userId: session.user.id, capability: CAPABILITY, operationId });
      throw new AiOperationError({ capability: CAPABILITY, operationId, reason: 'reservation_failure' });
    }
    reservationHeld = false;
    logReservationEvent('reservation_committed', {
      userId: session.user.id,
      capability: CAPABILITY,
      operationId,
      resultType,
      charged: true,
    });

    // A concurrent duplicate already created the record — return the recovered
    // form (200) rather than a fresh 201 for a second write that never happened.
    if (created.status === 'already_created') {
      return await recoverEvidenceCapture({
        userId: session.user.id,
        profileId: profile.profileId,
        resultRef: created.resultRef,
        operationId,
        description,
      });
    }

    if (input.reuseInProfile) {
      const evidenceRef = created.value as unknown as { type: string; id: string };
      return NextResponse.json(
        {
          evidenceRef,
          evidenceText: description.text,
          evidenceLocation: `${description.label} · Career Profile`,
          userApproved: true,
        },
        { status: 201 }
      );
    }
    const saved = created.value as unknown as { id: string };
    return NextResponse.json(
      {
        applicationEvidenceContextId: saved.id,
        userApproved: true,
        label: description.label,
        text: description.text,
      },
      { status: 201 }
    );
  });
}
