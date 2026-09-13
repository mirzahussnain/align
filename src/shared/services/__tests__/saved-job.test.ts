import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRawUnsafe: vi.fn(),
    jobSnapshot: { findFirst: vi.fn() },
    profile: { findFirst: vi.fn() },
    savedJob: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return { tx, getUserPlan: vi.fn() };
});

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((work) => work(mocks.tx)),
    savedJob: mocks.tx.savedJob,
  },
}));
vi.mock('@/shared/entitlements/server', async (load) => {
  const actual = await load<typeof import('@/shared/entitlements/server')>();
  return { ...actual, getUserPlan: mocks.getUserPlan };
});

import { saveJobForUser, unsaveJobForUser } from '@/shared/services/saved-job';

describe('saved job mutation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserPlan.mockResolvedValue('FREE');
    mocks.tx.jobSnapshot.findFirst.mockResolvedValue({ id: 'snapshot-1' });
    mocks.tx.profile.findFirst.mockResolvedValue({ id: 'profile-1' });
    mocks.tx.savedJob.findUnique.mockResolvedValue(null);
    mocks.tx.savedJob.count.mockResolvedValue(0);
    mocks.tx.savedJob.create.mockResolvedValue({
      id: 'saved-1',
      jobSnapshotId: 'snapshot-1',
      jobSnapshot: { dedupeFingerprint: 'provider:one' },
    });
  });

  it('rejects a private snapshot owned by another user', async () => {
    mocks.tx.jobSnapshot.findFirst.mockResolvedValue(null);

    await expect(
      saveJobForUser({ userId: 'user-1', jobSnapshotId: 'private-other' })
    ).rejects.toMatchObject({ code: 'INVALID_JOB_REFERENCE', statusCode: 404 });

    expect(mocks.tx.savedJob.create).not.toHaveBeenCalled();
  });

  it('rejects a profile owned by another user', async () => {
    mocks.tx.profile.findFirst.mockResolvedValue(null);

    await expect(
      saveJobForUser({
        userId: 'user-1',
        jobSnapshotId: 'snapshot-1',
        profileId: 'foreign-profile',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('returns an existing save without consuming another slot', async () => {
    mocks.tx.savedJob.findUnique.mockResolvedValue({
      id: 'saved-1',
      profileId: null,
      jobSnapshotId: 'snapshot-1',
      jobSnapshot: { dedupeFingerprint: 'provider:one' },
    });

    const result = await saveJobForUser({ userId: 'user-1', jobSnapshotId: 'snapshot-1' });

    expect(result.created).toBe(false);
    expect(mocks.tx.savedJob.count).not.toHaveBeenCalled();
    expect(mocks.tx.savedJob.create).not.toHaveBeenCalled();
  });

  it('updates the profile association on an idempotent save', async () => {
    mocks.tx.savedJob.findUnique.mockResolvedValue({
      id: 'saved-1',
      profileId: null,
      jobSnapshotId: 'snapshot-1',
      jobSnapshot: { dedupeFingerprint: 'provider:one' },
    });
    mocks.tx.savedJob.update.mockResolvedValue({
      id: 'saved-1',
      profileId: 'profile-1',
      jobSnapshotId: 'snapshot-1',
      jobSnapshot: { dedupeFingerprint: 'provider:one' },
    });

    const result = await saveJobForUser({
      userId: 'user-1',
      jobSnapshotId: 'snapshot-1',
      profileId: 'profile-1',
    });

    expect(result.created).toBe(false);
    expect(mocks.tx.savedJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'saved-1' }, data: { profileId: 'profile-1' } })
    );
  });

  it('enforces the Free saved-job limit under the lock', async () => {
    mocks.tx.savedJob.count.mockResolvedValue(10);

    await expect(
      saveJobForUser({ userId: 'user-1', jobSnapshotId: 'snapshot-1' })
    ).rejects.toMatchObject({
      code: 'SAVED_JOB_LIMIT_REACHED',
      statusCode: 403,
      responseBody: expect.objectContaining({ capability: 'saved_jobs', limit: 10, used: 10 }),
    });

    expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledBefore(mocks.tx.savedJob.count);
  });

  it('uses the Pro limit from the registry', async () => {
    mocks.getUserPlan.mockResolvedValue('PRO');
    mocks.tx.savedJob.count.mockResolvedValue(99);

    await expect(
      saveJobForUser({ userId: 'user-1', jobSnapshotId: 'snapshot-1' })
    ).resolves.toMatchObject({ created: true });

    mocks.tx.savedJob.findUnique.mockResolvedValue(null);
    mocks.tx.savedJob.count.mockResolvedValue(100);
    await expect(
      saveJobForUser({ userId: 'user-1', jobSnapshotId: 'snapshot-2' })
    ).rejects.toMatchObject({ code: 'SAVED_JOB_LIMIT_REACHED' });
  });

  it('removes only the current user save by snapshot or saved-job id', async () => {
    mocks.tx.savedJob.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      unsaveJobForUser({ userId: 'user-1', jobSnapshotId: 'snapshot-1' })
    ).resolves.toEqual({ removed: true });
    expect(mocks.tx.savedJob.deleteMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', jobSnapshotId: 'snapshot-1' },
    });

    await unsaveJobForUser({ userId: 'user-1', savedJobId: 'saved-1' });
    expect(mocks.tx.savedJob.deleteMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', id: 'saved-1' },
    });
  });
});
