import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { reconcileProfileWithCv } from '@/shared/services/profile-reconciler';
import { ProfileEvidenceValidationError } from '@/shared/types/profile-reasoning';
import { assertCapability, EntitlementRequiredError } from '@/shared/entitlements/server';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  reservationFingerprint,
} from '@/shared/services/capability-reservation';
import {
  AiOperationError,
  OperationConflictError,
  OperationInProgressError,
  markOperationRunning,
  reservationIsRunning,
} from '@/shared/services/ai-failure';
import { loadCanonicalAnalysis } from '@/shared/services/canonical-analysis';
import { logReservationEvent } from '@/shared/services/reservation-observability';

const ProfileBridgeSchema = z.object({
  analysisId: z.string().min(1, 'analysisId is required'),
  /** Career track to reconcile against. Omitted uses the default profile. */
  profileId: z.string().optional(),
});

/**
 * Compare the user's structured profile against the CV a job-match analysis was
 * run on, and return the profile items that would serve the JD better.
 *
 * Read-only and idempotent — it changes nothing and only produces suggestions.
 * The user approves them in the wizard; the approved requirement/evidence pairs are sent to
 * /api/cv/regenerate, which re-resolves them against the profile before they
 * reach the rewrite.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to use profile reasoning.', 401);
    }

    // Shares the rewrite limiter: this is an AI call of comparable cost, and it
    // always immediately precedes a rewrite.
    const rateLimitResponse = await applyRateLimit(rewriteLimiter, session.user.id);
    if (rateLimitResponse) return rateLimitResponse;

    await assertCapability(session.user.id, 'profile_reconciliation');

    const parsed = ProfileBridgeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }
    const { analysisId, profileId } = parsed.data;

    // Canonical, unprojected read from trusted storage — never the plan-projected
    // report shape. Ownership-checked and schema-validated inside the loader.
    const canonical = await loadCanonicalAnalysis({
      userId: session.user.id,
      analysisId,
      requireJobMatch: true,
    });
    if (!canonical.ok) {
      switch (canonical.error) {
        case 'not_found':
          throw new APIError('Analysis not found.', 404);
        case 'wrong_mode':
          throw new APIError('Profile reasoning only applies to job-match analyses.', 400);
        case 'invalid_result':
          throw new APIError('This analysis is missing the data needed to compare your profile.', 400);
        case 'invalid_job_match':
          throw new APIError(
            'Stored job-match data failed integrity validation: schemaVersion 2 is required.',
            409
          );
      }
    }
    const cvText = canonical.analysis.cvText;
    const jobDescription = canonical.analysis.jobDescription;

    if (cvText.trim().length < 50 || jobDescription.trim().length < 10) {
      throw new APIError('This analysis is missing the data needed to compare your profile.', 400);
    }

    const profile = await loadOwnedProfileData(session.user.id, profileId);
    if (!profile) {
      throw new APIError('Profile not found.', 404);
    }
    const jobMatch = canonical.analysis.jobMatchData;
    if (!jobMatch) {
      throw new APIError(
        'Stored job-match data failed integrity validation: schemaVersion 2 is required.',
        409
      );
    }

    // ── Atomic reservation (canonical ordering) ─────────────────────────────
    // Held before the reconciler runs; committed only if the run actually reached
    // a provider (usedAI), released untouched otherwise so merely re-opening
    // existing suggestions never costs a unit.
    const operationId = request.headers.get('x-operation-id') ?? crypto.randomUUID();
    const capability = 'profile_reconciliation' as const;
    const fingerprint = reservationFingerprint([capability, session.user.id, analysisId, profile.profileId]);

    let reserve;
    try {
      reserve = await reserveCapability({ userId: session.user.id, capability, operationId, fingerprint });
    } catch (error) {
      console.error(
        '[profile-bridge] Reservation ledger unavailable; failing closed:',
        error instanceof Error ? error.message : error
      );
      throw new AiOperationError({ capability, operationId, reason: 'reservation_failure' });
    }
    if (reserve.status === 'conflict') {
      logReservationEvent('fingerprint_conflict', { userId: session.user.id, capability, operationId });
      throw new OperationConflictError(capability, operationId);
    }
    if (reserve.status === 'exhausted') throw new EntitlementRequiredError(reserve.decision);

    // A committed operation is already charged. Reconciliation is not persisted,
    // so recovery re-derives the suggestions but never commits (charges) again.
    const recovered = reserve.status === 'recovered';
    if (recovered) {
      logReservationEvent('committed_result_recovered', { userId: session.user.id, capability, operationId });
    }
    let reservationHeld = false;
    if (reserve.status === 'reserved') {
      if (reservationIsRunning(reserve.reservation)) {
        logReservationEvent('duplicate_operation_detected', { userId: session.user.id, capability, operationId });
        throw new OperationInProgressError(capability, operationId);
      }
      await markOperationRunning(session.user.id, capability, operationId);
      reservationHeld = true;
      logReservationEvent('operation_running', { userId: session.user.id, capability, operationId });
    }

    const releaseRecon = async (reason: string) => {
      if (!reservationHeld) return;
      reservationHeld = false;
      await releaseCapability({ userId: session.user.id, capability, operationId, reason });
      logReservationEvent('reservation_released', { userId: session.user.id, capability, operationId, reason });
    };

    let reconciliation: Awaited<ReturnType<typeof reconcileProfileWithCv>>;
    try {
      reconciliation = await reconcileProfileWithCv({
        userId: session.user.id,
        operationId,
        profile,
        cvText,
        jobDescription,
        jobMatch,
      });
    } catch (error) {
      if (error instanceof ProfileEvidenceValidationError) {
        await releaseRecon('invalid_response');
        throw new APIError('The profile comparison returned an invalid evidence reference.', 502);
      }
      await releaseRecon('provider_unavailable');
      throw error;
    }

    // Commit exactly once, only for a fresh run that actually used the provider.
    // A no-AI run releases the held unit without charge.
    if (!recovered) {
      if (reconciliation.usedAI) {
        const commit = await commitCapability({ userId: session.user.id, capability, operationId });
        if (commit.status !== 'committed') {
          logReservationEvent('finalisation_failed', { userId: session.user.id, capability, operationId });
          throw new AiOperationError({ capability, operationId, reason: 'reservation_failure' });
        }
        reservationHeld = false;
        logReservationEvent('reservation_committed', { userId: session.user.id, capability, operationId, charged: true });
      } else {
        // No provider was reached (cached/no-op reconcile) — free the held unit.
        await releaseRecon('unknown');
      }
    }

    return NextResponse.json({
      profileId: profile.profileId,
      profileLabel: profile.label,
      ...reconciliation,
    });
  });
}
