import { z } from 'zod';
import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { confirmRequirementsMissing } from '@/shared/cv-generation/evidence-workflow';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const ConfirmSchema = z.strictObject({ requirementIds: z.array(z.string().min(1)).min(1) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to update CV evidence.', 401);
    const { id } = await context.params;
    const parsed = ConfirmSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const reconciliation = await confirmRequirementsMissing({ userId: session.user.id, generationId: id, requirementIds: parsed.data.requirementIds });
    return NextResponse.json({ reconciliation });
  });
}
