import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import {
  loadProfileTarget,
  resolveProfileId,
  listProfileTargets,
} from '@/features/dashboard/data/load-profile';
import { assessAndPersistJobIntelligence } from '@/shared/services/job-intelligence-store';
import { buildConfirmedCandidateFacts } from '@/shared/services/practical-compatibility-store';
import { getJobDetailsView } from '@/shared/services/job-board-api';
import { resolveDurableJobReference } from '@/shared/services/job-reference';
import { createMatchRequest, ensurePersistedJob } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { ANALYSIS_LIMITS } from '@/shared/policies';

const Input = z.object({
  canonicalJobId: z.string().min(1).max(512).optional(),
  jobSnapshotId: z.string().min(1).max(128).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  profileId: z.string().optional(),
  partialDescriptionAccepted: z.boolean().default(false),
  descriptionOverride: z
    .string()
    .trim()
    .min(50)
    .max(ANALYSIS_LIMITS.maxJobDescriptionCharacters)
    .optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobSnapshotId: string }> },
) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError(
        'Please sign in to prepare a match.',
        401,
        undefined,
        'UNAUTHENTICATED',
      );
    }
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new APIError(
        'Invalid match preparation request.',
        400,
        undefined,
        'INVALID_REQUEST',
      );
    }
    const { jobSnapshotId: jobReference } = await context.params;
    const explicitSnapshotId =
      parsed.data.jobSnapshotId ??
      (!parsed.data.canonicalJobId && !parsed.data.sessionId
        ? jobReference
        : undefined);
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
    const profileId = await resolveProfileId(
      session.user.id,
      parsed.data.profileId,
    );
    const careerTracks = await listProfileTargets(session.user.id);
    const details = await getJobDetailsView(jobSnapshotId, session.user.id);
    if (!details) {
      throw new APIError('Vacancy not found.', 404, undefined, 'NOT_FOUND');
    }
    if (!profileId) {
      return NextResponse.json({
        ...details,
        careerTracks,
        canProceed: false,
        warnings: ['Choose a Career Track before formal analysis.'],
      });
    }
    const [track, candidateFacts] = await Promise.all([
      loadProfileTarget(session.user.id, profileId),
      buildConfirmedCandidateFacts(session.user.id, profileId),
    ]);
    const intelligence = await assessAndPersistJobIntelligence({
      jobSnapshotId,
      userId: session.user.id,
      careerTrack: track
        ? {
            targetRoleTitle: track.targetRoleTitle,
            occupationFamily: track.targetOccupation,
            industry: track.targetIndustry,
            seniority: track.targetSeniority,
          }
        : null,
      candidateFacts,
    });
    const refreshed = await getJobDetailsView(jobSnapshotId, session.user.id, {
      profileId,
    });
    if (!refreshed?.description.text) {
      throw new APIError(
        'A usable job description is required before formal analysis.',
        409,
        undefined,
        'DESCRIPTION_INCOMPLETE',
      );
    }
    let requestId: string;
    try {
      const matchRequest = await createMatchRequest({
        userId: session.user.id,
        profileId,
        jobSnapshotId,
        partialDescriptionAccepted: parsed.data.partialDescriptionAccepted,
        descriptionOverride: parsed.data.descriptionOverride,
      });
      if (!matchRequest) throw new Error('Vacancy not found.');
      requestId = matchRequest.id;
    } catch (error) {
      throw new APIError(
        error instanceof Error ? error.message : 'Unable to prepare this match.',
        409,
        undefined,
        'DESCRIPTION_INCOMPLETE',
      );
    }
    return NextResponse.json({
      ...refreshed,
      careerTracks,
      selectedCareerTrackId: profileId,
      practicalCompatibility:
        intelligence?.practicalCompatibility ?? refreshed.practicalCompatibility,
      canProceed: true,
      warnings:
        refreshed.description.completeness === 'PARTIAL'
          ? ['The provider supplied a partial description; requirements may be incomplete.']
          : [],
      matchRequestId: requestId,
    });
  });
}
