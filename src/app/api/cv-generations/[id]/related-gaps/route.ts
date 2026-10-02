import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { suggestGenerationRelatedGaps } from '@/shared/cv-generation/evidence-workflow';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const Schema = z.strictObject({
  text: z.string().trim().min(1).max(2000),
  excludeRequirementIds: z.array(z.string().min(1)).default([]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to review related evidence gaps.', 401);
    const { id } = await context.params;
    const parsed = Schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    return NextResponse.json({ suggestions: await suggestGenerationRelatedGaps({ userId: session.user.id, generationId: id, ...parsed.data }) });
  });
}
