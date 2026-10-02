import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { generateJSONFromAIWithProvenance } from '@/shared/services/ai-orchestrator';
import { reserveCapability, commitCapability, createResultForReservation, releaseCapability, reservationFingerprint } from '@/shared/services/capability-reservation';
import { markOperationRunning, reservationIsRunning, OperationConflictError, OperationInProgressError } from '@/shared/services/ai-failure';
import { EntitlementRequiredError } from '@/shared/entitlements/server';
import { TemplateIdSchema, type TemplateId } from '@/shared/constants/templates';
import { ApprovedCvPlanSchema, UnifiedCandidateEvidenceSchema } from './schemas';
import { CV_REWRITE_PATCH_CONTRACT } from './rewrite-contract';
import { serializeApprovedEvidenceForRewrite } from './rewrite-serializer';
import { validateRewritePatches } from './rewrite-validator';
import { assembleCvBuildSpec, validateBuildSpecPreservation, type CvBuildSpecV2 } from './build-spec';
import { generateV2Template } from '@/shared/templates/v2';
import { DOCX_CONTENT_TYPE } from '@/shared/services/cv-generation';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class CvGenerationValidationError extends Error {
  constructor(public readonly reasons: string[]) { super('The generated draft could not be verified against approved evidence.'); }
}

async function recover(userId: string, generatedCvId: string) {
  const row = await prisma.generatedCV.findFirst({ where: { id: generatedCvId, userId }, select: { id: true, fileKey: true } });
  if (!row?.fileKey) throw new Error('The committed CV file is unavailable.');
  return { generatedCvId: row.id, bytes: await storage.download('rewrites', row.fileKey), recovered: true };
}

async function persistRow(args: { userId: string; generation: Awaited<ReturnType<typeof loadApprovedGeneration>>; spec: CvBuildSpecV2; bytes: Buffer; provider?: unknown; reservationHeld: boolean }) {
  const fileKey = `users/${args.userId}/${args.generation.id}/CV.docx`;
  await storage.upload({ bucket: 'rewrites', key: fileKey, body: args.bytes, contentType: DOCX_CONTENT_TYPE });
  const create = async (tx: Prisma.TransactionClient) => {
    const count = args.generation.jobMatchId
      ? await tx.generatedCV.count({ where: { userId: args.userId, jobMatchId: args.generation.jobMatchId } }) : 0;
    const row = await tx.generatedCV.create({ data: {
      userId: args.userId, cvGenerationId: args.generation.id, jobMatchId: args.generation.jobMatchId,
      sourceCvRevisionId: args.generation.sourceCvRevisionId, profileSnapshotId: args.generation.generationProfileSnapshotId ?? args.generation.matchProfileSnapshotId,
      jobRevisionId: args.generation.jobRevisionId, profileId: args.generation.profileId,
      template: args.generation.template!, title: args.spec.identity.headline?.slice(0, 160) || args.spec.identity.fullName.slice(0, 160) || null,
      data: json(args.spec), provenance: json({ cvGenerationId: args.generation.id, buildSpecVersion: args.spec.version, provider: args.provider ?? null }),
      fileKey, fileSize: args.bytes.byteLength, versionNumber: count + 1,
    } });
    await tx.cvGeneration.update({ where: { id: args.generation.id }, data: { status: 'COMPLETED' } });
    return row;
  };
  if (!args.reservationHeld) return (await prisma.$transaction(create)).id;
  const created = await createResultForReservation({ userId: args.userId, capability: 'cv_regeneration', operationId: args.generation.operationId, creator: async (tx) => {
    const row = await create(tx); return { resultRef: row.id, value: row.id };
  } });
  if (created.status === 'created') return created.value;
  if (created.status === 'already_created') return created.resultRef;
  throw new Error('The generation reservation expired before persistence.');
}

async function loadApprovedGeneration(userId: string, generationId: string) {
  const generation = await prisma.cvGeneration.findFirst({ where: { id: generationId, userId }, include: {
    evidenceSnapshots: { orderBy: { version: 'desc' }, take: 1 },
    planRevisions: { where: { kind: 'APPROVED' }, orderBy: { version: 'desc' }, take: 1 },
    generatedCv: { select: { id: true, fileKey: true } },
  } });
  if (!generation?.evidenceSnapshots[0] || !generation.planRevisions[0]) throw new Error('Approve the CV plan before generation.');
  if (!generation.template) throw new Error('The approved plan has no template.');
  return generation;
}

export async function generateApprovedCv(userId: string, generationId: string) {
  const generation = await loadApprovedGeneration(userId, generationId);
  const evidence = UnifiedCandidateEvidenceSchema.parse(generation.evidenceSnapshots[0].snapshotJson);
  const plan = ApprovedCvPlanSchema.parse(generation.planRevisions[0].planJson);
  const template = TemplateIdSchema.parse(generation.template) as TemplateId;
  const deterministicOnly = plan.sourceMode === 'CAREER_PROFILE' && plan.targetStrategy === 'PROFILE_ONLY';
  if (generation.generatedCv) {
    if (!deterministicOnly) {
      const finalised = await commitCapability({ userId, capability: 'cv_regeneration', operationId: generation.operationId, resultRef: generation.generatedCv.id });
      if (finalised.status !== 'committed') throw new Error('The existing generated CV could not be finalised.');
    }
    return recover(userId, generation.generatedCv.id);
  }
  const fingerprint = reservationFingerprint(['cv-generation-v2', userId, generation.id, generation.planRevisions[0].contentHash, generation.evidenceSnapshots[0].contentHash, template]);
  let reservationHeld = false;
  let persisted = false;
  let provider: unknown;
  let patches = new Map<string, string>();
  await prisma.cvGeneration.update({ where: { id: generation.id }, data: { status: 'GENERATING', failureCode: null } });
  try {
    if (!deterministicOnly) {
      const reserve = await reserveCapability({ userId, capability: 'cv_regeneration', operationId: generation.operationId, fingerprint });
      if (reserve.status === 'conflict') throw new OperationConflictError('cv_regeneration', generation.operationId);
      if (reserve.status === 'exhausted') throw new EntitlementRequiredError(reserve.decision);
      if (reserve.status === 'recovered') return recover(userId, reserve.reservation.resultRef ?? '');
      if (reserve.status === 'reserved') {
        if (reservationIsRunning(reserve.reservation)) throw new OperationInProgressError('cv_regeneration', generation.operationId);
        reservationHeld = true;
        await markOperationRunning(userId, 'cv_regeneration', generation.operationId);
      }
      const result = await generateJSONFromAIWithProvenance({
        capability: 'cv_regeneration', userId, operationId: generation.operationId, temperature: 0.1, thinkingBudget: 0,
        structuredOutput: CV_REWRITE_PATCH_CONTRACT,
        prompt: [
          'Rewrite only the approved evidence below for the stated target. Return only the strict patch schema. Each patch must target one approved evidenceId and include that same id in sourceEvidenceIds. Never invent, infer, merge, remove, or upgrade a fact. Preserve every metric, date, employer, qualification, credential and eligibility fact exactly. Omit a patch when wording should remain unchanged.',
          `TARGET CONTEXT:\n${JSON.stringify(generation.targetContextJson ?? {})}`,
          `APPROVED INPUT:\n${serializeApprovedEvidenceForRewrite(evidence, plan)}`,
        ].join('\n\n'),
      });
      if (!result) throw new Error('No rewrite provider was available.');
      provider = result.provenance;
      const validated = validateRewritePatches(result.data, evidence, plan);
      if (!validated.ok) throw new CvGenerationValidationError(validated.reasons);
      patches = validated.patches;
    }
    const spec = assembleCvBuildSpec({ generationId: generation.id, evidence, plan, templateId: template, patches });
    const missing = validateBuildSpecPreservation(spec, evidence);
    if (missing.length) throw new CvGenerationValidationError(missing.map((id) => `Approved required evidence was not assembled: ${id}.`));
    const bytes = await generateV2Template(spec);
    const generatedCvId = await persistRow({ userId, generation, spec, bytes, provider, reservationHeld });
    persisted = true;
    if (reservationHeld) {
      const committed = await commitCapability({ userId, capability: 'cv_regeneration', operationId: generation.operationId, resultRef: generatedCvId });
      if (committed.status !== 'committed') throw new Error('The generation could not be finalised.');
      reservationHeld = false;
    }
    return { generatedCvId, bytes, recovered: false };
  } catch (error) {
    if (reservationHeld && !persisted) await releaseCapability({ userId, capability: 'cv_regeneration', operationId: generation.operationId, reason: error instanceof CvGenerationValidationError ? 'truthfulness_failure' : 'generation_failure' });
    await prisma.cvGeneration.updateMany({ where: { id: generation.id, userId, status: { not: 'COMPLETED' } }, data: { status: 'GENERATION_FAILED', failureCode: createHash('sha256').update(error instanceof Error ? error.name : 'unknown').digest('hex').slice(0, 12) } });
    throw error;
  }
}
