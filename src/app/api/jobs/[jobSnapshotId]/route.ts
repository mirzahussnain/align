import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { checkCapability } from '@/shared/entitlements/server';
import { listProfileTargets } from '@/features/dashboard/data/load-profile';
import { getSnapshotDetails } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

export async function GET(request: NextRequest, context: RouteContext<'/api/jobs/[jobSnapshotId]'>) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view this vacancy.', 401);
    const { jobSnapshotId } = await context.params;
    const snapshot = await getSnapshotDetails(jobSnapshotId);
    if (!snapshot) throw new APIError('Vacancy not found.', 404);
    const [profiles, usage] = await Promise.all([listProfileTargets(session.user.id), checkCapability(session.user.id, 'job_match_analysis')]);
    return NextResponse.json({ snapshot, profiles, selectedProfile: profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null, usage });
  });
}