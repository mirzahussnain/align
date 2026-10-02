import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { EvidenceCaptureInputSchema, RequirementLedgerSnapshotSchema, RequirementReconciliationSnapshotSchema, UnifiedCandidateEvidenceSchema } from './schemas';
import { materializeCapturedEvidence } from './evidence-capture';
import { persistReusableProfileEvidence, assertOwnedEvidenceEntity } from './profile-persistence';
import { persistApplicationOnlyEvidence } from './application-evidence';
import { reconcileRequirements, unresolvedRequirements } from './reconcile';
import { clusterMaterialGaps } from './gap-clustering';
import { suggestRelatedRequirements } from './evidence-capture';
import type { EvidenceCaptureInput, GenerationRequirement, RequirementReconciliationSnapshot, UnifiedCandidateEvidence } from './types';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function requirementsFor(generation: { jobMatch: { requirementLedgerJson: Prisma.JsonValue | null } | null; targetContextJson: Prisma.JsonValue | null }): GenerationRequirement[] {
  if (generation.jobMatch?.requirementLedgerJson) return RequirementLedgerSnapshotSchema.parse(generation.jobMatch.requirementLedgerJson).requirements;
  const target = generation.targetContextJson as { requirements?: unknown } | null;
  if (!target?.requirements) return [];
  return RequirementLedgerSnapshotSchema.parse({ schemaVersion: 1, analysisVersion: 'profile-target@1', requirements: target.requirements }).requirements;
}

function priorConfirmedMissing(snapshot: RequirementReconciliationSnapshot | null) {
  return new Set(snapshot?.items.filter((item) => item.status === 'CONFIRMED_MISSING').map((item) => item.requirementId) ?? []);
}

async function loadGenerationForEvidence(userId: string, generationId: string) {
  const generation = await prisma.cvGeneration.findFirst({
    where: { id: generationId, userId },
    include: {
      jobMatch: { select: { requirementLedgerJson: true } },
      evidenceSnapshots: { orderBy: { version: 'desc' }, take: 1 },
      reconciliations: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
  if (!generation?.evidenceSnapshots[0]) throw new Error('CV generation evidence snapshot not found.');
  return generation;
}

export async function saveAndReconcileEvidenceCapture(args: {
  userId: string;
  generationId: string;
  input: EvidenceCaptureInput;
}) {
  const capture = EvidenceCaptureInputSchema.parse(args.input) as EvidenceCaptureInput;
  const generation = await loadGenerationForEvidence(args.userId, args.generationId);
  const previousEvidence = UnifiedCandidateEvidenceSchema.parse(generation.evidenceSnapshots[0].snapshotJson);
  const previousReconciliation = generation.reconciliations[0]
    ? RequirementReconciliationSnapshotSchema.parse(generation.reconciliations[0].reconciliationJson)
    : null;
  const requirements = requirementsFor(generation);

  return prisma.$transaction(async (tx) => {
    let canonicalCapture = capture;
    if (capture.persistenceScope === 'CAREER_PROFILE_AND_APPLICATION') {
      if (!generation.profileId) throw new Error('Reusable evidence requires a Career Profile.');
      const entityId = await persistReusableProfileEvidence(tx, generation.profileId, generation.id, capture);
      canonicalCapture = { ...capture, entity: { mode: 'EXISTING', entityId, label: capture.entity.mode === 'EXISTING' ? capture.entity.label : String(capture.entity.data.name ?? capture.entity.data.projectName ?? capture.entity.data.title ?? capture.entity.data.company ?? capture.entity.data.institution ?? capture.entity.data.course ?? capture.entity.data.organisation ?? 'Added evidence') } };
    } else {
      if (capture.entity.mode === 'EXISTING') {
        if (!generation.profileId) throw new Error('Existing profile evidence requires a Career Profile.');
        await assertOwnedEvidenceEntity(tx, generation.profileId, capture.entityKind, capture.entity.entityId);
      }
      await persistApplicationOnlyEvidence(tx, generation.id, capture);
    }

    const evidence = materializeCapturedEvidence(previousEvidence, generation.id, canonicalCapture);
    const reconciliation = reconcileRequirements(requirements, evidence, priorConfirmedMissing(previousReconciliation));
    const updated = await tx.cvGeneration.update({
      where: { id: generation.id },
      data: { status: 'EVIDENCE_REVIEW', currentSnapshotVersion: { increment: 1 }, currentReconciliationVersion: { increment: 1 } },
      select: { currentSnapshotVersion: true, currentReconciliationVersion: true },
    });
    const evidenceText = JSON.stringify(evidence);
    const reconciliationText = JSON.stringify(reconciliation);
    await tx.cvGenerationEvidenceSnapshot.create({ data: {
      generationId: generation.id, version: updated.currentSnapshotVersion,
      reason: capture.persistenceScope === 'APPLICATION_ONLY' ? 'HITL_APPLICATION_ONLY' : 'HITL_REUSABLE',
      snapshotJson: json(evidence), schemaVersion: evidence.schemaVersion, contentHash: hash(evidenceText),
    } });
    await tx.cvRequirementReconciliation.create({ data: {
      generationId: generation.id, version: updated.currentReconciliationVersion,
      snapshotVersion: updated.currentSnapshotVersion, reconciliationJson: json(reconciliation),
      schemaVersion: reconciliation.schemaVersion, contentHash: hash(reconciliationText),
    } });
    const previousSupported = new Set(previousReconciliation?.items.filter((item) => item.status === 'SUPPORTED').map((item) => item.requirementId) ?? []);
    return {
      evidence,
      reconciliation,
      resolvedRequirementIds: reconciliation.items.filter((item) => item.status === 'SUPPORTED' && !previousSupported.has(item.requirementId)).map((item) => item.requirementId),
      remaining: unresolvedRequirements(reconciliation).length,
      gaps: clusterMaterialGaps(requirements, reconciliation),
    };
  });
}

export async function suggestGenerationRelatedGaps(args: { userId: string; generationId: string; text: string; excludeRequirementIds?: string[] }) {
  const generation = await loadGenerationForEvidence(args.userId, args.generationId);
  const reconciliation = generation.reconciliations[0]
    ? RequirementReconciliationSnapshotSchema.parse(generation.reconciliations[0].reconciliationJson)
    : null;
  const unresolved = new Set(reconciliation?.items.filter((item) => item.status === 'MISSING' || item.status === 'PARTIAL' || item.status === 'CONFLICTED').map((item) => item.requirementId) ?? []);
  const candidates = requirementsFor(generation).filter((requirement) => unresolved.has(requirement.id));
  return suggestRelatedRequirements(args.text, candidates, new Set(args.excludeRequirementIds ?? []));
}

export async function confirmRequirementsMissing(args: { userId: string; generationId: string; requirementIds: string[] }) {
  const generation = await loadGenerationForEvidence(args.userId, args.generationId);
  const evidence = UnifiedCandidateEvidenceSchema.parse(generation.evidenceSnapshots[0].snapshotJson);
  const previous = generation.reconciliations[0]
    ? RequirementReconciliationSnapshotSchema.parse(generation.reconciliations[0].reconciliationJson)
    : null;
  const confirmed = priorConfirmedMissing(previous);
  args.requirementIds.forEach((id) => confirmed.add(id));
  const reconciliation = reconcileRequirements(requirementsFor(generation), evidence, confirmed);
  const serialized = JSON.stringify(reconciliation);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.cvGeneration.update({ where: { id: generation.id }, data: { status: 'EVIDENCE_REVIEW', currentReconciliationVersion: { increment: 1 } }, select: { currentReconciliationVersion: true, currentSnapshotVersion: true } });
    await tx.cvRequirementReconciliation.create({ data: { generationId: generation.id, version: updated.currentReconciliationVersion, snapshotVersion: updated.currentSnapshotVersion, reconciliationJson: json(reconciliation), schemaVersion: 1, contentHash: hash(serialized) } });
    return reconciliation;
  });
}
