import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { ApprovedCvPlan } from '../types';

const mocks = vi.hoisted(() => ({
  findGeneration: vi.fn(), updateGeneration: vi.fn(), updateManyGeneration: vi.fn(), findGenerated: vi.fn(),
  countGenerated: vi.fn(), createGenerated: vi.fn(), transaction: vi.fn(), upload: vi.fn(), download: vi.fn(),
  generateAi: vi.fn(), reserve: vi.fn(), commit: vi.fn(), createResult: vi.fn(), release: vi.fn(),
  markRunning: vi.fn(), reservationIsRunning: vi.fn(), render: vi.fn(),
  claimGeneration: vi.fn(), checkpointAi: vi.fn(), renewLease: vi.fn(), canPublish: vi.fn(),
  storeArtifacts: vi.fn(), storePdf: vi.fn(), createPreview: vi.fn(), storageDelete: vi.fn(),
}));

const tx = {
  generatedCV: { count: mocks.countGenerated, create: mocks.createGenerated },
  generatedCvPreview: { create: mocks.createPreview },
  cvGeneration: { update: mocks.updateGeneration, updateMany: mocks.updateManyGeneration },
};

vi.mock('@/shared/lib/prisma', () => ({ prisma: {
  cvGeneration: { findFirst: mocks.findGeneration, update: mocks.updateGeneration, updateMany: mocks.updateManyGeneration },
  generatedCV: { findFirst: mocks.findGenerated },
  $transaction: mocks.transaction,
} }));
vi.mock('@/shared/lib/storage', () => ({ storage: { upload: mocks.upload, download: mocks.download, delete: mocks.storageDelete } }));
vi.mock('@/shared/services/ai-orchestrator', () => ({
  executeAiTask: mocks.generateAi,
  AiOrchestrationError: class AiOrchestrationError extends Error {
    constructor(readonly task: string, readonly candidateFailures: Array<{ reason: string }>) {
      super('All eligible AI provider candidates were exhausted.');
    }
  },
}));
vi.mock('@/shared/services/capability-reservation', () => ({
  reserveCapability: mocks.reserve, commitCapability: mocks.commit, createResultForReservation: mocks.createResult,
  releaseCapability: mocks.release, reservationFingerprint: () => 'fingerprint',
}));
vi.mock('@/shared/services/ai-failure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/services/ai-failure')>()),
  markOperationRunning: mocks.markRunning, reservationIsRunning: mocks.reservationIsRunning,
}));
vi.mock('../generation-lease', () => ({
  claimGeneration: mocks.claimGeneration,
  checkpointAiResult: mocks.checkpointAi,
  renewGenerationLease: mocks.renewLease,
  canPublishGeneration: mocks.canPublish,
}));
vi.mock('@/shared/document-preview/validated-document', () => ({
  DOCUMENT_RENDER_CONTRACT_VERSION: 'renderer-test',
  renderValidatedDocument: mocks.render,
}));
vi.mock('@/shared/document-preview/preview-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/document-preview/preview-storage')>()),
  storeValidatedArtifacts: mocks.storeArtifacts,
  storeValidatedPdf: mocks.storePdf,
}));

import { AiOrchestrationError } from '@/shared/services/ai-orchestrator';
import { DocumentConversionError, RendererUnavailableError } from '@/shared/document-preview/renderer-client';
import { PageValidationError } from '@/shared/document-preview/pdf-preview';
import { PreviewArtifactStorageError } from '@/shared/document-preview/preview-storage';
import { assembleCvBuildSpec } from '../build-spec';
import {
  CvGenerationValidationError,
  generateApprovedCv,
} from '../generate';

const evidence = emptyCandidateEvidence();
const plan = (sourceMode: ApprovedCvPlan['sourceMode'], targetStrategy: ApprovedCvPlan['targetStrategy']): ApprovedCvPlan => ({
  schemaVersion: 1, sourceMode, atsStrategy: 'STANDARD', targetStrategy, sectionOrder: [], density: 'BALANCED',
  targetLength: 'ONE_PAGE', includedEvidenceIds: [], optionalEvidenceIds: [], omittedEvidence: [],
  professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: [], unresolvedRequirementIds: [], approvedAt: new Date(0).toISOString(),
});

function generation(sourceMode: ApprovedCvPlan['sourceMode'], targetStrategy: ApprovedCvPlan['targetStrategy'], generatedCv: { id: string; fileKey: string } | null = null) {
  return {
    id: 'generation-1', userId: 'user-1', operationId: 'operation-1', jobMatchId: sourceMode === 'JOB_MATCH' ? 'match-1' : null,
    sourceCvRevisionId: sourceMode === 'JOB_MATCH' ? 'revision-1' : null, generationProfileSnapshotId: 'profile-snapshot-1',
    matchProfileSnapshotId: 'profile-match-1', jobRevisionId: sourceMode === 'JOB_MATCH' ? 'job-revision-1' : null, profileId: 'profile-1',
    template: 'architect', targetContextJson: {}, generatedCv,
    evidenceSnapshots: [{ snapshotJson: evidence, contentHash: 'evidence-hash' }],
    planRevisions: [{ planJson: plan(sourceMode, targetStrategy), contentHash: 'plan-hash' }],
  };
}

describe('generateApprovedCv orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reservationIsRunning.mockReturnValue(false);
    mocks.claimGeneration.mockResolvedValue({ status: 'claimed', token: 'lease-1', operationId: 'operation-1', checkpoint: null });
    mocks.checkpointAi.mockResolvedValue(true);
    mocks.renewLease.mockResolvedValue(true);
    mocks.canPublish.mockResolvedValue(true);
    mocks.render.mockResolvedValue({
      docx: Buffer.from('docx'), pdf: Buffer.from('%PDF-valid'), pageCount: 1,
      profile: 'preferred', documentHash: 'a'.repeat(64),
      preview: { status: 'READY', pages: [Buffer.from('png')] },
    });
    mocks.storeArtifacts.mockResolvedValue({
      pdfKey: 'document.pdf', pageImageKeys: ['page-1.png'], sizes: { pdf: 10, pages: [3] },
    });
    mocks.storePdf.mockResolvedValue({ key: 'document.pdf', size: 10 });
    mocks.countGenerated.mockResolvedValue(0);
    mocks.createGenerated.mockResolvedValue({ id: 'generation-1' });
    mocks.createPreview.mockResolvedValue({ id: 'preview-1' });
    mocks.updateManyGeneration.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.createResult.mockImplementation(async ({ creator }: { creator: (client: typeof tx) => Promise<{ resultRef: string; value: string }> }) => ({ status: 'created', ...(await creator(tx)) }));
  });

  it('keeps profile-only generation deterministic and unmetered', async () => {
    mocks.findGeneration.mockResolvedValue(generation('CAREER_PROFILE', 'PROFILE_ONLY'));
    const result = await generateApprovedCv('user-1', 'generation-1');
    expect(result).toMatchObject({ generatedCvId: 'generation-1', recovered: false });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generateAi).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it('uses generation and match snapshot ids for deterministic structural authority', async () => {
    const row = generation('CAREER_PROFILE', 'PROFILE_ONLY');
    const authorityEvidence = emptyCandidateEvidence();
    for (const [id, degree, snapshotId] of [
      ['education-match', 'BSc Data', 'profile-match-1'],
      ['education-current', 'BSc Data Engineering', 'profile-snapshot-1'],
    ] as const) {
      authorityEvidence.evidenceById[id] = {
        id, kind: 'EDUCATION', field: 'record', canonicalText: degree, canonicalData: { degree, institution: 'Westbridge Institute' },
        provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [], sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Education', entityId: 'education-1', fieldPath: 'record', snapshotId }],
      };
      authorityEvidence.education.push({ id, sourceEntityId: 'education-1', label: degree, details: { degree, institution: 'Westbridge Institute' }, evidenceIds: [id] });
    }
    row.evidenceSnapshots[0].snapshotJson = authorityEvidence;
    row.planRevisions[0].planJson = { ...plan('CAREER_PROFILE', 'PROFILE_ONLY'), sectionOrder: ['EDUCATION'], includedEvidenceIds: ['education-match', 'education-current'] };
    mocks.findGeneration.mockResolvedValue(row);

    await generateApprovedCv('user-1', 'generation-1');
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ spec: expect.objectContaining({ sections: [expect.objectContaining({ items: [expect.objectContaining({ degree: 'BSc Data Engineering' })] })] }) }));
  });

  it('reserves immediately before the provider and releases on provider failure', async () => {
    mocks.findGeneration.mockResolvedValue(generation('JOB_MATCH', 'EXPERIENCE_FORWARD'));
    mocks.reserve.mockResolvedValue({ status: 'reserved', reservation: { status: 'RESERVED' } });
    mocks.generateAi.mockResolvedValue(null);
    await expect(generateApprovedCv('user-1', 'generation-1')).rejects.toThrow('No rewrite provider was available.');
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.generateAi.mock.invocationCallOrder[0]);
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation-1', reason: 'generation_failure' }));
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('finalises and recovers an already-persisted metered result without rerunning the provider', async () => {
    mocks.findGeneration.mockResolvedValue(generation('JOB_MATCH', 'EXPERIENCE_FORWARD', { id: 'generated-existing', fileKey: 'existing.docx' }));
    mocks.commit.mockResolvedValue({ status: 'committed' });
    mocks.findGenerated.mockResolvedValue({ id: 'generated-existing', fileKey: 'existing.docx' });
    mocks.download.mockResolvedValue(Buffer.from('existing'));
    const result = await generateApprovedCv('user-1', 'generation-1');
    expect(result).toMatchObject({ generatedCvId: 'generated-existing', recovered: true });
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generateAi).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalledWith('rewrites', 'existing.docx');
  });

  it('persists and charges once after rejecting one patch and retaining its original evidence', async () => {
    const row = generation('JOB_MATCH', 'EXPERIENCE_FORWARD');
    const candidateEvidence = emptyCandidateEvidence();
    candidateEvidence.evidenceById.metric = {
      id: 'metric', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Reduced latency by 25%',
      provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'role-1', fieldPath: 'achievements[0]' }],
    };
    candidateEvidence.evidenceById.delivery = {
      id: 'delivery', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Built reliable internal services',
      provenance: 'CAREER_PROFILE', preservationTier: 0, requirementIds: [],
      sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'Experience', entityId: 'role-1', fieldPath: 'achievements[1]' }],
    };
    candidateEvidence.employment.push({ id: 'role-1', sourceEntityId: 'role-1', label: 'Engineer', details: { title: 'Engineer', employer: 'Northwind Robotics' }, evidenceIds: ['metric', 'delivery'] });
    row.evidenceSnapshots[0].snapshotJson = candidateEvidence;
    row.planRevisions[0].planJson = {
      ...plan('JOB_MATCH', 'EXPERIENCE_FORWARD'),
      sectionOrder: ['EXPERIENCE'],
      includedEvidenceIds: ['metric', 'delivery'],
    };
    mocks.findGeneration.mockResolvedValue(row);
    mocks.reserve.mockResolvedValue({ status: 'reserved', reservation: { status: 'RESERVED' } });
    mocks.commit.mockResolvedValue({ status: 'committed' });
    mocks.generateAi.mockImplementation(async ({ structuredOutput }) => {
      const parsed = structuredOutput.runtimeSchema.safeParse({ schemaVersion: 1, patches: [
        { evidenceId: 'metric', text: 'Reduced latency by 90%', sourceEvidenceIds: ['metric'] },
        { evidenceId: 'delivery', text: 'Built dependable internal services', sourceEvidenceIds: ['delivery'] },
      ] });
      if (!parsed.success) throw parsed.error;
      return { data: parsed.data, provenance: { provider: 'groq', model: 'test', attempt: 2, fallbackUsed: true } };
    });

    await expect(generateApprovedCv('user-1', 'generation-1')).resolves.toMatchObject({ generatedCvId: 'generation-1' });
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ spec: expect.objectContaining({
      presentation: expect.objectContaining({ templateId: 'architect' }),
      sections: [expect.objectContaining({ items: [expect.objectContaining({ lines: [
        { id: 'metric', text: 'Reduced latency by 25%' },
        { id: 'delivery', text: 'Built dependable internal services' },
      ] })] })],
    }) }));
    expect(mocks.createGenerated).toHaveBeenCalledOnce();
    expect(mocks.checkpointAi.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.render.mock.invocationCallOrder[0],
    );
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.createGenerated.mock.calls[0][0].data.provenance.provider).toMatchObject({
      provider: 'groq',
      rewriteDiagnostics: {
        patchCount: { returned: 2, accepted: 1, rejected: 1 },
        rejected: [expect.objectContaining({ evidenceId: 'metric', reason: 'unsupported_metric' })],
      },
    });
  });

  it('normalizes all-provider semantic exhaustion and releases without charging', async () => {
    mocks.findGeneration.mockResolvedValue(generation('JOB_MATCH', 'EXPERIENCE_FORWARD'));
    mocks.reserve.mockResolvedValue({ status: 'reserved', reservation: { status: 'RESERVED' } });
    mocks.generateAi.mockRejectedValue(new AiOrchestrationError('cv_regeneration', [
      { reason: 'SCHEMA_VALIDATION_FAILED' },
      { reason: 'SCHEMA_VALIDATION_FAILED' },
    ] as never));

    await expect(generateApprovedCv('user-1', 'generation-1')).rejects.toBeInstanceOf(CvGenerationValidationError);
    expect(mocks.generateAi).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ reason: 'truthfulness_failure' }));
    expect(mocks.createGenerated).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('checkpoints validated AI output before rendering and reuses it on a reclaimed request', async () => {
    const row = generation('JOB_MATCH', 'EXPERIENCE_FORWARD');
    const approvedPlan = plan('JOB_MATCH', 'EXPERIENCE_FORWARD');
    const checkpointSpec = assembleCvBuildSpec({
      generationId: row.id,
      evidence,
      plan: approvedPlan,
      templateId: 'architect',
      authorityContext: {
        currentProfileSnapshotId: row.generationProfileSnapshotId,
        matchProfileSnapshotId: row.matchProfileSnapshotId,
      },
    });
    mocks.findGeneration.mockResolvedValue(row);
    mocks.claimGeneration.mockResolvedValue({
      status: 'claimed', token: 'lease-2', operationId: row.operationId,
      checkpoint: { spec: checkpointSpec, provider: { model: 'checkpointed' } },
    });
    mocks.reserve.mockResolvedValue({ status: 'reserved', reservation: { status: 'RESERVED' } });
    mocks.commit.mockResolvedValue({ status: 'committed' });

    await generateApprovedCv('user-1', row.id);

    expect(mocks.generateAi).not.toHaveBeenCalled();
    expect(mocks.checkpointAi).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ spec: checkpointSpec }));
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it.each([
    [new RendererUnavailableError(), 'RENDERER_UNAVAILABLE'],
    [new DocumentConversionError('conversion failed', true, 503), 'DOCUMENT_CONVERSION_FAILED'],
    [new PageValidationError('PAGE_VALIDATION_UNAVAILABLE'), 'PAGE_VALIDATION_UNAVAILABLE'],
    [new PageValidationError('PAGE_LIMIT_EXCEEDED', [
      { profile: 'preferred', pageCount: 3 },
      { profile: 'compact', pageCount: 3 },
      { profile: 'compact-tight', pageCount: 3 },
    ]), 'PAGE_LIMIT_EXCEEDED'],
  ] as const)('does not publish or charge after %s', async (failure, code) => {
    mocks.findGeneration.mockResolvedValue(generation('JOB_MATCH', 'EXPERIENCE_FORWARD'));
    mocks.reserve.mockResolvedValue({ status: 'reserved', reservation: { status: 'RESERVED' } });
    mocks.generateAi.mockResolvedValue({
      data: {
        spec: assembleCvBuildSpec({
          generationId: 'generation-1', evidence,
          plan: plan('JOB_MATCH', 'EXPERIENCE_FORWARD'), templateId: 'architect',
        }),
        patchCount: { returned: 0, accepted: 0, rejected: 0 },
        rejected: [], summaryValidation: [], finalValidation: { ok: true },
      },
      provenance: { provider: 'test', model: 'test' },
    });
    mocks.render.mockRejectedValue(failure);

    await expect(generateApprovedCv('user-1', 'generation-1')).rejects.toMatchObject({
      code,
    });
    expect(mocks.checkpointAi).toHaveBeenCalledOnce();
    expect(mocks.createGenerated).not.toHaveBeenCalled();
    expect(mocks.createPreview).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('publishes verified DOCX/PDF once when thumbnail rasterisation fails', async () => {
    mocks.findGeneration.mockResolvedValue(generation('CAREER_PROFILE', 'PROFILE_ONLY'));
    mocks.render.mockResolvedValue({
      docx: Buffer.from('docx'), pdf: Buffer.from('%PDF-valid'), pageCount: 2,
      profile: 'preferred', documentHash: 'a'.repeat(64),
      preview: { status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED' },
    });

    await generateApprovedCv('user-1', 'generation-1');

    expect(mocks.storePdf).toHaveBeenCalledOnce();
    expect(mocks.storeArtifacts).not.toHaveBeenCalled();
    expect(mocks.createPreview).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED', pageCount: 2,
      pageImageKeys: [],
    }) });
  });

  it('publishes the durable PDF with recoverable preview failure after page storage fails', async () => {
    mocks.findGeneration.mockResolvedValue(generation('CAREER_PROFILE', 'PROFILE_ONLY'));
    mocks.storeArtifacts.mockRejectedValue(new PreviewArtifactStorageError(
      'PREVIEW_STORAGE_FAILED', { key: 'document.pdf', size: 10 },
    ));

    await generateApprovedCv('user-1', 'generation-1');

    expect(mocks.createPreview).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'FAILED', failureCode: 'PREVIEW_STORAGE_FAILED',
      pdfKey: 'document.pdf', pageImageKeys: [],
    }) });
  });

  it('does not publish and removes the DOCX when required PDF storage fails', async () => {
    mocks.findGeneration.mockResolvedValue(generation('CAREER_PROFILE', 'PROFILE_ONLY'));
    mocks.render.mockResolvedValue({
      docx: Buffer.from('docx'), pdf: Buffer.from('%PDF-valid'), pageCount: 1,
      profile: 'preferred', documentHash: 'a'.repeat(64),
      preview: { status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED' },
    });
    mocks.storePdf.mockRejectedValue(new PreviewArtifactStorageError('PDF_STORAGE_FAILED', null));

    await expect(generateApprovedCv('user-1', 'generation-1')).rejects.toMatchObject({
      code: 'PDF_STORAGE_FAILED',
    });
    expect(mocks.storageDelete).toHaveBeenCalledWith(
      'rewrites', 'users/user-1/generation-1/CV.docx',
    );
    expect(mocks.createGenerated).not.toHaveBeenCalled();
    expect(mocks.createPreview).not.toHaveBeenCalled();
  });

  it('denies stale-token publication without releasing another request reservation', async () => {
    mocks.findGeneration.mockResolvedValue(generation('JOB_MATCH', 'EXPERIENCE_FORWARD'));
    mocks.reserve.mockResolvedValue({ status: 'reserved', reservation: { status: 'RESERVED' } });
    mocks.generateAi.mockResolvedValue({
      data: {
        spec: assembleCvBuildSpec({
          generationId: 'generation-1', evidence,
          plan: plan('JOB_MATCH', 'EXPERIENCE_FORWARD'), templateId: 'architect',
        }),
        patchCount: { returned: 0, accepted: 0, rejected: 0 },
        rejected: [], summaryValidation: [], finalValidation: { ok: true },
      },
      provenance: { provider: 'test', model: 'test' },
    });
    mocks.updateManyGeneration.mockResolvedValue({ count: 0 });
    mocks.canPublish.mockResolvedValue(false);

    await expect(generateApprovedCv('user-1', 'generation-1')).rejects.toThrow('superseded');
    expect(mocks.createGenerated).not.toHaveBeenCalled();
    expect(mocks.createPreview).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
