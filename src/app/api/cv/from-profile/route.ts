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

    const data = profileToRewrittenData(profile);
    const docxBuffer = await renderCvDocx(templateId, data);

    try {
      await persistAndArchiveCv({
        userId: session.user.id,
        data,
        templateId,
        fileName: 'Profile_CV.docx',
        docxBuffer,
        profileId: profile.profileId || null,
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
