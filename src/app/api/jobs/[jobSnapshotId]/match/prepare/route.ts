import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { loadProfileTarget, resolveProfileId } from '@/features/dashboard/data/load-profile';
import { createMatchRequest } from '@/shared/services/job-snapshot';
import { assessAndPersistJobIntelligence } from '@/shared/services/job-intelligence-store';
import { buildConfirmedCandidateFacts } from '@/shared/services/practical-compatibility-store';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { ANALYSIS_LIMITS } from '@/shared/policies';

const Input = z.object({
  profileId: z.string().optional(),
  partialDescriptionAccepted: z.boolean().default(false),
  descriptionOverride: z.string().trim().min(50).max(ANALYSIS_LIMITS.maxJobDescriptionCharacters).optional(),
});
export async function POST(request: NextRequest, context: RouteContext<'/api/jobs/[jobSnapshotId]/match/prepare'>) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to match a vacancy.', 401);
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const profileId = await resolveProfileId(session.user.id, parsed.data.profileId);
    if (!profileId) throw new APIError('Choose a Career Track before matching a vacancy.', 400);
    const { jobSnapshotId } = await context.params;
    const [track, candidateFacts] = await Promise.all([
      loadProfileTarget(session.user.id, profileId),
      buildConfirmedCandidateFacts(session.user.id, profileId),
    ]);
    await assessAndPersistJobIntelligence({
      jobSnapshotId,
      userId: session.user.id,
      careerTrack: track ? { targetRoleTitle: track.targetRoleTitle, occupationFamily: track.targetOccupation, industry: track.targetIndustry, seniority: track.targetSeniority } : null,
      candidateFacts,
    });
    let matchRequest;
    try {
      matchRequest = await createMatchRequest({ userId: session.user.id, profileId, jobSnapshotId, partialDescriptionAccepted: parsed.data.partialDescriptionAccepted, descriptionOverride: parsed.data.descriptionOverride });
    } catch (error) {
      throw new APIError(error instanceof Error ? error.message : 'Unable to prepare this job match.', 400);
    }
    if (!matchRequest) throw new APIError('Vacancy not found.', 404);
    return NextResponse.json({ matchRequestId: matchRequest.id });
  });
}
