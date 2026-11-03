import 'server-only';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { createCareerProfileSnapshot } from '@/shared/services/career-profile-snapshot';
import { createGenerationSession } from './repository';
import { loadJobMatchGenerationSource } from './source-job-match';
import { profileToCandidateEvidence } from './source-profile';
import { mergeCandidateEvidence } from './merge-evidence';
import { reconcileRequirements, unresolvedRequirements } from './reconcile';
import { clusterMaterialGaps } from './gap-clustering';
import { RequirementLedgerSnapshotSchema } from './schemas';
import type { CvAtsStrategy, CvGenerationSourceMode, GenerationRequirement } from './types';

export interface StartCvGenerationInput {
  userId: string;
  operationId: string;
  sourceMode: CvGenerationSourceMode;
  atsStrategy: CvAtsStrategy;
  profileId?: string;
  jobMatchId?: string;
  targetContext?: unknown;
}

function targetRequirements(targetContext: unknown): GenerationRequirement[] {
  const target = targetContext as { requirements?: unknown } | null;
  if (!target?.requirements) return [];
  return RequirementLedgerSnapshotSchema.parse({ schemaVersion: 1, analysisVersion: 'profile-target@1', requirements: target.requirements }).requirements;
}

export async function startCvGeneration(input: StartCvGenerationInput) {
  if (input.sourceMode === 'JOB_MATCH') {
    if (!input.jobMatchId) throw new Error('Choose a Job Match source.');
    const source = await loadJobMatchGenerationSource(input.userId, input.jobMatchId);
    const currentProfile = source.matchProfileId ? await loadOwnedProfileData(input.userId, source.matchProfileId) : null;
    const currentSnapshot = currentProfile
      ? await createCareerProfileSnapshot({ userId: input.userId, profileId: currentProfile.profileId })
      : null;
    const currentEvidence = currentProfile && currentSnapshot
      ? profileToCandidateEvidence(currentProfile, { snapshotId: currentSnapshot.id })
      : null;
    const evidence = mergeCandidateEvidence([source.cvEvidence, source.matchProfileEvidence, ...(currentEvidence ? [currentEvidence] : [])]);
    const reconciliation = reconcileRequirements(source.ledger.requirements, evidence);
    const generation = await createGenerationSession({
      userId: input.userId, operationId: input.operationId, sourceMode: input.sourceMode,
      atsStrategy: input.atsStrategy, profileId: currentProfile?.profileId,
      linkage: { ...source.linkage, ...(currentSnapshot ? { generationProfileSnapshotId: currentSnapshot.id } : {}) },
      generationProfileSnapshotId: currentSnapshot?.id, targetContext: source.target,
      evidence, initialReconciliation: reconciliation,
    });
    return { generation, evidence, reconciliation, gaps: clusterMaterialGaps(source.ledger.requirements, reconciliation), remaining: unresolvedRequirements(reconciliation).length };
  }

  if (!input.profileId) throw new Error('Choose a Career Profile source.');
  const profile = await loadOwnedProfileData(input.userId, input.profileId);
  if (!profile) throw new Error('Career Profile not found.');
  const snapshot = await createCareerProfileSnapshot({ userId: input.userId, profileId: profile.profileId });
  const evidence = profileToCandidateEvidence(profile, { snapshotId: snapshot.id });
  const requirements = targetRequirements(input.targetContext);
  const reconciliation = reconcileRequirements(requirements, evidence);
  const generation = await createGenerationSession({
    userId: input.userId, operationId: input.operationId, sourceMode: input.sourceMode,
    atsStrategy: input.atsStrategy, profileId: profile.profileId,
    generationProfileSnapshotId: snapshot.id, targetContext: input.targetContext,
    evidence, initialReconciliation: reconciliation,
  });
  return { generation, evidence, reconciliation, gaps: clusterMaterialGaps(requirements, reconciliation), remaining: unresolvedRequirements(reconciliation).length };
}
