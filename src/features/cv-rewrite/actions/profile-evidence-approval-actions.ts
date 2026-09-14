'use server';

import { headers } from 'next/headers';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { resolveApprovedProfileEvidence } from '@/shared/services/profile-reconciler';
import type { ProfileEvidenceRef } from '@/shared/types/profile-reasoning';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';
import {
  assertApplicationApprovalLimit,
  EntitlementRequiredError,
} from '@/shared/entitlements/server';
import type { CapabilityDecision } from '@/shared/entitlements/registry';

/**
 * Result of an approval attempt. The per-application approval cap does not throw
 * across the server-action boundary (Next redacts server-action errors, so the
 * client could not open the upgrade surface); instead the limit is returned as a
 * structured `blocked` result carrying the canonical decision.
 */
export type ApproveProfileEvidenceResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'approval_limit'; decision: CapabilityDecision };

/** Creates the sole durable, versioned approval snapshot before generation. */
export async function approveProfileEvidenceSnapshot(input: {
  analysisId: string;
  profileId: string;
  requirementId: string;
  evidenceRef: ProfileEvidenceRef;
  rationale?: string;
}): Promise<ApproveProfileEvidenceResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');
  const [profile, analysis] = await Promise.all([
    loadOwnedProfileData(session.user.id, input.profileId),
    prisma.jobMatch.findFirst({ where: { id: input.analysisId, userId: session.user.id }, select: { resultJson: true } }),
  ]);
  const jobMatch = parseStoredJobMatchData((analysis?.resultJson as Record<string, unknown> | undefined)?.jobMatchData);
  if (!profile || !jobMatch) throw new Error('Profile evidence cannot be approved.');
  const [resolved] = resolveApprovedProfileEvidence(profile, [{ requirementId: input.requirementId, evidenceRef: input.evidenceRef, rationale: input.rationale }], jobMatch.requirements);
  if (!resolved?.evidenceSnapshot) throw new Error('Profile evidence snapshot could not be captured.');
  try {
    // The cap and the create run in one transaction so the count cannot be raced.
    const created = await prisma.$transaction(async (tx) => {
      await assertApplicationApprovalLimit(session.user.id, input.analysisId, tx);
      return tx.profileEvidenceApproval.create({
        data: {
          userId: session.user.id, jobMatchId: input.analysisId, profileId: profile.profileId,
          requirementId: input.requirementId, evidenceType: input.evidenceRef.type, evidenceId: input.evidenceRef.id,
          snapshot: JSON.parse(JSON.stringify({ ...resolved.evidenceSnapshot, schemaVersion: 1, evidenceType: input.evidenceRef.type, evidenceId: input.evidenceRef.id, displayTitle: resolved.evidenceLocation, displaySummary: resolved.resolvedEvidenceText, capturedAt: new Date().toISOString() })), snapshotVersion: 1,
        }, select: { id: true },
      });
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (error instanceof EntitlementRequiredError) {
      return { ok: false, reason: 'approval_limit', decision: error.decision };
    }
    throw error;
  }
}
