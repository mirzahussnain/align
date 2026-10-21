import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import {
  generateApprovedCv,
  CvGenerationValidationError,
  GenerationPageValidationError,
} from '@/shared/cv-generation/generate';
import { DOCX_CONTENT_TYPE } from '@/shared/services/cv-generation';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to generate a CV.', 401);
    const { id } = await context.params;
    try {
      const result = await generateApprovedCv(session.user.id, id);
      return new NextResponse(new Uint8Array(result.bytes), { headers: {
        'Content-Type': DOCX_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="CV.docx"',
        'X-Generated-CV-Id': result.generatedCvId,
      } });
    } catch (error) {
      if (error instanceof CvGenerationValidationError) throw new APIError('The generated draft included claims that could not be verified, so it was not saved or charged.', 422);
      if (error instanceof GenerationPageValidationError) {
        const status = error.code === 'PAGE_LIMIT_EXCEEDED'
          ? 422
          : error.code === 'RENDERER_UNAVAILABLE'
            ? 503
            : 502;
        throw new APIError(error.message, status, undefined, error.code, error.retryable);
      }
      throw error;
    }
  });
}
