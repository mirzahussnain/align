import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { rewriteCV } from '@/shared/services/cv-rewriter';
import { buildRewriteInput } from '@/shared/services/cv-rewrite-context';
import {
  validateRewrittenCv,
  TRUTHFULNESS_FAILURE_MESSAGE,
} from '@/shared/services/cv-rewrite-validation';
import { resolveApprovedProfileEvidence } from '@/shared/services/profile-reconciler';
import { loadOwnedProfileData, resolveProfileId } from '@/features/dashboard/data/load-profile';
import {
  ProfileEvidenceValidationError,
  type ApprovedProfileEvidenceOverlay,
} from '@/shared/types/profile-reasoning';
import {
  TRUTHFULNESS_VALIDATION_VERSION,
  type AtsOptimizationData,
  type UserProvidedContext,
} from '@/shared/types/cv-rewrite';
import { checkQuota, recordUsage } from '@/shared/services/usage-meter';
import { entitlementsFor } from '@/shared/lib/entitlements';
import { AI_CONFIG } from '@/shared/lib/config';
import {
  renderCvDocx,
  persistAndArchiveCv,
  DOCX_CONTENT_TYPE,
} from '@/shared/services/cv-generation';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { TemplateIdSchema } from '@/shared/constants/templates';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

const ProfileEvidenceRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('experience'), id: z.string().min(1) }),
  z.object({ type: z.literal('project'), id: z.string().min(1) }),
  z.object({ type: z.literal('education'), id: z.string().min(1) }),
  z.object({ type: z.literal('skill'), id: z.string().min(1) }),
  z.object({ type: z.literal('certification'), id: z.string().min(1) }),
]);

const RegenerateSchema = z.object({
  analysisId: z.string().min(1, 'analysisId is required'),
  templateId: TemplateIdSchema,
  hitlContext: z.record(z.string(), z.string()).optional().default({}),
  includeAtsOptimization: z.boolean().optional().default(true),
  /**
   * Profile items the user approved in the profile-bridge step. Only ids cross
   * the wire — the server re-resolves them against the stored profile, so a
   * tampered request cannot inject invented experience into the rewrite.
   */
  approvedProfileEvidence: z
    .array(
      z.object({
        requirementId: z.string().min(1),
        evidenceRef: ProfileEvidenceRefSchema,
        rationale: z.string().max(2000).optional(),
      })
    )
    .optional()
    .default([]),
  /** Career track the approved ids belong to. Omitted uses the default. */
  profileId: z.string().optional(),
});

/** hitlContext is a map of requirement label → the candidate's own free-text note. */
function toUserContext(hitlContext: Record<string, string>): UserProvidedContext[] {
  return Object.entries(hitlContext)
    .map(([label, text]) => ({ label, text: text.trim() }))
    .filter((note) => note.text.length > 0);
}

/**
 * Rebuild a tailored CV from a stored job-match analysis. Everything the rewrite
 * needs — the original CV text, the job description, and the canonical
 * JobMatchDataV2 ledger — was persisted when the analysis first ran, so we
 * re-run the rewrite without asking the user to re-upload or paste anything. The
 * ledger is projected into a compact, generation-specific context; the generated
 * draft is validated for invented claims before it is charged or persisted.
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
      approvedProfileEvidence,
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

    if (analysis.mode !== 'job_match') {
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

    // The canonical ledger is the single source of truth for generation. It is
    // never converted back into the old mandatory/desirable arrays.
    const storedJobMatch = parseStoredJobMatchData(analysis.jobMatchData);
    if (!storedJobMatch) {
      throw new APIError(
        'Stored job-match data failed integrity validation: schemaVersion 2 is required.',
        409
      );
    }

    const atsOptimizationData: AtsOptimizationData | undefined = includeAtsOptimization
      ? {
          // Only keywords the CV actually HAS. Surfacing them is emphasis;
          // inventing the ~90 missing ones would be fabrication.
          presentKeywords: (rawResult.keywords?.present ?? [])
            .map((keyword) => keyword.keyword)
            .filter(Boolean)
            .slice(0, 40),
          recommendations: (rawResult.recommendations ?? [])
            .map((recommendation) => recommendation.title)
            .filter(Boolean)
            .slice(0, 6),
          aiClichesToAvoid: (rawResult.aiClichés ?? []).slice(0, 20),
        }
      : undefined;

    // Which career track this CV belongs to. Resolved unconditionally: the CV is
    // filed under the active profile whether or not any profile items were
    // swapped in, otherwise a track's CV list would only ever show the CVs that
    // happened to use the reasoning step.
    let scopedProfileId = await resolveProfileId(session.user.id, profileId);

    let approvedEvidenceOverlay: ApprovedProfileEvidenceOverlay[] = [];
    if (approvedProfileEvidence.length > 0) {
      const profile = await loadOwnedProfileData(session.user.id, profileId);
      if (!profile) {
        throw new APIError('Profile not found.', 404);
      }
      scopedProfileId = profile.profileId;

      try {
        approvedEvidenceOverlay = resolveApprovedProfileEvidence(
          profile,
          approvedProfileEvidence,
          storedJobMatch.requirements
        );
      } catch (error) {
        if (error instanceof ProfileEvidenceValidationError) {
          throw new APIError(error.message, 400);
        }
        throw error;
      }
    }

    const userContext = toUserContext(hitlContext);

    // Compact, budgeted, ledger-native projection. Unrelated ledger metadata
    // (confidence, deductions, UI fields) never reaches the prompt.
    const { input, debug } = buildRewriteInput({
      jobMatch: storedJobMatch,
      approvedProfileEvidence: approvedEvidenceOverlay,
      userContext,
      cvText,
      jobDescription,
      template: templateId,
      atsOptimizationData,
    });

    const rewrittenData = await rewriteCV(input);

    // Provider failure spends no quota.
    if (!rewrittenData) {
      throw new APIError('Failed to generate CV content from AI', 500);
    }

    // Conservative truthfulness check. A failure persists nothing, charges
    // nothing, and returns a single retryable message.
    const validation = validateRewrittenCv(rewrittenData, input);
    if (!validation.ok) {
      console.warn(
        `[regenerate] Truthfulness validation rejected a draft for analysis ${analysisId}: ${validation.reasons.join(' ')}`
      );
      throw new APIError(TRUTHFULNESS_FAILURE_MESSAGE, 422);
    }

    // Counted only once the rewrite came back AND passed validation, so neither a
    // provider failure nor a rejected draft spends the user's allowance.
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
        // Full generation provenance — how this CV was made, kept separate from
        // its content. Never duplicates the ledger; only the ids supplied.
        provenance: {
          analysisId,
          profileId: scopedProfileId,
          requirementSchemaVersion: storedJobMatch.schemaVersion,
          requirementIds: input.rewriteContext.requirements.map((requirement) => requirement.id),
          approvedProfileEvidence: approvedEvidenceOverlay,
          userContext,
          template: templateId,
          model: AI_CONFIG.gemini.model,
          promptContextVersion: debug.promptContextVersion,
          estimatedPromptTokens: debug.estimatedPromptTokens,
          truthfulnessValidationVersion: TRUTHFULNESS_VALIDATION_VERSION,
          truthfulnessValidationResult: 'passed',
        },
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
