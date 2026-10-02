import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { generateApprovedCv, CvGenerationValidationError } from '@/shared/cv-generation/generate';
import { DOCX_CONTENT_TYPE } from '@/shared/services/cv-generation';

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
      throw error;
    }
  });
}
