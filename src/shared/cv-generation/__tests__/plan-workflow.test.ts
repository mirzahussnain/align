import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProposedCvPlan } from '../types';

const mocks = vi.hoisted(() => ({
  findGeneration: vi.fn(), findRevision: vi.fn(), updateManyGeneration: vi.fn(), createRevision: vi.fn(), transaction: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({ prisma: {
  cvGeneration: { findFirst: mocks.findGeneration, updateMany: mocks.updateManyGeneration },
  cvPlanRevision: { findFirst: mocks.findRevision, create: mocks.createRevision },
  $transaction: mocks.transaction,
} }));

import { approveGenerationPlan } from '../plan-workflow';

const proposed: ProposedCvPlan = {
  schemaVersion: 1, sourceMode: 'JOB_MATCH', atsStrategy: 'STANDARD', targetStrategy: 'JUNIOR_PROJECT_HEAVY',
  sectionOrder: ['PROFILE', 'SKILLS', 'PROJECTS'], density: 'BALANCED', targetLength: 'ONE_PAGE',
  includedEvidenceIds: ['core'], optionalEvidenceIds: ['optional'], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [],
  coveredRequirementIds: ['r1'], unresolvedRequirementIds: ['r2'],
};

describe('approveGenerationPlan section order', () => {
  const database = {
    cvGeneration: { findFirst: mocks.findGeneration, updateMany: mocks.updateManyGeneration },
    cvPlanRevision: { findFirst: mocks.findRevision, create: mocks.createRevision },
  };  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findGeneration.mockResolvedValue({ id: 'g1', status: 'PLAN_PROPOSED', planRevisions: [{ planJson: proposed }] });
    mocks.findRevision.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce({ version: 1 });
    mocks.updateManyGeneration.mockResolvedValue({ count: 1 });
    mocks.createRevision.mockResolvedValue({ id: 'approved' });
    mocks.transaction.mockImplementation(async (callback: (tx: typeof database) => unknown) => callback(database));
  });

  it('persists the final user-selected permutation in the approved plan', async () => {
    const approved = await approveGenerationPlan({
      userId: 'u1', generationId: 'g1', template: 'architect', excludedOptionalEvidenceIds: [],
      sectionOrder: ['PROJECTS', 'PROFILE', 'SKILLS'],
    });

    expect(approved.sectionOrder).toEqual(['PROJECTS', 'PROFILE', 'SKILLS']);
    expect(mocks.createRevision).toHaveBeenCalledWith({ data: expect.objectContaining({
      kind: 'APPROVED', planJson: expect.objectContaining({ sectionOrder: ['PROJECTS', 'PROFILE', 'SKILLS'] }),
    }) });
  });

  it.each([
    [['PROFILE', 'SKILLS']],
    [['PROFILE', 'SKILLS', 'OTHER']],
    [['PROFILE', 'SKILLS', 'SKILLS']],
  ])('rejects a requested order that is not an exact proposed-section permutation: %j', async (sectionOrder) => {
    await expect(approveGenerationPlan({
      userId: 'u1', generationId: 'g1', template: 'architect', excludedOptionalEvidenceIds: [],
      sectionOrder: sectionOrder as ProposedCvPlan['sectionOrder'],
    })).rejects.toThrow('Section order must contain every included section exactly once.');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
