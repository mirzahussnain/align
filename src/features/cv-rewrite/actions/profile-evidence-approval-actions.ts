'use server';

import { headers } from 'next/headers';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { resolveApprovedProfileEvidence } from '@/shared/services/profile-reconciler';
import type { ProfileEvidenceRef } from '@/shared/types/profile-reasoning';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';
import { assertCapability } from '@/shared/entitlements/server';

/** Creates the sole durable, versioned approval snapshot before generation. */
export async function approveProfileEvidenceSnapshot(input: {
  analysisId: string;
  profileId: string;
  requirementId: string;
  evidenceRef: ProfileEvidenceRef;
  rationale?: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');
  const [profile, analysis] = await Promise.all([
    loadOwnedProfileData(session.user.id, input.profileId),
    prisma.analysis.findFirst({ where: { id: input.analysisId, userId: session.user.id }, select: { jobMatchData: true } }),
  ]);
  const jobMatch = parseStoredJobMatchData(analysis?.jobMatchData);
  if (!profile || !jobMatch) throw new Error('Profile evidence cannot be approved.');
  await assertCapability(session.user.id, 'approve_evidence_for_application');
  const [resolved] = resolveApprovedProfileEvidence(profile, [{ requirementId: input.requirementId, evidenceRef: input.evidenceRef, rationale: input.rationale }], jobMatch.requirements);
  if (!resolved?.evidenceSnapshot) throw new Error('Profile evidence snapshot could not be captured.');
  const created = await prisma.profileEvidenceApproval.create({
    data: {
      userId: session.user.id, analysisId: input.analysisId, profileId: profile.profileId,
      requirementId: input.requirementId, evidenceType: input.evidenceRef.type, evidenceId: input.evidenceRef.id,
      snapshot: JSON.parse(JSON.stringify({ ...resolved.evidenceSnapshot, schemaVersion: 1, evidenceType: input.evidenceRef.type, evidenceId: input.evidenceRef.id, displayTitle: resolved.evidenceLocation, displaySummary: resolved.resolvedEvidenceText, capturedAt: new Date().toISOString() })), snapshotVersion: 1,
    }, select: { id: true },
  });
  return { id: created.id };
}
