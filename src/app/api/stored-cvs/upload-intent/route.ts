import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { createCvUploadIntent } from '@/shared/services/cv-upload-intent';
import { CvPipelineError } from '@/shared/services/cv-extraction';
import { UPLOAD_POLICY } from '@/shared/policies';

const Input = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  sizeBytes: z.number().int().positive().max(UPLOAD_POLICY.cv.maxBytes),
}).strict();

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new CvPipelineError('FORBIDDEN', 401);
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new CvPipelineError('UNSUPPORTED_FORMAT');
    const rateLimited = await applyRateLimit(analysisLimiter, session.user.id);
    if (rateLimited) return rateLimited;

    const intent = await createCvUploadIntent({ userId: session.user.id, ...parsed.data });
    return NextResponse.json({
      intentId: intent.intentId,
      uploadUrl: intent.uploadUrl,
      expiresAt: intent.expiresAt.toISOString(),
      contentType: parsed.data.mimeType,
    }, { status: 201 });
  });
}
