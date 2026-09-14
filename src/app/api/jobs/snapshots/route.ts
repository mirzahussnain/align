import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { getSnapshotDetails } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const Input = z.object({
  jobSnapshotId: z.string().trim().min(1).max(128),
}).strict();

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view vacancy details.', 401);

    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError('Provide a valid job snapshot ID.', 400, undefined, 'INVALID_REQUEST');

    const snapshot = await getSnapshotDetails(parsed.data.jobSnapshotId, session.user.id);
    if (!snapshot) {
      throw new APIError(
        'The job reference is invalid or unavailable.',
        400,
        undefined,
        'INVALID_JOB_REFERENCE'
      );
    }

    return NextResponse.json({ jobSnapshotId: snapshot.id });
  });
}