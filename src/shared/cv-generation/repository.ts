import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { UnifiedCandidateEvidenceSchema } from './schemas';
import { RequirementReconciliationSnapshotSchema } from './schemas';
import type { CvAtsStrategy, CvGenerationSourceMode, ExactJobMatchSourceLinkage, RequirementReconciliationSnapshot, UnifiedCandidateEvidence } from './types';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export interface CreateGenerationSessionInput {
  userId: string;
  operationId: string;
  sourceMode: CvGenerationSourceMode;
  atsStrategy: CvAtsStrategy;
  profileId?: string;
  linkage?: ExactJobMatchSourceLinkage;
  generationProfileSnapshotId?: string;
  targetContext?: unknown;
  evidence: UnifiedCandidateEvidence;
  initialReconciliation?: RequirementReconciliationSnapshot;
}

export async function createGenerationSession(input: CreateGenerationSessionInput) {
  const evidence = UnifiedCandidateEvidenceSchema.parse(input.evidence);
  if (input.sourceMode === 'JOB_MATCH' && !input.linkage) throw new Error('Job Match generation requires exact source linkage.');
  if (input.sourceMode === 'CAREER_PROFILE' && !input.profileId) throw new Error('Career Profile generation requires a profile.');
  const serialized = JSON.stringify(evidence);
  const reconciliation = input.initialReconciliation ? RequirementReconciliationSnapshotSchema.parse(input.initialReconciliation) : null;
  return prisma.$transaction(async (tx) => {
    const generation = await tx.cvGeneration.create({
      data: {
        userId: input.userId, operationId: input.operationId, sourceMode: input.sourceMode,
        atsStrategy: input.atsStrategy, profileId: input.profileId,
        jobMatchId: input.linkage?.jobMatchId, storedCvId: input.linkage?.storedCvId,
        sourceExtractionId: input.linkage?.cvExtractionId, sourceCvRevisionId: input.linkage?.cvRevisionId,
        matchProfileSnapshotId: input.linkage?.matchProfileSnapshotId,
        generationProfileSnapshotId: input.generationProfileSnapshotId,
        jobRevisionId: input.linkage?.jobRevisionId,
        requirementLedgerVersion: input.linkage?.requirementLedgerVersion,
        analysisVersion: input.linkage?.analysisVersion,
        targetContextJson: input.targetContext === undefined ? undefined : json(input.targetContext),
        currentSnapshotVersion: 1,
        currentReconciliationVersion: reconciliation ? 1 : 0,
        status: reconciliation ? 'EVIDENCE_REVIEW' : 'DRAFT',
      },
    });
    await tx.cvGenerationEvidenceSnapshot.create({
      data: {
        generationId: generation.id, version: 1, reason: 'INITIAL', snapshotJson: json(evidence),
        schemaVersion: evidence.schemaVersion, contentHash: hash(serialized),
      },
    });
    if (reconciliation) {
      const serializedReconciliation = JSON.stringify(reconciliation);
      await tx.cvRequirementReconciliation.create({ data: {
        generationId: generation.id, version: 1, snapshotVersion: 1,
        reconciliationJson: json(reconciliation), schemaVersion: reconciliation.schemaVersion,
        contentHash: hash(serializedReconciliation),
      } });
    }
    return generation;
  });
}

export async function appendEvidenceSnapshot(args: {
  userId: string;
  generationId: string;
  evidence: UnifiedCandidateEvidence;
  reason: 'PROFILE_REFRESH' | 'HITL_REUSABLE' | 'HITL_APPLICATION_ONLY';
}) {
  const evidence = UnifiedCandidateEvidenceSchema.parse(args.evidence);
  const serialized = JSON.stringify(evidence);
  return prisma.$transaction(async (tx) => {
    const owned = await tx.cvGeneration.findFirst({ where: { id: args.generationId, userId: args.userId }, select: { id: true } });
    if (!owned) throw new Error('CV generation not found.');
    const generation = await tx.cvGeneration.update({
      where: { id: owned.id }, data: { currentSnapshotVersion: { increment: 1 } }, select: { currentSnapshotVersion: true },
    });
    return tx.cvGenerationEvidenceSnapshot.create({
      data: {
        generationId: owned.id, version: generation.currentSnapshotVersion, reason: args.reason,
        snapshotJson: json(evidence), schemaVersion: evidence.schemaVersion, contentHash: hash(serialized),
      },
    });
  });
}

export async function loadCurrentEvidenceSnapshot(userId: string, generationId: string): Promise<UnifiedCandidateEvidence | null> {
  const generation = await prisma.cvGeneration.findFirst({
    where: { id: generationId, userId },
    include: { evidenceSnapshots: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!generation?.evidenceSnapshots[0]) return null;
  return UnifiedCandidateEvidenceSchema.parse(generation.evidenceSnapshots[0].snapshotJson);
}
