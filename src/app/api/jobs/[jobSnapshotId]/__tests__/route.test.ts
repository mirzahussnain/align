import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError } from '@/shared/utils/api-error';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCacheStore: vi.fn(() => ({ kind: 'cache' })),
  resolveJobReference: vi.fn(),
  getJobDetailsView: vi.fn(),
  getNormalisedJobDetailsView: vi.fn(),
  ensurePersistedJob: vi.fn(),
}));

vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock('@/shared/lib/cache/cache-provider', () => ({
  getCacheStore: mocks.getCacheStore,
}));
vi.mock('@/shared/services/job-reference', () => ({
  resolveJobReference: mocks.resolveJobReference,
}));
vi.mock('@/shared/services/job-board-api', () => ({
  getJobDetailsView: mocks.getJobDetailsView,
  getNormalisedJobDetailsView: mocks.getNormalisedJobDetailsView,
}));
vi.mock('@/shared/services/job-snapshot', () => ({
  ensurePersistedJob: mocks.ensurePersistedJob,
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  listProfileTargets: vi.fn(async () => []),
  resolveProfileId: vi.fn(async () => undefined),
}));

import { GET } from '../route';

const context = (jobReference: string) => ({
  params: Promise.resolve({ jobSnapshotId: jobReference }),
}) as RouteContext<'/api/jobs/[jobSnapshotId]'>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(null);
  mocks.getCacheStore.mockReturnValue({ kind: 'cache' });
});

describe('GET /api/jobs/[jobReference]', () => {
  it('projects an ephemeral buffered job without persisting it', async () => {
    const job = { canonicalJobId: 'canonical-1', title: 'Support Engineer' };
    const details = { job: { id: 'canonical-1', canonicalJobId: 'canonical-1' } };
    mocks.resolveJobReference.mockResolvedValue({ kind: 'ephemeral', job });
    mocks.getNormalisedJobDetailsView.mockReturnValue(details);

    const response = await GET(
      new Request('https://align.test/api/jobs/canonical-1?sessionId=session-1') as never,
      context('canonical-1'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject(details);
    expect(mocks.resolveJobReference).toHaveBeenCalledWith(
      { kind: 'cache' },
      {
        canonicalJobId: 'canonical-1',
        sessionId: 'session-1',
        userId: null,
      },
    );
    expect(mocks.getNormalisedJobDetailsView).toHaveBeenCalledWith(job);
    expect(mocks.getJobDetailsView).not.toHaveBeenCalled();
    expect(mocks.ensurePersistedJob).not.toHaveBeenCalled();
  });

  it('uses the persisted details view when an explicit snapshot resolves', async () => {
    mocks.resolveJobReference.mockResolvedValue({
      kind: 'persisted',
      jobSnapshotId: 'snapshot-1',
    });
    mocks.getJobDetailsView.mockResolvedValue({ job: { id: 'snapshot-1' } });

    const response = await GET(
      new Request('https://align.test/api/jobs/canonical-1?jobSnapshotId=snapshot-1') as never,
      context('canonical-1'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: {
        id: 'snapshot-1',
        canonicalJobId: 'canonical-1',
        jobSnapshotId: 'snapshot-1',
      },
    });
    expect(mocks.getJobDetailsView).toHaveBeenCalledWith('snapshot-1', '', {});
    expect(mocks.getNormalisedJobDetailsView).not.toHaveBeenCalled();
    expect(mocks.ensurePersistedJob).not.toHaveBeenCalled();
  });

  it('returns the typed expiry response when the buffer is gone', async () => {
    mocks.resolveJobReference.mockRejectedValue(
      new APIError('This search result has expired.', 410, undefined, 'EPHEMERAL_JOB_EXPIRED', true),
    );

    const response = await GET(
      new Request('https://align.test/api/jobs/canonical-1?sessionId=expired') as never,
      context('canonical-1'),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'EPHEMERAL_JOB_EXPIRED', retryable: true },
    });
  });
});
