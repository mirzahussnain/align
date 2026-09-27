import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRevision: vi.fn(),
  resolveMatchRequest: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { jobRevision: { create: mocks.createRevision } },
}));
vi.mock('@/shared/services/job-snapshot', () => ({
  resolveMatchRequest: mocks.resolveMatchRequest,
}));

import { createJobRevisionFromRequest } from '@/shared/services/job-revision';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createRevision.mockResolvedValue({ id: 'revision-1' });
});

describe('Job Match revision capture', () => {
  it('uses the prepared description even after the snapshot description changes', async () => {
    mocks.resolveMatchRequest.mockResolvedValue({
      request: {
        jobSnapshot: {
          id: 'snapshot-1',
          importedByUserId: null,
          title: 'Platform Engineer',
          employerName: 'Acme',
          locationText: 'London',
          canonicalJobId: 'canonical-1',
          providerDescription: 'A later refreshed description',
          providerReferences: [],
          employerSponsorEvidence: null,
          vacancySponsorshipSignal: null,
          requirementEvidence: null,
        },
      },
      selected: {
        text: 'The description captured when the match was prepared',
        source: 'PROVIDER_FULL',
        hash: 'prepared-hash',
        availability: 'FULL',
      },
    });

    await createJobRevisionFromRequest({
      userId: 'user-1',
      requestId: 'request-1',
    });

    expect(mocks.createRevision).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobSnapshotId: 'snapshot-1',
        description: 'The description captured when the match was prepared',
        descriptionHash: 'prepared-hash',
      }),
    });
  });
});
