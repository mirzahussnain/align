import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/shared/services/saved-job', () => ({
  saveJobForUser: vi.fn(),
  unsaveJobForUser: vi.fn(),
}));
vi.mock('@/shared/services/job-intelligence-store', () => ({
  assessAndPersistJobIntelligence: vi.fn(),
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { savedJob: { findMany: vi.fn(async () => []) } },
}));

import { auth } from '@/shared/lib/auth';
import { saveJobForUser, unsaveJobForUser } from '@/shared/services/saved-job';
import { POST as postSavedJobs, DELETE as deleteSavedJobs } from '@/app/api/saved-jobs/route';
import {
  POST as postSnapshotSave,
  DELETE as deleteSnapshotSave,
} from '@/app/api/jobs/[jobSnapshotId]/save/route';

const session = { user: { id: 'user-1' } };
const saved = {
  created: true,
  savedJob: {
    id: 'saved-1',
    jobSnapshotId: 'snapshot-1',
    jobSnapshot: { dedupeFingerprint: 'provider:one' },
  },
};

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
  vi.mocked(saveJobForUser).mockResolvedValue(saved as never);
  vi.mocked(unsaveJobForUser).mockResolvedValue({ removed: true });
});

describe('saved-job routes', () => {
  it('uses the same authoritative service from both save routes', async () => {
    const legacy = await postSavedJobs(
      jsonRequest('http://test/api/saved-jobs', {
        jobSnapshotId: 'snapshot-1',
        profileId: 'profile-1',
      })
    );
    const direct = await postSnapshotSave(
      jsonRequest('http://test/api/jobs/snapshot-1/save', { profileId: 'profile-1' }),
      { params: Promise.resolve({ jobSnapshotId: 'snapshot-1' }) }
    );

    expect(legacy.status).toBe(201);
    expect(direct.status).toBe(201);
    expect(saveJobForUser).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      jobSnapshotId: 'snapshot-1',
      profileId: 'profile-1',
    });
    expect(saveJobForUser).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      jobSnapshotId: 'snapshot-1',
      profileId: 'profile-1',
    });
  });

  it('rejects browser-authored canonical job fields', async () => {
    const response = await postSavedJobs(
      jsonRequest('http://test/api/saved-jobs', {
        jobSnapshotId: 'snapshot-1',
        title: 'Forged title',
      })
    );

    expect(response.status).toBe(400);
    expect(saveJobForUser).not.toHaveBeenCalled();
  });

  it('preserves idempotent status from the service', async () => {
    vi.mocked(saveJobForUser).mockResolvedValue({ ...saved, created: false } as never);

    const response = await postSavedJobs(
      jsonRequest('http://test/api/saved-jobs', { jobSnapshotId: 'snapshot-1' })
    );

    expect(response.status).toBe(200);
  });

  it('uses the same unsave service for both delete routes', async () => {
    const legacy = await deleteSavedJobs(
      new Request('http://test/api/saved-jobs?id=saved-1', { method: 'DELETE' }) as never
    );
    const direct = await deleteSnapshotSave(
      new Request('http://test/api/jobs/snapshot-1/save', { method: 'DELETE' }) as never,
      { params: Promise.resolve({ jobSnapshotId: 'snapshot-1' }) }
    );

    expect(legacy.status).toBe(200);
    expect(direct.status).toBe(200);
    expect(unsaveJobForUser).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      savedJobId: 'saved-1',
    });
    expect(unsaveJobForUser).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      jobSnapshotId: 'snapshot-1',
    });
  });
});
