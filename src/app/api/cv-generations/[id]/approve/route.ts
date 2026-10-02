import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { approveGenerationPlan } from '@/shared/cv-generation/plan-workflow';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { TemplateIdSchema } from '@/shared/constants/templates';

const ApprovalSchema = z.strictObject({
  template: TemplateIdSchema,
  excludedOptionalEvidenceIds: z.array(z.string().min(1)).default([]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to approve a CV plan.', 401);
    const { id } = await context.params;
    const parsed = ApprovalSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    return NextResponse.json({ plan: await approveGenerationPlan({ userId: session.user.id, generationId: id, ...parsed.data }) });
  });
}
