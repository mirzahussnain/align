import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRawUnsafe: vi.fn(),
    profile: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { tx, getUserPlan: vi.fn() };
});

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { $transaction: vi.fn((work) => work(mocks.tx)) },
}));
vi.mock('@/shared/entitlements/server', async (load) => {
  const actual = await load<typeof import('@/shared/entitlements/server')>();
  return { ...actual, getUserPlan: mocks.getUserPlan };
});

import {
  createProfileWithinPlanLimit,
  deleteProfileForUser,
  setDefaultProfileForUser,
} from '@/shared/services/career-profile';

describe('Career Profile mutation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserPlan.mockResolvedValue('FREE');
    mocks.tx.profile.count.mockResolvedValue(0);
    mocks.tx.profile.findMany.mockResolvedValue([]);
    mocks.tx.profile.create.mockResolvedValue({ id: 'profile-1', label: 'Engineering', isDefault: true });
    mocks.tx.profile.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.profile.update.mockResolvedValue({ id: 'profile-1' });
    mocks.tx.profile.delete.mockResolvedValue({ id: 'profile-1' });
  });

  it('makes the first profile default under the resource lock', async () => {
    const created = await createProfileWithinPlanLimit({
      userId: 'user-1',
      label: ' Engineering ',
      targetIndustry: 'technology',
    });

    expect(created).toMatchObject({ id: 'profile-1' });
    expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledBefore(mocks.tx.profile.count);
    expect(mocks.tx.profile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', label: 'Engineering', isDefault: true }),
      select: { id: true, label: true, isDefault: true },
    });
  });

  it('rejects a second Free profile with a stable code', async () => {
    mocks.tx.profile.count.mockResolvedValue(1);

    await expect(
      createProfileWithinPlanLimit({ userId: 'user-1', label: 'Operations' })
    ).rejects.toMatchObject({
      code: 'PROFILE_LIMIT_REACHED',
      statusCode: 403,
      responseBody: expect.objectContaining({ limit: 1, used: 1 }),
    });
  });

  it('uses the Pro limit from the entitlement registry', async () => {
    mocks.getUserPlan.mockResolvedValue('PRO');
    mocks.tx.profile.count.mockResolvedValue(2);
    mocks.tx.profile.create.mockResolvedValue({ id: 'profile-3', label: 'Operations', isDefault: false });

    await expect(
      createProfileWithinPlanLimit({ userId: 'user-1', label: 'Operations' })
    ).resolves.toMatchObject({ id: 'profile-3', isDefault: false });

    mocks.tx.profile.count.mockResolvedValue(3);
    await expect(
      createProfileWithinPlanLimit({ userId: 'user-1', label: 'Healthcare' })
    ).rejects.toMatchObject({ code: 'PROFILE_LIMIT_REACHED' });
  });

  it('generates a collision-free onboarding label inside the lock', async () => {
    mocks.getUserPlan.mockResolvedValue('PRO');
    mocks.tx.profile.count.mockResolvedValue(2);
    mocks.tx.profile.findMany.mockResolvedValue([
      { label: 'My Career Profile' },
      { label: 'My Career Profile 2' },
    ]);

    await createProfileWithinPlanLimit({
      userId: 'user-1',
      label: 'My Career Profile',
      ensureUniqueLabel: true,
    });

    expect(mocks.tx.profile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: 'My Career Profile 3' }) })
    );
  });

  it('rejects an empty profile label before opening a transaction', async () => {
    await expect(
      createProfileWithinPlanLimit({ userId: 'user-1', label: '   ' })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('sets a default only when the profile belongs to the user', async () => {
    mocks.tx.profile.findFirst.mockResolvedValue(null);
    await expect(setDefaultProfileForUser('user-1', 'foreign')).resolves.toEqual({ updated: false });
    expect(mocks.tx.profile.updateMany).not.toHaveBeenCalled();

    mocks.tx.profile.findFirst.mockResolvedValue({ id: 'profile-1' });
    await expect(setDefaultProfileForUser('user-1', 'profile-1')).resolves.toEqual({ updated: true });
    expect(mocks.tx.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { isDefault: false },
    });
  });

  it('promotes one survivor when deleting the default profile', async () => {
    mocks.tx.profile.findMany.mockResolvedValue([
      { id: 'profile-1', isDefault: true },
      { id: 'profile-2', isDefault: false },
    ]);

    await expect(deleteProfileForUser('user-1', 'profile-1')).resolves.toEqual({
      deleted: true,
      reason: null,
    });
    expect(mocks.tx.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-2' },
      data: { isDefault: true },
    });
  });

  it('does not delete the final profile', async () => {
    mocks.tx.profile.findMany.mockResolvedValue([{ id: 'profile-1', isDefault: true }]);

    await expect(deleteProfileForUser('user-1', 'profile-1')).resolves.toEqual({
      deleted: false,
      reason: 'last_profile',
    });
    expect(mocks.tx.profile.delete).not.toHaveBeenCalled();
  });
});
