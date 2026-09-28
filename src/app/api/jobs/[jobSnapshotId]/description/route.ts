import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import { ANALYSIS_LIMITS } from '@/shared/policies';
import { resolveDurableJobReference } from '@/shared/services/job-reference';
import {
  attachUserDescription,
  ensurePersistedJob,
} from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const Input = z.object({
  canonicalJobId: z.string().min(1).max(512).optional(),
  jobSnapshotId: z.string().min(1).max(128).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  description: z
    .string()
    .trim()
    .min(50)
    .max(ANALYSIS_LIMITS.maxJobDescriptionCharacters),
});

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/jobs/[jobSnapshotId]/description'>,
) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError(
        'Please sign in to add a job description.',
        401,
        undefined,
        'UNAUTHENTICATED',
      );
    }
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }
    const { jobSnapshotId: jobReference } = await context.params;
    const explicitSnapshotId = parsed.data.jobSnapshotId
      ?? (!parsed.data.canonicalJobId && !parsed.data.sessionId ? jobReference : undefined);
    const resolution = await resolveDurableJobReference(getCacheStore(), {
      canonicalJobId: parsed.data.canonicalJobId ?? jobReference,
      ...(explicitSnapshotId ? { jobSnapshotId: explicitSnapshotId } : {}),
      ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
      userId: session.user.id,
    });
    const jobSnapshotId =
      resolution.kind === 'persisted'
        ? resolution.jobSnapshotId
        : (await ensurePersistedJob(resolution.job)).snapshot.id;
    const snapshot = await attachUserDescription({
      userId: session.user.id,
      jobSnapshotId,
      description: parsed.data.description,
    });
    if (!snapshot) throw new APIError('Vacancy not found.', 404);
    return NextResponse.json({ snapshot });
  });
}
