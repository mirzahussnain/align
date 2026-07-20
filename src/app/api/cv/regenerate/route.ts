import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { rewriteCV } from '@/shared/services/cv-rewriter';
import { resolveApprovedSwaps } from '@/shared/services/profile-reconciler';
import { loadProfileData, resolveProfileId } from '@/features/dashboard/data/load-profile';
import { checkQuota, recordUsage } from '@/shared/services/usage-meter';
import { entitlementsFor } from '@/shared/lib/entitlements';
import {
  renderCvDocx,
  persistAndArchiveCv,
  DOCX_CONTENT_TYPE,
} from '@/shared/services/cv-generation';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';

const RegenerateSchema = z.object({
  analysisId: z.string().min(1, 'analysisId is required'),
  templateId: z
    .enum(['architect', 'editorial_refined', 'technical_precision', 'academic_latex'])
    .optional()
    .default('architect'),
  hitlContext: z.record(z.string(), z.string()).optional().default({}),
  includeAtsOptimization: z.boolean().optional().default(true),
  /**
   * Profile items the user approved in the profile-bridge step. Only ids cross
   * the wire — the server re-resolves them against the stored profile, so a
   * tampered request cannot inject invented experience into the rewrite.
   */
  approvedProfileItemIds: z.array(z.string()).optional().default([]),
  /** Career track the approved ids belong to. Omitted uses the default. */
  profileId: z.string().optional(),
});

/**
 * Rebuild a tailored CV from a stored job-match analysis. Everything the rewrite
 * needs — the original CV text, the job description, and the AI job-match spec —
 * was persisted when the analysis first ran, so we re-run the rewrite without
 * asking the user to re-upload or paste anything. The new CV is linked back to
 * its source analysis via GeneratedCV.analysisId.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to generate a CV.', 401);
    }

    const rateLimitResponse = await applyRateLimit(rewriteLimiter, session.user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const entitlements = entitlementsFor(
      await prisma.user
        .findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true } })
        .then((u) => u?.subscriptionTier ?? null)
    );

    // Checked before the model call, so a user out of allowance gets a clean
    // refusal rather than a CV they were not entitled to generate.
    const quota = await checkQuota(session.user.id, 'cvGenerations', entitlements);
    if (!quota.allowed) {
      throw new APIError(
        `You've used all ${quota.limit} CV generations in your plan this month. Your allowance resets at the start of next month.`,
        429
      );
    }

    const parsed = RegenerateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }
    const {
      analysisId,
      templateId,
      hitlContext,
      includeAtsOptimization,
      approvedProfileItemIds,
      profileId,
    } = parsed.data;

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
      throw new APIError('Only job-match analyses can be rebuilt into a CV.', 400);
    }

    // Validated, not cast: stored blobs from older engine versions must fail
    // loudly here rather than feed a rewrite undefined fields.
    const storedResult = parseStoredAnalysisResult(analysis.rawResult);
    if (!storedResult) {
      throw new APIError('This analysis is missing the data needed to rebuild a CV.', 400);
    }
    const rawResult = storedResult.result;
    const cvText = rawResult.rawText ?? '';
    const jobDescription = analysis.jobDescription ?? rawResult.jobDescription ?? '';

    if (cvText.trim().length < 50 || jobDescription.trim().length < 10) {
      throw new APIError('This analysis is missing the data needed to rebuild a CV.', 400);
    }

    const jobMatchFeedbackStr = JSON.stringify(analysis.jobMatchData);
    const atsOptimizationData = includeAtsOptimization
      ? JSON.stringify({
          categories: rawResult.categories,
          recommendations: rawResult.recommendations,
          // Only the keywords the CV actually HAS. The `missing` array is ~90
          // dictionary terms the candidate does not have — around 1,300 tokens
          // that a rewriter must not act on anyway, since writing them in would
          // be fabrication.
          presentKeywords: rawResult.keywords?.present?.map((k) => k.keyword),
          aiClichés: rawResult.aiClichés,
        })
      : null;

    // Which career track this CV belongs to. Resolved unconditionally: the CV is
    // filed under the active profile whether or not any profile items were
    // swapped in, otherwise a track's CV list would only ever show the CVs that
    // happened to use the reasoning step.
    const scopedProfileId = await resolveProfileId(session.user.id, profileId);

    // Re-resolve approved swaps from the stored profile. An id that no longer
    // matches anything (profile edited since the suggestions were shown) is
    // silently dropped rather than failing the generation.
    const approvedProfileItems =
      approvedProfileItemIds.length > 0
        ? resolveApprovedSwaps(await loadProfileData(session.user.id, profileId), approvedProfileItemIds)
        : [];

    const rewrittenData = await rewriteCV(
      cvText,
      jobDescription,
      jobMatchFeedbackStr,
      templateId,
      hitlContext,
      atsOptimizationData,
      approvedProfileItems
    );

    if (!rewrittenData) {
      throw new APIError('Failed to generate CV content from AI', 500);
    }

    // Counted only once the rewrite actually came back, so a provider failure
    // doesn't spend the user's allowance on a CV they never got.
    await recordUsage(session.user.id, 'cvGenerations');

    const docxBuffer = await renderCvDocx(templateId, rewrittenData);

    try {
      await persistAndArchiveCv({
        userId: session.user.id,
        data: rewrittenData,
        templateId,
        fileName: 'Tailored_CV.docx',
        docxBuffer,
        analysisId,
        profileId: scopedProfileId,
        entitlements,
      });
    } catch (persistError) {
      console.warn('[regenerate] Failed to persist generated CV:', persistError instanceof Error ? persistError.message : persistError);
    }

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="Tailored_CV.docx"',
      },
    });
  });
}
