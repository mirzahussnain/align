import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { ApprovedCvPlanSchema, ProposedCvPlanSchema, RequirementReconciliationSnapshotSchema, UnifiedCandidateEvidenceSchema } from './schemas';
import { proposeCvPlan } from './planner';
import type { ApprovedCvPlan, CvPlanSection, ProposedCvPlan } from './types';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function proposeGenerationPlan(userId: string, generationId: string): Promise<ProposedCvPlan> {
  const generation = await prisma.cvGeneration.findFirst({
    where: { id: generationId, userId },
    include: {
      evidenceSnapshots: { orderBy: { version: 'desc' }, take: 1 },
      reconciliations: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
  if (!generation?.evidenceSnapshots[0] || !generation.reconciliations[0]) throw new Error('Complete source reconciliation before planning.');
  const approvedRevision = await prisma.cvPlanRevision.findFirst({ where: { generationId: generation.id, kind: 'APPROVED' }, select: { id: true } });
  if (approvedRevision) throw new Error('The approved CV plan is immutable. Start a new generation to make changes.');
  const evidence = UnifiedCandidateEvidenceSchema.parse(generation.evidenceSnapshots[0].snapshotJson);
  const reconciliation = RequirementReconciliationSnapshotSchema.parse(generation.reconciliations[0].reconciliationJson);
  const context = (generation.targetContextJson ?? {}) as { seniority?: string; careerChanger?: boolean; regulated?: boolean; academic?: boolean };
  const plan = ProposedCvPlanSchema.parse(proposeCvPlan({ evidence, reconciliation, sourceMode: generation.sourceMode, atsStrategy: generation.atsStrategy, target: context }));
  const serialized = JSON.stringify(plan);
  await prisma.$transaction(async (tx) => {
    await tx.cvGeneration.update({ where: { id: generation.id }, data: { status: 'PLAN_PROPOSED' } });
    const latest = await tx.cvPlanRevision.findFirst({ where: { generationId: generation.id }, orderBy: { version: 'desc' }, select: { version: true } });
    await tx.cvPlanRevision.create({ data: { generationId: generation.id, version: (latest?.version ?? 0) + 1, kind: 'PROPOSED', planJson: json(plan), schemaVersion: plan.schemaVersion, contentHash: hash(serialized) } });
  });
  return plan;
}

export async function approveGenerationPlan(args: { userId: string; generationId: string; excludedOptionalEvidenceIds?: string[]; sectionOrder: CvPlanSection[]; template: string }): Promise<ApprovedCvPlan> {
  const generation = await prisma.cvGeneration.findFirst({
    where: { id: args.generationId, userId: args.userId },
    include: { planRevisions: { where: { kind: 'PROPOSED' }, orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!generation?.planRevisions[0]) throw new Error('Proposed CV plan not found.');
  const existingApproval = await prisma.cvPlanRevision.findFirst({ where: { generationId: generation.id, kind: 'APPROVED' }, select: { id: true } });
  if (existingApproval) throw new Error('The CV plan has already been approved and cannot be changed.');
  const proposed = ProposedCvPlanSchema.parse(generation.planRevisions[0].planJson);
  const proposedSections = new Set(proposed.sectionOrder);
  const requestedSections = new Set(args.sectionOrder);
  if (args.sectionOrder.length !== proposed.sectionOrder.length || requestedSections.size !== proposedSections.size || args.sectionOrder.some((section) => !proposedSections.has(section))) {
    throw new Error('Section order must contain every included section exactly once.');
  }
  const excluded = new Set(args.excludedOptionalEvidenceIds ?? []);
  const optional = new Set(proposed.optionalEvidenceIds);
  for (const id of excluded) if (!optional.has(id)) throw new Error('Only optional evidence can be removed during plan review.');
  const approved = ApprovedCvPlanSchema.parse({
    ...proposed,
    sectionOrder: args.sectionOrder,
    optionalEvidenceIds: proposed.optionalEvidenceIds.filter((id) => !excluded.has(id)),
    omittedEvidence: [...proposed.omittedEvidence, ...[...excluded].map((evidenceId) => ({ evidenceId, reasonCode: 'USER_EXCLUDED' as const, rationale: 'Removed by the candidate during plan review.' }))],
    approvedAt: new Date().toISOString(),
  });
  const serialized = JSON.stringify(approved);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.cvGeneration.updateMany({ where: { id: generation.id, status: 'PLAN_PROPOSED' }, data: { status: 'PLAN_APPROVED', template: args.template } });
    if (claimed.count !== 1) throw new Error('The CV plan has already been approved and cannot be changed.');
    const latest = await tx.cvPlanRevision.findFirst({ where: { generationId: generation.id }, orderBy: { version: 'desc' }, select: { version: true } });
    await tx.cvPlanRevision.create({ data: { generationId: generation.id, version: (latest?.version ?? 0) + 1, kind: 'APPROVED', planJson: json(approved), schemaVersion: approved.schemaVersion, contentHash: hash(serialized) } });
  });
  return approved;
}
