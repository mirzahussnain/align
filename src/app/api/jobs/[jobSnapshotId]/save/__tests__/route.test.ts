import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCacheStore: vi.fn(() => ({ kind: 'cache' })),
  resolveDurableJobReference: vi.fn(),
  ensurePersistedJob: vi.fn(),
  saveJobForUser: vi.fn(),
  unsaveJobForUser: vi.fn(),
}));

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/lib/cache/cache-provider', () => ({ getCacheStore: mocks.getCacheStore }));
vi.mock('@/shared/services/job-reference', () => ({
  resolveDurableJobReference: mocks.resolveDurableJobReference,
}));
vi.mock('@/shared/services/job-snapshot', () => ({ ensurePersistedJob: mocks.ensurePersistedJob }));
vi.mock('@/shared/services/saved-job', () => ({
  saveJobForUser: mocks.saveJobForUser,
  unsaveJobForUser: mocks.unsaveJobForUser,
}));

import { POST } from '../route';

const context = { params: Promise.resolve({ jobSnapshotId: 'canonical-1' }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
  mocks.getCacheStore.mockReturnValue({ kind: 'cache' });
  mocks.saveJobForUser.mockResolvedValue({
    created: true,
    savedJob: { jobSnapshotId: 'snapshot-1' },
  });
});

describe('POST /api/jobs/[jobReference]/save', () => {
  it('materializes once and reuses the returned snapshot on a repeated save', async () => {
    const job = { canonicalJobId: 'canonical-1' };
    mocks.resolveDurableJobReference
      .mockResolvedValueOnce({ kind: 'ephemeral', job })
      .mockResolvedValueOnce({ kind: 'persisted', jobSnapshotId: 'snapshot-1' });
    mocks.ensurePersistedJob.mockResolvedValue({
      snapshot: { id: 'snapshot-1' },
      outcome: 'CREATED',
    });

    const request = (body: object) =>
      new Request('https://align.test/api/jobs/canonical-1/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as never;

    const first = await POST(request({
      canonicalJobId: 'canonical-1',
      sessionId: 'session-1',
    }), context);
    const second = await POST(request({
      canonicalJobId: 'canonical-1',
      jobSnapshotId: 'snapshot-1',
    }), context);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(mocks.ensurePersistedJob).toHaveBeenCalledTimes(1);
    expect(mocks.saveJobForUser).toHaveBeenCalledTimes(2);
    expect(mocks.saveJobForUser).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      jobSnapshotId: 'snapshot-1',
      profileId: undefined,
    });
  });

  it('materializes an ephemeral reference before saving it', async () => {
    const job = { canonicalJobId: 'canonical-1' };
    mocks.resolveDurableJobReference.mockResolvedValue({ kind: 'ephemeral', job });
    mocks.ensurePersistedJob.mockResolvedValue({
      snapshot: { id: 'snapshot-1' },
      outcome: 'CREATED',
    });

    const response = await POST(
      new Request('https://align.test/api/jobs/canonical-1/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalJobId: 'canonical-1',
          sessionId: 'session-1',
          profileId: 'profile-1',
        }),
      }) as never,
      context,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      saved: true,
      jobSnapshotId: 'snapshot-1',
    });
    expect(mocks.resolveDurableJobReference).toHaveBeenCalledWith(
      { kind: 'cache' },
      {
        canonicalJobId: 'canonical-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    );
    expect(mocks.ensurePersistedJob).toHaveBeenCalledWith(job);
    expect(mocks.saveJobForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      jobSnapshotId: 'snapshot-1',
      profileId: 'profile-1',
    });
  });
});
