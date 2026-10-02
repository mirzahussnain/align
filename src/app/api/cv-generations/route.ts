import { z } from 'zod';
import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { startCvGeneration } from '@/shared/cv-generation/engine';

const StartSchema = z.strictObject({
  operationId: z.string().uuid(),
  sourceMode: z.enum(['JOB_MATCH', 'CAREER_PROFILE']),
  atsStrategy: z.enum(['STANDARD', 'COMPOSITE']).default('STANDARD'),
  profileId: z.string().optional(),
  jobMatchId: z.string().optional(),
  targetContext: z.unknown().optional(),
});

export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to generate a CV.', 401);
    const parsed = StartSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const result = await startCvGeneration({ userId: session.user.id, ...parsed.data });
    return NextResponse.json({
      generationId: result.generation.id,
      status: result.generation.status,
      sourceMode: result.generation.sourceMode,
      atsStrategy: result.generation.atsStrategy,
      gaps: result.gaps,
      reconciliation: result.reconciliation,
      evidence: result.evidence,
      remaining: result.remaining,
    }, { status: 201 });
  });
}
