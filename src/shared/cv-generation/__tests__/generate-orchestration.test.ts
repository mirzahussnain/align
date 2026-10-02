import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCandidateEvidence } from '../merge-evidence';
import type { ApprovedCvPlan } from '../types';

const mocks = vi.hoisted(() => ({
  findGeneration: vi.fn(), updateGeneration: vi.fn(), updateManyGeneration: vi.fn(), findGenerated: vi.fn(),
  countGenerated: vi.fn(), createGenerated: vi.fn(), transaction: vi.fn(), upload: vi.fn(), download: vi.fn(),
  generateAi: vi.fn(), reserve: vi.fn(), commit: vi.fn(), createResult: vi.fn(), release: vi.fn(),
  markRunning: vi.fn(), reservationIsRunning: vi.fn(), render: vi.fn(),
}));

const tx = {
  generatedCV: { count: mocks.countGenerated, create: mocks.createGenerated },
  cvGeneration: { update: mocks.updateGeneration },
};

vi.mock('@/shared/lib/prisma', () => ({ prisma: {
  cvGeneration: { findFirst: mocks.findGeneration, update: mocks.updateGeneration, updateMany: mocks.updateManyGeneration },
  generatedCV: { findFirst: mocks.findGenerated },
  $transaction: mocks.transaction,
} }));
vi.mock('@/shared/lib/storage', () => ({ storage: { upload: mocks.upload, download: mocks.download } }));
vi.mock('@/shared/services/ai-orchestrator', () => ({
  executeAiTask: mocks.generateAi,
  AiOrchestrationError: class AiOrchestrationError extends Error {},
}));
vi.mock('@/shared/services/capability-reservation', () => ({
  reserveCapability: mocks.reserve, commitCapability: mocks.commit, createResultForReservation: mocks.createResult,
  releaseCapability: mocks.release, reservationFingerprint: () => 'fingerprint',
}));
vi.mock('@/shared/services/ai-failure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/services/ai-failure')>()),
  markOperationRunning: mocks.markRunning, reservationIsRunning: mocks.reservationIsRunning,
}));
vi.mock('@/shared/templates/v2', () => ({ generateV2Template: mocks.render }));

import { generateApprovedCv } from '../generate';

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
    matchProfileSnapshotId: null, jobRevisionId: sourceMode === 'JOB_MATCH' ? 'job-revision-1' : null, profileId: 'profile-1',
    template: 'architect', targetContextJson: {}, generatedCv,
    evidenceSnapshots: [{ snapshotJson: evidence, contentHash: 'evidence-hash' }],
    planRevisions: [{ planJson: plan(sourceMode, targetStrategy), contentHash: 'plan-hash' }],
  };
}

describe('generateApprovedCv orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reservationIsRunning.mockReturnValue(false);
    mocks.render.mockResolvedValue(Buffer.from('docx'));
    mocks.countGenerated.mockResolvedValue(0);
    mocks.createGenerated.mockResolvedValue({ id: 'generated-1' });
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.createResult.mockImplementation(async ({ creator }: { creator: (client: typeof tx) => Promise<{ resultRef: string; value: string }> }) => ({ status: 'created', ...(await creator(tx)) }));
  });

  it('keeps profile-only generation deterministic and unmetered', async () => {
    mocks.findGeneration.mockResolvedValue(generation('CAREER_PROFILE', 'PROFILE_ONLY'));
    const result = await generateApprovedCv('user-1', 'generation-1');
    expect(result).toMatchObject({ generatedCvId: 'generated-1', recovered: false });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generateAi).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledOnce();
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
});
