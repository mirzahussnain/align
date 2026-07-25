import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { buildProfileCandidates } from '@/shared/services/profile-reconciler';
import {
  assertCapability,
  consumeCapability,
} from '@/shared/entitlements/server';
import {
  createCanonicalEvidence,
  describeStructuredEvidence,
  StructuredEvidenceValidationError,
  validateStructuredEvidence,
} from '@/shared/services/structured-evidence';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

const eligibleStatuses = new Set(['partial', 'not_met', 'contradicted', 'unclear']);
const CaptureSchema = z.object({
  analysisId: z.string().min(1),
  profileId: z.string().min(1),
  requirementId: z.string().min(1),
  reuseInProfile: z.boolean(),
  kind: z.string().min(1),
  details: z.unknown(),
  confirmed: z.literal(true),
});

async function assertEligible(userId: string, analysisId: string, requirementId: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, userId },
    select: { jobMatchData: true },
  });
  const requirement = parseStoredJobMatchData(analysis?.jobMatchData)?.requirements.find(
    (item) => item.id === requirementId
  );
  if (!requirement) throw new APIError('Requirement not found for this analysis.', 404);
  if (!eligibleStatuses.has(requirement.status)) {
    throw new APIError('This requirement cannot receive additional evidence.', 400);
  }
}

export async function GET(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view profile evidence.', 401);
    const profileId = new URL(request.url).searchParams.get('profileId') ?? '';
    const profile = await loadOwnedProfileData(session.user.id, profileId);
    if (!profile) throw new APIError('Profile not found.', 404);
    await assertCapability(session.user.id, 'reuse_evidence_across_applications');
    return NextResponse.json({ profileId: profile.profileId, candidates: buildProfileCandidates(profile) });
  });
}

export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to add evidence.', 401);
    const parsed = CaptureSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const input = parsed.data;

    const profile = await loadOwnedProfileData(session.user.id, input.profileId);
    if (!profile) throw new APIError('Profile not found.', 404);
    await assertEligible(session.user.id, input.analysisId, input.requirementId);

    let parsedEvidence;
    try {
      parsedEvidence = validateStructuredEvidence(input.kind, input.details);
    } catch (error) {
      if (error instanceof StructuredEvidenceValidationError) throw new APIError(error.message, 400);
      throw error;
    }

    await assertCapability(session.user.id, 'approve_evidence_for_application');
    await assertCapability(session.user.id, 'human_evidence_capture');
    if (input.reuseInProfile) {
      await assertCapability(session.user.id, 'reuse_evidence_across_applications');
      await assertCapability(session.user.id, 'profile_evidence_storage');
    }

    const description = describeStructuredEvidence(parsedEvidence.kind, parsedEvidence.details);
    const operationId = request.headers.get('x-operation-id') ?? crypto.randomUUID();
    if (input.reuseInProfile) {
      const evidenceRef = await createCanonicalEvidence(
        profile.profileId,
        parsedEvidence.kind,
        parsedEvidence.details
      );
      await consumeCapability(session.user.id, 'human_evidence_capture', operationId);
      return NextResponse.json(
        {
          evidenceRef,
          evidenceText: description.text,
          evidenceLocation: `${description.label} · Career Profile`,
          userApproved: true,
        },
        { status: 201 }
      );
    }

    const saved = await prisma.applicationEvidenceContext.create({
      data: {
        userId: session.user.id,
        analysisId: input.analysisId,
        profileId: profile.profileId,
        requirementId: input.requirementId,
        kind: parsedEvidence.kind.toUpperCase() as never,
        details: parsedEvidence.details,
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    await consumeCapability(session.user.id, 'human_evidence_capture', operationId);
    return NextResponse.json(
      {
        applicationEvidenceContextId: saved.id,
        userApproved: true,
        label: description.label,
        text: description.text,
      },
      { status: 201 }
    );
  });
}
