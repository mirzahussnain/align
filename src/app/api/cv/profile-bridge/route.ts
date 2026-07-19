import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { entitlementsFor } from '@/shared/lib/entitlements';
import { loadProfileData } from '@/features/dashboard/data/load-profile';
import { reconcileProfileWithCv } from '@/shared/services/profile-reconciler';
import { checkQuota, recordUsage } from '@/shared/services/usage-meter';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { AIJobMatchOutput } from '@/shared/types/ai';

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
 * The user approves them in the wizard; the approved ids are then sent to
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    });
    const entitlements = entitlementsFor(user?.subscriptionTier ?? null);

    if (!entitlements.profileReasoning) {
      throw new APIError('Profile reasoning is available on the Pro plan.', 403);
    }

    const quota = await checkQuota(session.user.id, 'profileReasoning', entitlements);
    if (!quota.allowed) {
      throw new APIError(
        `You've used all ${quota.limit} profile comparisons in your plan this month. Your CV will still be generated from the analysis — only the comparison is unavailable.`,
        429
      );
    }

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
    if (analysis.mode !== 'job_match' || !analysis.jobMatchData) {
      throw new APIError('Profile reasoning only applies to job-match analyses.', 400);
    }

    const rawResult = analysis.rawResult as unknown as CVAnalysisResult;
    const cvText = rawResult?.rawText ?? '';
    const jobDescription = analysis.jobDescription ?? rawResult?.jobDescription ?? '';

    if (cvText.trim().length < 50 || jobDescription.trim().length < 10) {
      throw new APIError('This analysis is missing the data needed to compare your profile.', 400);
    }

    // loadProfileData verifies profileId ownership before honouring it.
    const profile = await loadProfileData(session.user.id, profileId);
    const jobMatch = analysis.jobMatchData as unknown as AIJobMatchOutput;

    const reconciliation = await reconcileProfileWithCv({
      profile,
      cvText,
      jobDescription,
      mandatoryMissing: jobMatch?.mandatorySkills?.missing ?? [],
      mandatoryPartial: jobMatch?.mandatorySkills?.partial ?? [],
    });

    // Only a run that actually reached a provider consumes the allowance.
    if (reconciliation.usedAI) {
      await recordUsage(session.user.id, 'profileReasoning');
    }

    return NextResponse.json({
      profileId: profile.profileId,
      profileLabel: profile.label,
      ...reconciliation,
    });
  });
}
