import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { reconcileProfileWithCv } from '@/shared/services/profile-reconciler';
import { ProfileEvidenceValidationError } from '@/shared/types/profile-reasoning';
import { assertCapability, consumeCapability } from '@/shared/entitlements/server';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

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

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        userId: true,
        mode: true,
        rawResult: true,
        jobDescription: true,
        jobMatchData: true,
      },
    });

    if (!analysis || analysis.userId !== session.user.id) {
      throw new APIError('Analysis not found.', 404);
    }
    if (analysis.mode !== 'job_match') {
      throw new APIError('Profile reasoning only applies to job-match analyses.', 400);
    }

    // Validated, not cast — an unparseable stored blob fails with a clear
    // message instead of feeding the reconciler undefined fields.
    const storedResult = parseStoredAnalysisResult(analysis.rawResult);
    if (!storedResult) {
      throw new APIError('This analysis is missing the data needed to compare your profile.', 400);
    }
    const rawResult = storedResult.result;
    const cvText = rawResult.rawText ?? '';
    const jobDescription = analysis.jobDescription ?? rawResult.jobDescription ?? '';

    if (cvText.trim().length < 50 || jobDescription.trim().length < 10) {
      throw new APIError('This analysis is missing the data needed to compare your profile.', 400);
    }

    const profile = await loadOwnedProfileData(session.user.id, profileId);
    if (!profile) {
      throw new APIError('Profile not found.', 404);
    }
    const jobMatch = parseStoredJobMatchData(analysis.jobMatchData);
    if (!jobMatch) {
      throw new APIError(
        'Stored job-match data failed integrity validation: schemaVersion 2 is required.',
        409
      );
    }
    let reconciliation: Awaited<ReturnType<typeof reconcileProfileWithCv>>;
    try {
      reconciliation = await reconcileProfileWithCv({
        profile,
        cvText,
        jobDescription,
        jobMatch,
      });
    } catch (error) {
      if (error instanceof ProfileEvidenceValidationError) {
        throw new APIError('The profile comparison returned an invalid evidence reference.', 502);
      }
      throw error;
    }

    // Only a run that actually reached a provider consumes the allowance.
    if (reconciliation.usedAI) {
      const operationId = request.headers.get('x-operation-id') ?? crypto.randomUUID();
      await consumeCapability(session.user.id, 'profile_reconciliation', operationId);
    }

    return NextResponse.json({
      profileId: profile.profileId,
      profileLabel: profile.label,
      ...reconciliation,
    });
  });
}
