import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { APIError } from '@/shared/utils/api-error';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { withCvPipeline } from '@/shared/services/cv-pipeline-http';
import { addUserSuppliedIdentity, IDENTITY_FIELDS } from '@/shared/services/cv-import';
import { checkCapability } from '@/shared/entitlements/server';

/**
 * Add a contact detail the CV did not contain, without leaving the review.
 *
 * A CV with no LinkedIn URL is common and is not a reason to send someone back
 * to the start of onboarding to add one. The value becomes an ordinary
 * reviewable candidate — stamped as user-supplied rather than parser-read, and
 * still requiring an explicit confirmation before it reaches `ProfileIdentity`.
 * This route creates a proposal; it does not apply one.
 */

const AddSchema = z.object({
  sessionId: z.string().min(1),
  field: z.enum(IDENTITY_FIELDS),
  value: z.string().trim().min(1).max(400),
});

export async function POST(request: Request) {
  return withCvPipeline(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to continue.', 401);

    const rateLimited = await applyRateLimit(analysisLimiter, session.user.id);
    if (rateLimited) return rateLimited;

    const parsed = AddSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError('That detail could not be added.', 400);

    const importSession = await addUserSuppliedIdentity({
      userId: session.user.id,
      sessionId: parsed.data.sessionId,
      field: parsed.data.field,
      value: parsed.data.value,
    });

    const evidenceCapacity = await checkCapability(session.user.id, 'profile_evidence_storage');
    return NextResponse.json({ session: importSession, evidenceCapacity });
  });
}
