import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveBillingAccess: vi.fn(),
  cancelActiveSubscription: vi.fn(),
  storageDelete: vi.fn(),
  cvRevisions: vi.fn(),
  storedCvs: vi.fn(),
  uploadIntents: vi.fn(),
  generatedCvs: vi.fn(),
}));

vi.mock('@/shared/billing/access', () => ({ resolveBillingAccess: mocks.resolveBillingAccess }));
vi.mock('@/shared/billing/portal', () => ({ cancelActiveSubscription: mocks.cancelActiveSubscription }));
vi.mock('@/shared/lib/storage', () => ({ storage: { delete: mocks.storageDelete } }));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    cvRevision: { findMany: mocks.cvRevisions },
    storedCv: { findMany: mocks.storedCvs },
    cvUploadIntent: { findMany: mocks.uploadIntents },
    generatedCV: { findMany: mocks.generatedCvs },
  },
}));

import { withAccountDeletionAuthorization } from '../context';
import { prepareAccountDeletion } from '../service';

const user = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.test',
  emailVerified: true,
  image: 'https://avatars.example.test/avatars/u1/avatar.png',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const originalAvatarBase = process.env.S3_PUBLIC_URL_AVATARS;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.S3_PUBLIC_URL_AVATARS = 'https://avatars.example.test';
  mocks.resolveBillingAccess.mockResolvedValue({
    effectivePlan: 'FREE',
    status: 'FREE',
    accessEndsAt: undefined,
    graceEndsAt: undefined,
    cancelAtPeriodEnd: false,
  });
  mocks.cvRevisions.mockResolvedValue([{ sourceObjectKey: 'users/u1/source.pdf' }]);
  mocks.storedCvs.mockResolvedValue([{ storageKey: 'users/u1/source.pdf' }]);
  mocks.uploadIntents.mockResolvedValue([{ objectKey: 'users/u1/source.pdf' }]);
  mocks.generatedCvs.mockResolvedValue([{ fileKey: 'users/u1/generated.docx' }]);
  mocks.storageDelete.mockResolvedValue(true);
});

afterEach(() => {
  if (originalAvatarBase === undefined) delete process.env.S3_PUBLIC_URL_AVATARS;
  else process.env.S3_PUBLIC_URL_AVATARS = originalAvatarBase;
});

describe('prepareAccountDeletion', () => {
  it('rejects calls outside the trusted authorization context', async () => {
    await expect(prepareAccountDeletion(user)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_NOT_AUTHORIZED',
    });
  });

  it('blocks active paid access without cancelling it or touching storage', async () => {
    const paidThrough = new Date('2026-10-01T00:00:00.000Z');
    mocks.resolveBillingAccess.mockResolvedValue({
      effectivePlan: 'PRO',
      status: 'CANCELLED_ACTIVE',
      accessEndsAt: paidThrough,
      cancelAtPeriodEnd: true,
    });

    await expect(
      withAccountDeletionAuthorization('u1', () => prepareAccountDeletion(user))
    ).rejects.toMatchObject({
      code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION',
      paidThrough,
      billingStatus: 'CANCELLED_ACTIVE',
    });
    expect(mocks.cancelActiveSubscription).not.toHaveBeenCalled();
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it('deduplicates and deletes every server-owned object before user deletion', async () => {
    await withAccountDeletionAuthorization('u1', () => prepareAccountDeletion(user));

    expect(mocks.storageDelete).toHaveBeenCalledTimes(3);
    expect(mocks.storageDelete).toHaveBeenCalledWith('uploads', 'users/u1/source.pdf');
    expect(mocks.storageDelete).toHaveBeenCalledWith('rewrites', 'users/u1/generated.docx');
    expect(mocks.storageDelete).toHaveBeenCalledWith('avatars', 'avatars/u1/avatar.png');
  });

  it('refuses a database key outside the authenticated user namespace', async () => {
    mocks.cvRevisions.mockResolvedValue([{ sourceObjectKey: 'users/u2/source.pdf' }]);

    await expect(
      withAccountDeletionAuthorization('u1', () => prepareAccountDeletion(user))
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_STORAGE_FAILED' });
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it('retains the user boundary when any storage deletion fails', async () => {
    mocks.storageDelete.mockResolvedValueOnce(false);

    await expect(
      withAccountDeletionAuthorization('u1', () => prepareAccountDeletion(user))
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_STORAGE_FAILED' });
  });
});
