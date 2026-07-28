import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { loadProfileTarget, resolveProfileId, listProfileTargets } from '@/features/dashboard/data/load-profile';
import { buildCandidatePracticalProfile, assessAndPersistJobIntelligence } from '@/shared/services/job-intelligence-store';
import { getJobDetailsView } from '@/shared/services/job-board-api';
import { createMatchRequest } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
const Input = z.object({ profileId: z.string().optional(), partialDescriptionAccepted: z.boolean().default(false) });
/** Preparation intentionally returns evidence and readiness, never a canonical match score. */
export async function POST(request: NextRequest, context: { params: Promise<{ jobSnapshotId: string }> }) { return withErrorHandler(async () => {
  const session = await auth.api.getSession({ headers: request.headers }); if (!session) throw new APIError('Please sign in to prepare a match.', 401, undefined, 'UNAUTHENTICATED');
  const parsed = Input.safeParse(await request.json().catch(() => null)); if (!parsed.success) throw new APIError('Invalid match preparation request.', 400, undefined, 'INVALID_REQUEST');
  const { jobSnapshotId } = await context.params; const profileId = await resolveProfileId(session.user.id, parsed.data.profileId); const careerTracks = await listProfileTargets(session.user.id);
  const details = await getJobDetailsView(jobSnapshotId, session.user.id); if (!details) throw new APIError('Vacancy not found.', 404, undefined, 'NOT_FOUND');
  if (!profileId) return NextResponse.json({ ...details, careerTracks, canProceed: false, warnings: ['Choose a Career Track before formal analysis.'] });
  const [track, candidate] = await Promise.all([loadProfileTarget(session.user.id, profileId), buildCandidatePracticalProfile(session.user.id, profileId)]);
  const intelligence = await assessAndPersistJobIntelligence({ jobSnapshotId, careerTrack: track ? { targetRoleTitle: track.targetRoleTitle, occupationFamily: track.targetOccupation, industry: track.targetIndustry, seniority: track.targetSeniority } : null, candidate });
  const refreshed = await getJobDetailsView(jobSnapshotId, session.user.id); if (!refreshed?.description.text) throw new APIError('A usable job description is required before formal analysis.', 409, undefined, 'DESCRIPTION_INCOMPLETE');
  let requestId: string | undefined; try { const matchRequest = await createMatchRequest({ userId: session.user.id, profileId, jobSnapshotId, partialDescriptionAccepted: parsed.data.partialDescriptionAccepted }); if (!matchRequest) throw new Error('Vacancy not found.'); requestId = matchRequest.id; } catch (error) { throw new APIError(error instanceof Error ? error.message : 'Unable to prepare this match.', 409, undefined, 'DESCRIPTION_INCOMPLETE'); }
  return NextResponse.json({ ...refreshed, careerTracks, selectedCareerTrackId: profileId, practicalCandidateComparison: intelligence?.practicalAssessment, canProceed: true, warnings: refreshed.description.completeness === 'PARTIAL' ? ['The provider supplied a partial description; requirements may be incomplete.'] : [], matchRequestId: requestId });
}); }