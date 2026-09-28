import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCacheStore: vi.fn(() => ({ kind: 'cache' })),
  resolveDurableJobReference: vi.fn(),
  ensurePersistedJob: vi.fn(),
  createMatchRequest: vi.fn(),
  assess: vi.fn(),
  getJobDetailsView: vi.fn(),
}));

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/lib/cache/cache-provider', () => ({ getCacheStore: mocks.getCacheStore }));
vi.mock('@/shared/services/job-reference', () => ({ resolveDurableJobReference: mocks.resolveDurableJobReference }));
vi.mock('@/shared/services/job-snapshot', () => ({
  ensurePersistedJob: mocks.ensurePersistedJob,
  createMatchRequest: mocks.createMatchRequest,
}));
vi.mock('@/shared/services/job-intelligence-store', () => ({ assessAndPersistJobIntelligence: mocks.assess }));
vi.mock('@/shared/services/job-board-api', () => ({ getJobDetailsView: mocks.getJobDetailsView }));
vi.mock('@/shared/services/practical-compatibility-store', () => ({ buildConfirmedCandidateFacts: vi.fn(async () => null) }));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  resolveProfileId: vi.fn(async () => 'profile-1'),
  loadProfileTarget: vi.fn(async () => null),
  listProfileTargets: vi.fn(async () => []),
}));

import { POST } from '../route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
  mocks.getCacheStore.mockReturnValue({ kind: 'cache' });
  mocks.assess.mockResolvedValue({});
  mocks.getJobDetailsView.mockResolvedValue({
    job: { id: 'snapshot-1' },
    description: { text: 'A complete description', completeness: 'FULL' },
  });
  mocks.createMatchRequest.mockResolvedValue({ id: 'match-1' });
});

describe('POST /api/jobs/[jobReference]/match-preparation', () => {
  it('treats a path-only legacy reference as an explicit persisted snapshot', async () => {
    mocks.resolveDurableJobReference.mockResolvedValue({
      kind: 'persisted',
      jobSnapshotId: 'snapshot-existing',
    });

    const response = await POST(
      new Request('https://align.test/api/jobs/snapshot-existing/match-preparation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: 'profile-1' }),
      }) as never,
      { params: Promise.resolve({ jobSnapshotId: 'snapshot-existing' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveDurableJobReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        canonicalJobId: 'snapshot-existing',
        jobSnapshotId: 'snapshot-existing',
      }),
    );
    expect(mocks.ensurePersistedJob).not.toHaveBeenCalled();
  });

  it('materializes an ephemeral reference before reading and assessing details', async () => {
    const job = { canonicalJobId: 'canonical-1' };
    mocks.resolveDurableJobReference.mockResolvedValue({ kind: 'ephemeral', job });
    mocks.ensurePersistedJob.mockResolvedValue({ snapshot: { id: 'snapshot-1' } });

    const response = await POST(
      new Request('https://align.test/api/jobs/canonical-1/match-preparation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalJobId: 'canonical-1',
          sessionId: 'session-1',
          profileId: 'profile-1',
        }),
      }) as never,
      { params: Promise.resolve({ jobSnapshotId: 'canonical-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.ensurePersistedJob).toHaveBeenCalledWith(job);
    expect(mocks.getJobDetailsView).toHaveBeenCalledWith('snapshot-1', 'user-1');
    expect(mocks.assess).toHaveBeenCalledWith(expect.objectContaining({ jobSnapshotId: 'snapshot-1' }));
    expect(mocks.createMatchRequest).toHaveBeenCalledWith(expect.objectContaining({ jobSnapshotId: 'snapshot-1' }));
  });
});
