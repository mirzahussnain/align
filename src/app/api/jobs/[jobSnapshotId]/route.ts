import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { listProfileTargets } from '@/features/dashboard/data/load-profile';
import { getJobDetailsView } from '@/shared/services/job-board-api';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

/** Details are a durable snapshot read: opening a job never contacts an ATS or provider. */
export async function GET(request: NextRequest, context: RouteContext<'/api/jobs/[jobSnapshotId]'>) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view this vacancy.', 401, undefined, 'UNAUTHENTICATED');
    const { jobSnapshotId } = await context.params;
    const [details, careerTracks] = await Promise.all([getJobDetailsView(jobSnapshotId, session.user.id), listProfileTargets(session.user.id)]);
    if (!details) throw new APIError('Vacancy not found.', 404, undefined, 'NOT_FOUND');
    return NextResponse.json({ ...details, availableCareerTracks: careerTracks.map((track) => ({ id: track.profileId, label: track.label, isDefault: track.isDefault })) });
  });
}