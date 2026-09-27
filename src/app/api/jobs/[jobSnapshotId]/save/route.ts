import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import { resolveDurableJobReference } from '@/shared/services/job-reference';
import { saveJobForUser, unsaveJobForUser } from '@/shared/services/saved-job';
import { ensurePersistedJob } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const Input = z.object({
  canonicalJobId: z.string().min(1).max(512).optional(),
  jobSnapshotId: z.string().min(1).max(128).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  profileId: z.string().min(1).max(128).optional(),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ jobSnapshotId: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to save a job.', 401, undefined, 'UNAUTHENTICATED');
    const input = Input.safeParse(await request.json().catch(() => ({})));
    if (!input.success) throw new APIError('Invalid save request.', 400, undefined, 'INVALID_REQUEST');
    const { jobSnapshotId: jobReference } = await context.params;
    const explicitSnapshotId = input.data.jobSnapshotId
      ?? (!input.data.canonicalJobId && !input.data.sessionId ? jobReference : undefined);
    const resolution = await resolveDurableJobReference(getCacheStore(), {
      canonicalJobId: input.data.canonicalJobId ?? jobReference,
      ...(explicitSnapshotId ? { jobSnapshotId: explicitSnapshotId } : {}),
      ...(input.data.sessionId ? { sessionId: input.data.sessionId } : {}),
      userId: session.user.id,
    });
    const jobSnapshotId = resolution.kind === 'persisted'
      ? resolution.jobSnapshotId
      : (await ensurePersistedJob(resolution.job)).snapshot.id;
    const result = await saveJobForUser({ userId: session.user.id, jobSnapshotId, profileId: input.data.profileId });
    return NextResponse.json({ saved: true, jobSnapshotId: result.savedJob.jobSnapshotId }, { status: result.created ? 201 : 200 });
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ jobSnapshotId: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to remove a saved job.', 401, undefined, 'UNAUTHENTICATED');
    const { jobSnapshotId } = await context.params;
    await unsaveJobForUser({ userId: session.user.id, jobSnapshotId });
    return NextResponse.json({ saved: false, jobSnapshotId });
  });
}
