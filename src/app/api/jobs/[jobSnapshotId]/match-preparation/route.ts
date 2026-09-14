import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { loadProfileTarget, resolveProfileId, listProfileTargets } from '@/features/dashboard/data/load-profile';
import { assessAndPersistJobIntelligence } from '@/shared/services/job-intelligence-store';
import { buildConfirmedCandidateFacts } from '@/shared/services/practical-compatibility-store';
import { getJobDetailsView } from '@/shared/services/job-board-api';
import { createMatchRequest } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { ANALYSIS_LIMITS } from '@/shared/policies';
const Input = z.object({
  profileId: z.string().optional(),
  partialDescriptionAccepted: z.boolean().default(false),
  descriptionOverride: z.string().trim().min(50).max(ANALYSIS_LIMITS.maxJobDescriptionCharacters).optional(),
});
/**
 * Preparation returns EVIDENCE and readiness, never a canonical match score.
 *
 * It carries four separate things and keeps them separate all the way to the
 * client: description completeness, employer sponsor-register evidence, vacancy
 * sponsorship wording, and candidate practical compatibility. None of them is
 * combined, and none of them contributes to the formal CV-fit percentage that
 * the analysis route later produces.
 *
 * Everything here is scoped to the signed-in user: `resolveProfileId` and
 * `buildConfirmedCandidateFacts` both filter by user id, so another account's
 * profile can never be compared or returned.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ jobSnapshotId: string }> }) { return withErrorHandler(async () => {
  const session = await auth.api.getSession({ headers: request.headers }); if (!session) throw new APIError('Please sign in to prepare a match.', 401, undefined, 'UNAUTHENTICATED');
  const parsed = Input.safeParse(await request.json().catch(() => null)); if (!parsed.success) throw new APIError('Invalid match preparation request.', 400, undefined, 'INVALID_REQUEST');
  const { jobSnapshotId } = await context.params; const profileId = await resolveProfileId(session.user.id, parsed.data.profileId); const careerTracks = await listProfileTargets(session.user.id);
  const details = await getJobDetailsView(jobSnapshotId, session.user.id); if (!details) throw new APIError('Vacancy not found.', 404, undefined, 'NOT_FOUND');
  if (!profileId) return NextResponse.json({ ...details, careerTracks, canProceed: false, warnings: ['Choose a Career Track before formal analysis.'] });
  const [track, candidateFacts] = await Promise.all([loadProfileTarget(session.user.id, profileId), buildConfirmedCandidateFacts(session.user.id, profileId)]);
  const intelligence = await assessAndPersistJobIntelligence({ jobSnapshotId, userId: session.user.id, careerTrack: track ? { targetRoleTitle: track.targetRoleTitle, occupationFamily: track.targetOccupation, industry: track.targetIndustry, seniority: track.targetSeniority } : null, candidateFacts });
  const refreshed = await getJobDetailsView(jobSnapshotId, session.user.id, { profileId }); if (!refreshed?.description.text) throw new APIError('A usable job description is required before formal analysis.', 409, undefined, 'DESCRIPTION_INCOMPLETE');
  let requestId: string | undefined; try { const matchRequest = await createMatchRequest({ userId: session.user.id, profileId, jobSnapshotId, partialDescriptionAccepted: parsed.data.partialDescriptionAccepted, descriptionOverride: parsed.data.descriptionOverride }); if (!matchRequest) throw new Error('Vacancy not found.'); requestId = matchRequest.id; } catch (error) { throw new APIError(error instanceof Error ? error.message : 'Unable to prepare this match.', 409, undefined, 'DESCRIPTION_INCOMPLETE'); }
  return NextResponse.json({ ...refreshed, careerTracks, selectedCareerTrackId: profileId, practicalCompatibility: intelligence?.practicalCompatibility ?? refreshed.practicalCompatibility, canProceed: true, warnings: refreshed.description.completeness === 'PARTIAL' ? ['The provider supplied a partial description; requirements may be incomplete.'] : [], matchRequestId: requestId });
}); }
