import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { AiOrchestrationError, executeAiTask } from '@/shared/services/ai-orchestrator';
import {
  reserveCapability, commitCapability, createResultForReservation,
  releaseCapability, reservationFingerprint,
} from '@/shared/services/capability-reservation';
import {
  AiOperationError, markOperationRunning, reservationIsRunning,
  OperationConflictError, OperationInProgressError,
} from '@/shared/services/ai-failure';
import { EntitlementRequiredError } from '@/shared/entitlements/server';
import { TemplateIdSchema, type TemplateId } from '@/shared/constants/templates';
import { DOCX_CONTENT_TYPE } from '@/shared/services/cv-generation';
import {
  canPublishGeneration, checkpointAiResult, claimGeneration,
  renewGenerationLease,
} from './generation-lease';
import { ApprovedCvPlanSchema, UnifiedCandidateEvidenceSchema } from './schemas';
import { serializeApprovedEvidenceForRewrite } from './rewrite-serializer';
import { createCvRewriteCandidateContract } from './rewrite-candidate';
import { assembleCvBuildSpec, validateBuildSpec, type CvBuildSpecV2 } from './build-spec';
import {
  renderValidatedDocument,
  DOCUMENT_RENDER_CONTRACT_VERSION,
} from '@/shared/document-preview/validated-document';
import {
  createRendererRetryBudget,
  DocumentConversionError,
  RendererUnavailableError,
} from '@/shared/document-preview/renderer-client';
import { PageValidationError } from '@/shared/document-preview/pdf-preview';
import {
  PreviewArtifactStorageError,
  storeValidatedArtifacts,
  storeValidatedPdf,
} from '@/shared/document-preview/preview-storage';

const GENERATION_DEADLINE_MS = 260_000;
const LEASE_HEARTBEAT_MS = 30_000;
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class CvGenerationValidationError extends Error {
  constructor(public readonly reasons: string[]) {
    super('The generated draft could not be verified against approved evidence.');
  }
}

export type GenerationPageValidationCode =
  | 'RENDERER_UNAVAILABLE'
  | 'DOCUMENT_CONVERSION_FAILED'
  | 'PAGE_VALIDATION_UNAVAILABLE'
  | 'PAGE_LIMIT_EXCEEDED';

const generationMessages: Record<GenerationPageValidationCode, string> = {
  RENDERER_UNAVAILABLE: 'Document rendering is temporarily unavailable.',
  DOCUMENT_CONVERSION_FAILED: 'The CV could not be converted to a verified PDF.',
  PAGE_VALIDATION_UNAVAILABLE: 'The rendered CV page count could not be verified.',
  PAGE_LIMIT_EXCEEDED: 'The approved CV content does not fit within two readable pages.',
};

export class GenerationPageValidationError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: GenerationPageValidationCode) {
    super(generationMessages[code]);
    this.name = 'GenerationPageValidationError';
    this.retryable = code !== 'PAGE_LIMIT_EXCEEDED';
  }
}

class GenerationLeaseLostError extends Error {
  constructor() {
    super('The generation lease was superseded by another request.');
    this.name = 'GenerationLeaseLostError';
  }
}

interface AiCheckpoint {
  spec: CvBuildSpecV2;
  provider?: unknown;
}

function checkpointValue(value: unknown): AiCheckpoint | null {
  if (!value || typeof value !== 'object' || !('spec' in value)) return null;
  return value as AiCheckpoint;
}

function projectDocumentFailure(error: unknown): GenerationPageValidationError | null {
  if (error instanceof GenerationPageValidationError) return error;
  if (error instanceof RendererUnavailableError) {
    return new GenerationPageValidationError('RENDERER_UNAVAILABLE');
  }
  if (error instanceof DocumentConversionError) {
    return new GenerationPageValidationError('DOCUMENT_CONVERSION_FAILED');
  }
  if (error instanceof PageValidationError) {
    return new GenerationPageValidationError(error.code);
  }
  return null;
}

async function recover(userId: string, generatedCvId: string) {
  const row = await prisma.generatedCV.findFirst({
    where: { id: generatedCvId, userId },
    select: { id: true, fileKey: true },
  });
  if (!row?.fileKey) throw new Error('The committed CV file is unavailable.');
  return {
    generatedCvId: row.id,
    bytes: await storage.download('rewrites', row.fileKey),
    recovered: true,
  };
}

async function loadApprovedGeneration(userId: string, generationId: string) {
  const generation = await prisma.cvGeneration.findFirst({
    where: { id: generationId, userId },
    include: {
      evidenceSnapshots: { orderBy: { version: 'desc' }, take: 1 },
      planRevisions: { where: { kind: 'APPROVED' }, orderBy: { version: 'desc' }, take: 1 },
      generatedCv: { select: { id: true, fileKey: true } },
    },
  });
  if (!generation?.evidenceSnapshots[0] || !generation.planRevisions[0]) {
    throw new Error('Approve the CV plan before generation.');
  }
  if (!generation.template) throw new Error('The approved plan has no template.');
  return generation;
}

async function startLeaseHeartbeat(input: {
  userId: string;
  generationId: string;
  token: string;
  controller: AbortController;
}) {
  let renewing = false;
  const timer = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void renewGenerationLease({
      userId: input.userId,
      generationId: input.generationId,
      token: input.token,
      now: new Date(),
    }).then((renewed) => {
      if (!renewed) input.controller.abort(new GenerationLeaseLostError());
    }).catch(() => {
      input.controller.abort(new GenerationLeaseLostError());
    }).finally(() => {
      renewing = false;
    });
  }, LEASE_HEARTBEAT_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

export async function generateApprovedCv(userId: string, generationId: string) {
  const generation = await loadApprovedGeneration(userId, generationId);
  const evidence = UnifiedCandidateEvidenceSchema.parse(generation.evidenceSnapshots[0].snapshotJson);
  const plan = ApprovedCvPlanSchema.parse(generation.planRevisions[0].planJson);
  const template = TemplateIdSchema.parse(generation.template) as TemplateId;
  const deterministicOnly = plan.sourceMode === 'CAREER_PROFILE' && plan.targetStrategy === 'PROFILE_ONLY';
  if (generation.generatedCv) {
    if (!deterministicOnly) {
      const finalised = await commitCapability({
        userId, capability: 'cv_regeneration', operationId: generation.operationId,
        resultRef: generation.generatedCv.id,
      });
      if (finalised.status !== 'committed') throw new Error('The existing generated CV could not be finalised.');
    }
    return recover(userId, generation.generatedCv.id);
  }

  const now = new Date();
  const claim = await claimGeneration({ userId, generationId, now });
  if (claim.status === 'in_progress') {
    throw new OperationInProgressError('cv_regeneration', generation.operationId);
  }
  if (claim.status === 'completed') return recover(userId, generationId);
  if (claim.status !== 'claimed') throw new Error('The approved generation could not be claimed.');

  const token = claim.token;
  const deadlineAt = Date.now() + GENERATION_DEADLINE_MS;
  const controller = new AbortController();
  const stopHeartbeat = await startLeaseHeartbeat({ userId, generationId, token, controller });
  const authorityContext = {
    currentProfileSnapshotId: generation.generationProfileSnapshotId ?? undefined,
    matchProfileSnapshotId: generation.matchProfileSnapshotId ?? undefined,
  };
  const fingerprint = reservationFingerprint([
    'cv-generation-v2', userId, generation.id,
    generation.planRevisions[0].contentHash,
    generation.evidenceSnapshots[0].contentHash,
    template,
  ]);
  let reservationHeld = false;
  let persisted = false;

  try {
    let checkpoint = checkpointValue(claim.checkpoint);
    let spec: CvBuildSpecV2;
    let provider: unknown;

    if (!deterministicOnly) {
      const reserve = await reserveCapability({
        userId, capability: 'cv_regeneration', operationId: generation.operationId, fingerprint,
      });
      if (reserve.status === 'conflict') throw new OperationConflictError('cv_regeneration', generation.operationId);
      if (reserve.status === 'exhausted') throw new EntitlementRequiredError(reserve.decision);
      if (reserve.status === 'recovered') return recover(userId, reserve.reservation.resultRef ?? '');
      if (reserve.status === 'reserved') {
        if (!checkpoint && reservationIsRunning(reserve.reservation)) {
          throw new OperationInProgressError('cv_regeneration', generation.operationId);
        }
        reservationHeld = true;
        await markOperationRunning(userId, 'cv_regeneration', generation.operationId);
      }

      if (checkpoint) {
        spec = checkpoint.spec;
        provider = checkpoint.provider;
        const validation = validateBuildSpec(spec, evidence, plan);
        if (!validation.ok) {
          throw new CvGenerationValidationError(
            [...validation.truth, ...validation.provenance, ...validation.preservation]
              .map((issue) => `${issue.code}:${issue.evidenceId}`),
          );
        }
      } else {
        const result = await executeAiTask({
          task: 'cv_regeneration', userId, operationId: generation.operationId,
          temperature: 0.1, thinkingBudget: 0,
          structuredOutput: createCvRewriteCandidateContract({
            generationId: generation.id, evidence, plan, templateId: template, authorityContext,
          }),
          prompt: [
            'Rewrite only the approved evidence below for the stated target. Return only the strict patch schema. Each patch must target one approved evidenceId and include that same id in sourceEvidenceIds. Never invent, infer, merge, remove, or upgrade a fact. Preserve every metric, date, employer, qualification, credential and eligibility fact exactly. Omit a patch when wording should remain unchanged.',
            `TARGET CONTEXT:\n${JSON.stringify(generation.targetContextJson ?? {})}`,
            `APPROVED INPUT:\n${serializeApprovedEvidenceForRewrite(evidence, plan)}`,
          ].join('\n\n'),
        });
        if (!result) throw new Error('No rewrite provider was available.');
        spec = result.data.spec;
        const rewriteDiagnostics = {
          patchCount: result.data.patchCount,
          rejected: result.data.rejected,
          summaryValidation: result.data.summaryValidation,
          finalValidation: result.data.finalValidation,
        };
        provider = { ...result.provenance, rewriteDiagnostics };
        checkpoint = { spec, provider };
        const saved = await checkpointAiResult({
          userId, generationId, token, checkpoint: json(checkpoint),
        });
        if (!saved) throw new GenerationLeaseLostError();
      }
    } else {
      spec = assembleCvBuildSpec({
        generationId: generation.id, evidence, plan, templateId: template, authorityContext,
      });
      const validation = validateBuildSpec(spec, evidence, plan);
      if (!validation.ok) {
        throw new CvGenerationValidationError(
          [...validation.truth, ...validation.provenance, ...validation.preservation]
            .map((issue) => `${issue.code}:${issue.evidenceId}`),
        );
      }
    }

    const retryBudget = createRendererRetryBudget(1);
    const validated = await renderValidatedDocument({
      spec,
      traceId: generation.id.replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 64),
      signal: controller.signal,
      retryBudget,
      deadlineAt,
    });
    const generatedCvId = generation.id;
    const fileKey = `users/${userId}/${generation.id}/CV.docx`;
    await storage.upload({
      bucket: 'rewrites', key: fileKey, body: validated.docx, contentType: DOCX_CONTENT_TYPE,
    });

    let previewStatus: 'READY' | 'FAILED';
    let previewFailureCode: 'THUMBNAIL_RENDER_FAILED' | 'PREVIEW_STORAGE_FAILED' | null;
    let pdfKey: string;
    let pdfSize: number;
    let pageImageKeys: string[] = [];
    let pageImageSizes: number[] = [];
    if (validated.preview.status === 'READY') {
      try {
        const artifacts = await storeValidatedArtifacts({
          userId, generatedCvId, documentHash: validated.documentHash,
          pdf: validated.pdf, pages: validated.preview.pages,
        });
        previewStatus = 'READY';
        previewFailureCode = null;
        pdfKey = artifacts.pdfKey;
        pdfSize = artifacts.sizes.pdf;
        pageImageKeys = artifacts.pageImageKeys;
        pageImageSizes = artifacts.sizes.pages;
      } catch (error) {
        if (!(error instanceof PreviewArtifactStorageError) || !error.pdfArtifact) {
          await storage.delete('rewrites', fileKey);
          throw error;
        }
        previewStatus = 'FAILED';
        previewFailureCode = 'PREVIEW_STORAGE_FAILED';
        pdfKey = error.pdfArtifact.key;
        pdfSize = error.pdfArtifact.size;
      }
    } else {
      let pdf: Awaited<ReturnType<typeof storeValidatedPdf>>;
      try {
        pdf = await storeValidatedPdf({
          userId, generatedCvId, documentHash: validated.documentHash,
          pageCount: validated.pageCount, pdf: validated.pdf,
        });
      } catch (error) {
        await storage.delete('rewrites', fileKey);
        throw error;
      }
      previewStatus = 'FAILED';
      previewFailureCode = 'THUMBNAIL_RENDER_FAILED';
      pdfKey = pdf.key;
      pdfSize = pdf.size;
    }

    const publish = async (tx: Prisma.TransactionClient) => {
      const fence = await tx.cvGeneration.updateMany({
        where: {
          id: generation.id, userId, status: 'GENERATING',
          generationLeaseToken: token,
          generationLeaseExpiresAt: { gt: new Date() },
        },
        data: { generationLeaseExpiresAt: new Date(Date.now() + 120_000) },
      });
      if (fence.count !== 1) throw new GenerationLeaseLostError();
      const count = generation.jobMatchId
        ? await tx.generatedCV.count({ where: { userId, jobMatchId: generation.jobMatchId } })
        : 0;
      const row = await tx.generatedCV.create({ data: {
        id: generatedCvId,
        userId,
        cvGenerationId: generation.id,
        jobMatchId: generation.jobMatchId,
        sourceCvRevisionId: generation.sourceCvRevisionId,
        profileSnapshotId: generation.generationProfileSnapshotId ?? generation.matchProfileSnapshotId,
        jobRevisionId: generation.jobRevisionId,
        profileId: generation.profileId,
        template: generation.template!,
        title: spec.identity.headline?.slice(0, 160) || spec.identity.fullName.slice(0, 160) || null,
        data: json(spec),
        provenance: json({ cvGenerationId: generation.id, buildSpecVersion: spec.version, provider: provider ?? null }),
        fileKey,
        fileSize: validated.docx.byteLength,
        versionNumber: count + 1,
      } });
      await tx.generatedCvPreview.create({ data: {
        generatedCvId: row.id,
        userId,
        documentHash: validated.documentHash,
        rendererVersion: DOCUMENT_RENDER_CONTRACT_VERSION,
        status: previewStatus,
        failureCode: previewFailureCode,
        pageCount: validated.pageCount,
        pdfKey,
        pageImageKeys,
        pdfSize,
        pageImageSizes,
        attemptCount: 1,
      } });
      await tx.cvGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'COMPLETED', failureCode: null,
          generationLeaseToken: null, generationLeaseExpiresAt: null,
          validatedAiCheckpoint: Prisma.DbNull,
        },
      });
      return row.id;
    };

    let publishedId: string;
    if (reservationHeld) {
      const created = await createResultForReservation({
        userId, capability: 'cv_regeneration', operationId: generation.operationId,
        creator: async (tx) => {
          const id = await publish(tx);
          return { resultRef: id, value: id };
        },
      });
      if (created.status === 'created') publishedId = created.value;
      else if (created.status === 'already_created') publishedId = created.resultRef;
      else throw new Error('The generation reservation expired before persistence.');
    } else {
      publishedId = await prisma.$transaction(publish);
    }
    persisted = true;

    if (reservationHeld) {
      const committed = await commitCapability({
        userId, capability: 'cv_regeneration', operationId: generation.operationId,
        resultRef: publishedId,
      });
      if (committed.status !== 'committed') throw new Error('The generation could not be finalised.');
      reservationHeld = false;
    }
    if (publishedId !== generatedCvId) return recover(userId, publishedId);
    return { generatedCvId: publishedId, bytes: validated.docx, recovered: false };
  } catch (error) {
    const normalized = error instanceof AiOrchestrationError &&
      error.candidateFailures.length > 0 &&
      error.candidateFailures.every((candidate) => candidate.reason === 'SCHEMA_VALIDATION_FAILED')
      ? new CvGenerationValidationError(['All provider candidates failed semantic validation.'])
      : error instanceof AiOrchestrationError
        ? new AiOperationError({
          capability: 'cv_regeneration', operationId: generation.operationId,
          reason: 'provider_unavailable',
        })
        : projectDocumentFailure(error) ?? error;
    const stillOwner = await canPublishGeneration({
      userId, generationId, token, now: new Date(),
    }).catch(() => false);
    if (reservationHeld && !persisted && stillOwner) {
      await releaseCapability({
        userId, capability: 'cv_regeneration', operationId: generation.operationId,
        reason: normalized instanceof CvGenerationValidationError
          ? 'truthfulness_failure'
          : 'generation_failure',
      });
    }
    const failureCode = normalized instanceof GenerationPageValidationError
      ? normalized.code
      : createHash('sha256')
        .update(normalized instanceof Error ? normalized.name : 'unknown')
        .digest('hex').slice(0, 12);
    await prisma.cvGeneration.updateMany({
      where: {
        id: generation.id, userId, status: { not: 'COMPLETED' },
        generationLeaseToken: token,
      },
      data: {
        status: 'GENERATION_FAILED', failureCode,
        generationLeaseToken: null, generationLeaseExpiresAt: null,
      },
    });
    throw normalized;
  } finally {
    stopHeartbeat();
  }
}
