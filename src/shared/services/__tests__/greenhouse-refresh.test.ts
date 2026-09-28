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
      jobsFetched: 2,
      jobsProcessed: 2,
      partialSourcesFailed: 0,
      jobsRetrieved: 2,
      created: 1,
      updated: 0,
      reactivated: 1,
      unchanged: 0,
    });
  });

  it('bounds persistence to four jobs per source and eight across two source workers', async () => {
    mocks.ensurePersistedJob.mockReset();
    mocks.findMany.mockResolvedValue([source('one'), source('two')]);
    mocks.fetchBoard.mockImplementation(async (input: { id: string }) => ({
      jobs: Array.from({ length: 10 }, (_, index) => ({ canonicalJobId: `${input.id}-${index}` })),
      invalidUrls: 0,
      invalidJobRecords: 0,
      duplicateProviderJobIds: 0,
      urlRejections: {},
    }));
    let active = 0;
    let maximum = 0;
    mocks.ensurePersistedJob.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { snapshot: { id: 'snapshot' }, outcome: 'CREATED' };
    });
    const result = await refreshGreenhouseEmployerSources({ concurrency: 2 });
    expect(maximum).toBeGreaterThan(4);
    expect(maximum).toBeLessThanOrEqual(8);
    expect(result).toMatchObject({ successful: 2, failed: 0, jobsFetched: 20, jobsProcessed: 20, created: 20 });
  });

  it('reports a partial source failure without discarding neighboring committed outcomes', async () => {
    mocks.ensurePersistedJob.mockReset();
    mocks.findMany.mockResolvedValue([source('partial')]);
    mocks.fetchBoard.mockResolvedValue({
      jobs: Array.from({ length: 6 }, (_, index) => ({ canonicalJobId: `job-${index}` })),
      invalidUrls: 0,
      invalidJobRecords: 0,
      duplicateProviderJobIds: 0,
      urlRejections: {},
    });
    mocks.ensurePersistedJob.mockImplementation(async (job: { canonicalJobId: string }) => {
      const index = Number(job.canonicalJobId.slice('job-'.length));
      await new Promise((resolve) => setTimeout(resolve, index === 1 ? 1 : 5));
      if (index === 1) throw new Error('transaction unavailable');
      return { snapshot: { id: `snapshot-${index}` }, outcome: 'CREATED' };
    });
    const result = await refreshGreenhouseEmployerSources({ concurrency: 1 });
    expect(result).toMatchObject({
      successful: 0,
      failed: 1,
      partialSourcesFailed: 1,
      jobsFetched: 6,
      jobsProcessed: 3,
      created: 3,
      uniqueJobsPersisted: 3,
    });
    expect(result.sources[0]).toMatchObject({ status: 'FAILED', fetchedJobs: 6, processedJobs: 3 });
  });

  it('converges idempotently when the same source is rerun', async () => {
    mocks.ensurePersistedJob.mockReset();
    mocks.findMany.mockResolvedValue([source('repeat')]);
    mocks.fetchBoard.mockResolvedValue({
      jobs: [{ canonicalJobId: 'same-job' }],
      invalidUrls: 0,
      invalidJobRecords: 0,
      duplicateProviderJobIds: 0,
      urlRejections: {},
    });
    mocks.ensurePersistedJob
      .mockResolvedValueOnce({ snapshot: { id: 'snapshot' }, outcome: 'CREATED' })
      .mockResolvedValueOnce({ snapshot: { id: 'snapshot' }, outcome: 'UNCHANGED' });
    const first = await refreshGreenhouseEmployerSources({ concurrency: 1 });
    const second = await refreshGreenhouseEmployerSources({ concurrency: 1 });
    expect(first).toMatchObject({ created: 1, unchanged: 0, jobsProcessed: 1 });
    expect(second).toMatchObject({ created: 0, unchanged: 1, jobsProcessed: 1 });
    expect(mocks.ensurePersistedJob).toHaveBeenCalledTimes(2);
  });
});
