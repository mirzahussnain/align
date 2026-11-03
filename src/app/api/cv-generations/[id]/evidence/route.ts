import { auth } from '@/shared/lib/auth';
import { NextResponse } from 'next/server';
import { EvidenceCaptureInputSchema } from '@/shared/cv-generation/schemas';
import { saveAndReconcileEvidenceCapture } from '@/shared/cv-generation/evidence-workflow';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to update CV evidence.', 401);
    const { id } = await context.params;
    const parsed = EvidenceCaptureInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const result = await saveAndReconcileEvidenceCapture({ userId: session.user.id, generationId: id, input: parsed.data });
    return NextResponse.json({
      reconciliation: result.reconciliation,
      resolvedRequirementIds: result.resolvedRequirementIds,
      remaining: result.remaining,
      gaps: result.gaps,
      evidence: result.evidence,
    });
  });
}
