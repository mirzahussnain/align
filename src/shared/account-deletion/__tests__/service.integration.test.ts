import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { StorageBucket } from '@/shared/lib/storage';

const mocks = vi.hoisted(() => ({
  storageDelete: vi.fn(),
  cancelActiveSubscription: vi.fn(),
}));

vi.mock('@/shared/lib/storage', () => ({ storage: { delete: mocks.storageDelete } }));
vi.mock('@/shared/billing/portal', () => ({
  cancelActiveSubscription: mocks.cancelActiveSubscription,
}));

const databaseUrl = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(databaseUrl);
const { prisma } = isLocalDb
  ? await import('@/shared/lib/prisma')
  : { prisma: null as never };
const { withAccountDeletionAuthorization } = await import('../context');
const { prepareAccountDeletion } = await import('../service');

interface LifecycleFixture {
  userId: string;
  sessionToken: string;
  objectKeys: Array<{ bucket: StorageBucket; key: string }>;
}

interface LifecycleOptions {
  billing: 'FREE' | 'CANCELLED_ACTIVE';
  cancelAtPeriodEnd?: boolean;
  withEveryObjectKind?: boolean;
}

const createdUsers = new Set<string>();

export async function seedLifecycleUser(options: LifecycleOptions): Promise<LifecycleFixture> {
  const suffix = randomUUID();
  const userId = `test_lifecycle_${suffix}`;
  const sessionToken = `session_${suffix}`;
  const sourceKey = `users/${userId}/stored-cv/source.pdf`;
  const intentKey = `users/${userId}/stored-cv/intents/pending.pdf`;
  const generatedKey = `users/${userId}/generated/generated.docx`;
  const avatarKey = `avatars/${userId}/avatar.png`;
  createdUsers.add(userId);

  await prisma.user.create({
    data: {
      id: userId,
      name: 'Lifecycle Integration',
      email: `${userId}@example.test`,
      emailVerified: true,
      image: `https://avatars.example.test/${avatarKey}`,
      sessions: {
        create: {
          id: `session_id_${suffix}`,
          token: sessionToken,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      },
      accounts: {
        create: {
          id: `account_${suffix}`,
          accountId: userId,
          providerId: 'credential',
          password: 'integration-hash',
        },
      },
    },
  });

  if (options.withEveryObjectKind) {
    const stored = await prisma.storedCv.create({
      data: {
        userId,
        storageProvider: 'integration',
        storageKey: sourceKey,
        originalFilename: 'source.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        checksum: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        sourceFormat: 'pdf',
        status: 'READY',
      },
    });
    const revision = await prisma.cvRevision.create({
      data: {
        userId,
        storedCvId: stored.id,
        filename: 'source.pdf',
        mimeType: 'application/pdf',
        byteSize: 4,
        checksum: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        extractedText: 'Integration CV',
        parserVersion: 'integration',
        sourceObjectKey: sourceKey,
      },
    });
    await prisma.cvUploadIntent.create({
      data: {
        userId,
        objectKey: intentKey,
        originalFilename: 'pending.pdf',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: 4,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    await prisma.generatedCV.create({
      data: {
        userId,
        sourceCvRevisionId: revision.id,
        template: 'classic',
        data: {},
        fileKey: generatedKey,
        fileSize: 4,
      },
    });
  }

  if (options.billing === 'CANCELLED_ACTIVE') {
    await prisma.billingAccount.create({
      data: {
        userId,
        provider: 'STRIPE',
        providerCustomerId: `cus_${suffix}`,
        purchases: {
          create: {
            provider: 'STRIPE',
            arrangement: 'RECURRING',
            offerId: 'PRO_MONTHLY',
            planId: 'PRO',
            status: 'CANCELLED',
            providerCustomerId: `cus_${suffix}`,
            providerSubscriptionId: `sub_${suffix}`,
            currentPeriodStart: new Date(Date.now() - 86_400_000),
            currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? true,
          },
        },
      },
    });
  }

  return {
    userId,
    sessionToken,
    objectKeys: options.withEveryObjectKind
      ? [
          { bucket: 'uploads', key: sourceKey },
          { bucket: 'uploads', key: intentKey },
          { bucket: 'rewrites', key: generatedKey },
          { bucket: 'avatars', key: avatarKey },
        ]
      : [{ bucket: 'avatars', key: avatarKey }],
  };
}

async function authorizeAndPrepare(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await withAccountDeletionAuthorization(userId, () => prepareAccountDeletion(user));
}

async function authorizeAndDelete(userId: string): Promise<void> {
  await authorizeAndPrepare(userId);
  await prisma.user.delete({ where: { id: userId } });
}

describe.skipIf(!isLocalDb)('account deletion — real Postgres cascades', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.S3_PUBLIC_URL_AVATARS = 'https://avatars.example.test';
    mocks.storageDelete.mockResolvedValue(true);
  });

  afterEach(async () => {
    await Promise.all(
      [...createdUsers].map((id) => prisma.user.delete({ where: { id } }).catch(() => null))
    );
    createdUsers.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('retains the user after one storage delete fails and succeeds on retry', async () => {
    const fixture = await seedLifecycleUser({ billing: 'FREE', withEveryObjectKind: true });
    mocks.storageDelete.mockResolvedValueOnce(false).mockResolvedValue(true);

    await expect(authorizeAndPrepare(fixture.userId)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_STORAGE_FAILED',
    });
    await expect(prisma.user.findUnique({ where: { id: fixture.userId } })).resolves.not.toBeNull();

    await expect(authorizeAndDelete(fixture.userId)).resolves.toBeUndefined();
    await expect(prisma.user.findUnique({ where: { id: fixture.userId } })).resolves.toBeNull();
  });

  it('deletes cascaded auth and domain rows after all object deletes succeed', async () => {
    const fixture = await seedLifecycleUser({ billing: 'FREE', withEveryObjectKind: true });

    await authorizeAndDelete(fixture.userId);
    expect(mocks.storageDelete).toHaveBeenCalledTimes(fixture.objectKeys.length);
    await expect(prisma.session.count({ where: { userId: fixture.userId } })).resolves.toBe(0);
    await expect(prisma.account.count({ where: { userId: fixture.userId } })).resolves.toBe(0);
    await expect(prisma.storedCv.count({ where: { userId: fixture.userId } })).resolves.toBe(0);
    await expect(prisma.generatedCV.count({ where: { userId: fixture.userId } })).resolves.toBe(0);
  });

  it('blocks cancel-at-period-end access without provider cancellation or storage deletion', async () => {
    const fixture = await seedLifecycleUser({
      billing: 'CANCELLED_ACTIVE',
      cancelAtPeriodEnd: true,
      withEveryObjectKind: true,
    });

    await expect(authorizeAndPrepare(fixture.userId)).rejects.toMatchObject({
      code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION',
    });
    expect(mocks.cancelActiveSubscription).not.toHaveBeenCalled();
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });
});
