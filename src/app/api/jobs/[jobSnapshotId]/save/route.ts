import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { saveJobForUser, unsaveJobForUser } from '@/shared/services/saved-job';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const Input = z.object({ profileId: z.string().min(1).max(128).optional() }).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ jobSnapshotId: string }> }) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to save a job.', 401, undefined, 'UNAUTHENTICATED');
    const input = Input.safeParse(await request.json().catch(() => ({})));
    if (!input.success) throw new APIError('Invalid save request.', 400, undefined, 'INVALID_REQUEST');
    const { jobSnapshotId } = await context.params;
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