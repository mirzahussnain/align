import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { proposeGenerationPlan } from '@/shared/cv-generation/plan-workflow';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to plan a CV.', 401);
    const { id } = await context.params;
    return NextResponse.json({ plan: await proposeGenerationPlan(session.user.id, id) });
  });
}
