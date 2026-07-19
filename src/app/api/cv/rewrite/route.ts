import { NextResponse } from 'next/server';
import { rewriteCV } from '@/shared/services/cv-rewriter';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { RewriteRequestSchema } from './schema';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { entitlementsFor } from '@/shared/lib/entitlements';
import { prisma } from '@/shared/lib/prisma';
import {
  renderCvDocx,
  persistAndArchiveCv,
  DOCX_CONTENT_TYPE,
} from '@/shared/services/cv-generation';

export async function POST(request: Request) {
  return withErrorHandler(async () => {
    // Gate the AI rewrite behind authentication (same rationale as /api/analyze).
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to rewrite your CV.', 401);
    }

    const rateLimitResponse = await applyRateLimit(rewriteLimiter, session.user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    
    const parsed = RewriteRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const { cvText, jobDescription, jobMatchFeedback, templateId, hitlContext, atsOptimizationData } = parsed.data;
    const entitlements = entitlementsFor(
      await prisma.user
        .findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true } })
        .then((u) => u?.subscriptionTier ?? null)
    );


    console.info('[rewrite] AI CV rewrite initiated.');
    
    // 1. Rewrite the CV into strict JSON using AI
    const rewrittenData = await rewriteCV(cvText, jobDescription, jobMatchFeedback || '', templateId || 'architect', hitlContext || {}, atsOptimizationData);
    
    if (!rewrittenData) {
      throw new APIError('Failed to generate CV content from AI', 500);
    }

    // 2. Generate the DOCX Buffer based on the selected template
    const docxBuffer = await renderCvDocx(templateId, rewrittenData);

    // 3. Persist the generated CV + archive the DOCX (best-effort). A failed
    // persist must never block the download the user already paid an AI call for.
    try {
      await persistAndArchiveCv({
        userId: session.user.id,
        data: rewrittenData,
        templateId: templateId || 'architect',
        fileName: 'Tailored_CV.docx',
        docxBuffer,
        entitlements,
      });
    } catch (persistError) {
      console.warn('[rewrite] Failed to persist generated CV:', persistError instanceof Error ? persistError.message : persistError);
    }

    // 4. Return the Buffer as a downloadable file stream
    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="Tailored_CV.docx"',
      },
    });
  });
}
