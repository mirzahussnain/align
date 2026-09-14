import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { finalizeCvUpload } from '@/shared/services/cv-upload-intent';
import { CvPipelineError } from '@/shared/services/cv-extraction';

const Input = z.object({ intentId: z.string().trim().min(1).max(128) }).strict();

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new CvPipelineError('FORBIDDEN', 401);
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new CvPipelineError('NOT_FOUND', 400);

    const outcome = await finalizeCvUpload({
      userId: session.user.id,
      intentId: parsed.data.intentId,
    });
    return NextResponse.json(
      { duplicate: outcome.kind === 'duplicate', storedCv: outcome.storedCv },
      { status: outcome.kind === 'duplicate' ? 200 : 201 }
    );
  });
}
