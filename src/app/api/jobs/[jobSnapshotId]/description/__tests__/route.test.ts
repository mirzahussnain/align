import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCacheStore: vi.fn(() => ({ kind: 'cache' })),
  resolveDurableJobReference: vi.fn(),
  ensurePersistedJob: vi.fn(),
  attachUserDescription: vi.fn(),
}));

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/lib/cache/cache-provider', () => ({ getCacheStore: mocks.getCacheStore }));
vi.mock('@/shared/services/job-reference', () => ({
  resolveDurableJobReference: mocks.resolveDurableJobReference,
}));
vi.mock('@/shared/services/job-snapshot', () => ({
  ensurePersistedJob: mocks.ensurePersistedJob,
  attachUserDescription: mocks.attachUserDescription,
}));

import { POST } from '../route';

const context = {
  params: Promise.resolve({ jobSnapshotId: 'canonical-1' }),
} as RouteContext<'/api/jobs/[jobSnapshotId]/description'>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
  mocks.getCacheStore.mockReturnValue({ kind: 'cache' });
});

describe('POST /api/jobs/[jobReference]/description', () => {
  it('materializes an ephemeral reference before attaching user text', async () => {
    const job = { canonicalJobId: 'canonical-1' };
    const description = 'A complete user-provided vacancy description with sufficient detail.';
    mocks.resolveDurableJobReference.mockResolvedValue({ kind: 'ephemeral', job });
    mocks.ensurePersistedJob.mockResolvedValue({ snapshot: { id: 'snapshot-1' } });
    mocks.attachUserDescription.mockResolvedValue({ id: 'snapshot-1' });

    const response = await POST(
      new Request('https://align.test/api/jobs/canonical-1/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalJobId: 'canonical-1',
          sessionId: 'session-1',
          description,
        }),
      }) as never,
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveDurableJobReference).toHaveBeenCalledWith(
      { kind: 'cache' },
      {
        canonicalJobId: 'canonical-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    );
    expect(mocks.ensurePersistedJob).toHaveBeenCalledWith(job);
    expect(mocks.attachUserDescription).toHaveBeenCalledWith({
      userId: 'user-1',
      jobSnapshotId: 'snapshot-1',
      description,
    });
  });
});
