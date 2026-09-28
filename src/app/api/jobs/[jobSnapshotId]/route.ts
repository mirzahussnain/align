import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import { listProfileTargets, resolveProfileId } from '@/features/dashboard/data/load-profile';
import {
  getJobDetailsView,
  getNormalisedJobDetailsView,
} from '@/shared/services/job-board-api';
import { resolveJobReference } from '@/shared/services/job-reference';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

/**
 * Details are a durable snapshot read: opening a job never contacts an ATS or a
 * job provider. It MAY complete a bounded, awaited sponsor-register check when
 * the linked company's evidence is missing or belongs to a superseded register.
 *
 * Practical compatibility is computed for the signed-in user's own profile only.
 * `resolveProfileId` is scoped by user id, so a `profileId` belonging to someone
 * else resolves to nothing and no comparison is produced — and the comparison is
 * never written to any shared cache.
 */
export async function GET(request: NextRequest, context: RouteContext<'/api/jobs/[jobSnapshotId]'>) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    const { jobSnapshotId: canonicalJobId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const requestedProfileId = searchParams.get('profileId') ?? undefined;
    const profileId = userId ? await resolveProfileId(userId, requestedProfileId) : undefined;
    const resolution = await resolveJobReference(getCacheStore(), {
      canonicalJobId,
      ...(searchParams.get('jobSnapshotId')
        ? { jobSnapshotId: searchParams.get('jobSnapshotId')! }
        : {}),
      ...(searchParams.get('sessionId')
        ? { sessionId: searchParams.get('sessionId')! }
        : {}),
      userId: userId ?? null,
    });
    const [details, careerTracks] = await Promise.all([
      resolution.kind === 'persisted'
        ? getJobDetailsView(
            resolution.jobSnapshotId,
            userId ?? '',
            profileId ? { profileId } : {},
          )
        : Promise.resolve(getNormalisedJobDetailsView(resolution.job)),
      userId ? listProfileTargets(userId) : Promise.resolve([]),
    ]);
    if (!details) throw new APIError('Vacancy not found.', 404, undefined, 'NOT_FOUND');
    return NextResponse.json({
      ...details,
      job: {
        ...details.job,
        canonicalJobId,
        ...(resolution.kind === 'persisted'
          ? { jobSnapshotId: resolution.jobSnapshotId }
          : {}),
      },
      ...(profileId ? { practicalCompatibilityProfileId: profileId } : {}),
      availableCareerTracks: careerTracks.map((track) => ({ id: track.profileId, label: track.label, isDefault: track.isDefault })),
    });
  });
}
