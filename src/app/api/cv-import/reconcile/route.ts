import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { reconcileImportSession } from '@/shared/services/cv-import';

/**
 * Compare an import against the Career Profile it is going into.
 *
 * Metered against `cv_import_reconciliation` — its own capability, separate from
 * `profile_reconciliation`, so using one never consumes the other.
 *
 * The operation id comes from the client header exactly as it does for the other
 * metered routes, which is what makes a double-click, a refresh or a network
 * retry resolve to the same reservation instead of a second charge.
 *
 * When the capability is unavailable this returns 200 with `status:
 * "unavailable"`, NOT an error. Reconciliation is an assist: the proposals are
 * already there, manual review already works, and refusing the request would
 * block a user from importing their own CV over a comparison they never needed.
 */

const ReconcileSchema = z.object({ sessionId: z.string().min(1) });

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to continue.', 401);

    // Shares the rewrite limiter: an AI call of comparable cost.
    const rateLimited = await applyRateLimit(rewriteLimiter, session.user.id);
    if (rateLimited) return rateLimited;

    const parsed = ReconcileSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError('That import could not be found.', 400);

    const outcome = await reconcileImportSession({
      userId: session.user.id,
      sessionId: parsed.data.sessionId,
      operationId: request.headers.get('x-operation-id') ?? crypto.randomUUID(),
    });

    return NextResponse.json(outcome);
  });
}
