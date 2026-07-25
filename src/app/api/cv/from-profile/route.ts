import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { loadProfileData, isProfileComplete } from '@/features/dashboard/data/load-profile';
import { entitlementsFor } from '@/shared/lib/entitlements';
import { prisma } from '@/shared/lib/prisma';
import {
  renderCvDocx,
  persistAndArchiveCv,
  profileToRewrittenData,
  DOCX_CONTENT_TYPE,
} from '@/shared/services/cv-generation';
import { TemplateIdSchema } from '@/shared/constants/templates';
import { planCvBuildSpec } from '@/shared/services/cv-build-spec';
import { buildTrustedGenerationContext } from '@/shared/services/trusted-generation-context';
import {
  buildProfileEvidenceCorpus,
  experienceDurationFact,
  profileDateEntities,
  scanUnsupportedClaims,
  unsupportedClaimUserMessage,
} from '@/shared/services/cv-generation-safety';
import { formatDateRange } from '@/shared/utils/date';
import {
  TRUSTED_GENERATION_CONTEXT_VERSION,
  UNSUPPORTED_CLAIM_VALIDATION_VERSION,
} from '@/shared/types/cv-rewrite';
import { assertCapability } from '@/shared/entitlements/server';

const FromProfileSchema = z.object({
  templateId: TemplateIdSchema,
  /** Career track to build from. Omitted builds from the user's default. */
  profileId: z.string().optional(),
});

/**
 * Build a CV directly from the user's structured profile — no analysis, no AI.
 * Gated on a 100%-complete profile so the output is never missing a core
 * section. Persists the record and archives the DOCX bytes like every other
 * generate path, then streams the file back for immediate download.
 *
 * Deliberately NOT metered against the monthly `cvGenerations` allowance. That
 * allowance exists to cap AI spend, and this path invokes no model — it is a
 * deterministic render of data the user typed in themselves. The stored-CV cap
 * in entitlements.ts still applies, which is the limit that actually matters
 * here since the cost is storage rather than inference.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to generate a CV.', 401);
    }

    const rateLimitResponse = await applyRateLimit(rewriteLimiter, session.user.id);
    if (rateLimitResponse) return rateLimitResponse;
    await assertCapability(session.user.id, 'tailored_cv_generation');

    const parsed = FromProfileSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }
    const { templateId, profileId } = parsed.data;
    const entitlements = entitlementsFor(
      await prisma.user
        .findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true } })
        .then((u) => u?.subscriptionTier ?? null)
    );


    // loadProfileData verifies the id belongs to this user before honouring it.
    const profile = await loadProfileData(session.user.id, profileId);
    if (!isProfileComplete(profile)) {
      throw new APIError(
        'Complete your profile to 100% before generating a CV from it.',
        400
      );
    }

    // Even a no-AI render passes through the trusted-context boundary. The
    // builder asserts the generated-evidence quarantine and yields the
    // deterministic derived facts the safety scan needs. There is no approved
    // evidence on this path — the Profile is itself the canonical ground truth.
    const trustedContext = buildTrustedGenerationContext({
      profile,
      approvedEvidence: [],
    });

    const data = profileToRewrittenData(profile);

    // Deterministic code is not automatically truthful: a user-entered tagline or
    // summary can still assert a duration the dated history does not support, and
    // a record could render a date range wider than its precision. Reject before
    // rendering or persisting — this path invokes no model, so there is nothing to
    // correct; the fix belongs in the Profile.
    const unsupportedClaims = scanUnsupportedClaims({
      cv: data,
      corpus: buildProfileEvidenceCorpus(profile),
      durationFact: experienceDurationFact(trustedContext),
      dateEntities: profileDateEntities(profile, formatDateRange),
    });
    if (unsupportedClaims.length > 0) {
      console.warn(
        `[from-profile] Deterministic build rejected for profile ${profile.profileId}: ${unsupportedClaims
          .map((flag) => flag.kind)
          .join(', ')}.`
      );
      throw new APIError(unsupportedClaimUserMessage(unsupportedClaims), 422);
    }

    // Convert the canonical profile evidence into the single generation
    // contract before rendering. The planner decides section presence, order and
    // headings from the profile's declared target occupation; the renderer only
    // presents it.
    const buildSpec = planCvBuildSpec({
      data,
      templateId,
      occupationId: profile.personal.targetOccupation || null,
      role: profile.personal.targetRoleTitle || null,
      targetSource: 'profile_target',
      seniority: profile.personal.targetSeniority || null,
    });
    const docxBuffer = await renderCvDocx(buildSpec);

    try {
      await persistAndArchiveCv({
        userId: session.user.id,
        data,
        templateId,
        fileName: 'Profile_CV.docx',
        docxBuffer,
        profileId: profile.profileId || null,
        // Deterministic-path provenance: no model, no approved evidence, but the
        // same trusted-context and unsupported-claim guarantees still recorded.
        provenance: {
          trustedContextVersion: TRUSTED_GENERATION_CONTEXT_VERSION,
          trustedContextProfileId: trustedContext.profileSnapshot.profileId,
          derivedFacts: trustedContext.derivedFacts.map((fact) => ({
            key: fact.key,
            confidence: fact.confidence,
            derivationRule: fact.derivationRule,
            supportingFactKeys: fact.supportingFactKeys,
          })),
          unsupportedClaimValidationVersion: UNSUPPORTED_CLAIM_VALIDATION_VERSION,
          unsupportedClaimValidationResult: 'passed',
          deterministic: true,
          // Canonical build-spec provenance: how the document's structure was planned.
          cvBuildSpecVersion: buildSpec.version,
          contentPlannerVersion: buildSpec.provenance.plannerVersion,
          templateCapabilityVersion: buildSpec.provenance.capabilityVersion,
          resolvedOccupation: buildSpec.provenance.occupationId,
          roleArchetype: buildSpec.provenance.roleArchetype,
          plannedSectionOrder: buildSpec.provenance.sectionOrder,
          omittedEmptySections: buildSpec.provenance.omittedEmptySections,
          unsupportedByTemplate: buildSpec.provenance.unsupportedByTemplate,
        },
        entitlements,
      });
    } catch (persistError) {
      console.warn('[from-profile] Failed to persist generated CV:', persistError instanceof Error ? persistError.message : persistError);
    }

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="Profile_CV.docx"',
      },
    });
  });
}
