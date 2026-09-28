import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  fetchBoard: vi.fn(),
  ensurePersistedJob: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    employerJobSource: {
      findMany: mocks.findMany,
      update: mocks.update,
    },
  },
}));
vi.mock('@/shared/services/job-providers/greenhouse-adapter', () => ({
  greenhouseAdapter: { fetchBoard: mocks.fetchBoard },
}));
vi.mock('@/shared/services/job-snapshot', () => ({
  ensurePersistedJob: mocks.ensurePersistedJob,
}));
vi.mock('@/shared/services/company-sponsor-evidence', () => ({
  ensureCompanySponsorEvidence: vi.fn(async () => undefined),
}));

import { refreshGreenhouseEmployerSources } from '@/shared/services/greenhouse-refresh';

const source = (id: string) => ({
  id,
  providerIdentifier: id,
  companyRecordId: `company-${id}`,
  companyRecord: {
    id: `company-${id}`,
    displayName: id,
    websiteUrl: null,
    careersUrl: null,
  },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([source('good'), source('bad')]);
  mocks.update.mockResolvedValue({});
  mocks.fetchBoard.mockImplementation(async (input: { id: string }) => {
    if (input.id === 'bad') throw new Error('GREENHOUSE_UNAVAILABLE');
    return {
      jobs: [{ canonicalJobId: 'one' }, { canonicalJobId: 'two' }],
      invalidUrls: 0,
      invalidJobRecords: 0,
      duplicateProviderJobIds: 0,
      urlRejections: {},
    };
  });
  mocks.ensurePersistedJob
    .mockResolvedValueOnce({ snapshot: { id: 'snapshot-1' }, outcome: 'CREATED' })
    .mockResolvedValueOnce({ snapshot: { id: 'snapshot-2' }, outcome: 'REACTIVATED' });
});

describe('Greenhouse scheduled refresh persistence', () => {
  it('aggregates shared persistence outcomes and contains one-board failure', async () => {
    const result = await refreshGreenhouseEmployerSources({ concurrency: 1 });

    expect(mocks.ensurePersistedJob).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      attempted: 2,
      successful: 1,
      failed: 1,
      jobsRetrieved: 2,
      created: 1,
      updated: 0,
      reactivated: 1,
      unchanged: 0,
    });
  });
});
