import { resolveBillingAccess } from '@/shared/billing/access';
import { prisma } from '@/shared/lib/prisma';
import { storage, type StorageBucket } from '@/shared/lib/storage';
import { decideAccountDeletion } from '@/shared/policies';
import { assertAccountDeletionAuthorization } from './context';
import {
  AccountDeletionStorageFailedError,
  ActiveSubscriptionBlocksDeletionError,
} from './errors';

interface DeletionUser {
  id: string;
  image?: string | null;
}

interface StoredObject {
  bucket: StorageBucket;
  key: string;
}

function checkedUserKey(userId: string, key: string | null, bucket: StorageBucket): StoredObject | null {
  if (!key) return null;
  const prefix = bucket === 'avatars' ? `avatars/${userId}/` : `users/${userId}/`;
  if (!key.startsWith(prefix) || key.includes('..') || key.includes('\\')) {
    throw new AccountDeletionStorageFailedError();
  }
  return { bucket, key };
}

function avatarObject(userId: string, image?: string | null): StoredObject | null {
  const configuredBase = process.env.S3_PUBLIC_URL_AVATARS?.replace(/\/$/, '');
  if (!configuredBase || !image) return null;
  try {
    const base = new URL(`${configuredBase}/`);
    const avatar = new URL(image);
    if (avatar.origin !== base.origin || !avatar.pathname.startsWith(base.pathname)) return null;
    const key = decodeURIComponent(avatar.pathname.slice(base.pathname.length));
    return checkedUserKey(userId, key, 'avatars');
  } catch {
    return null;
  }
}

export async function prepareAccountDeletion(user: DeletionUser): Promise<void> {
  assertAccountDeletionAuthorization(user.id);

  const billing = await resolveBillingAccess(user.id);
  const paidAccessActive = billing.effectivePlan !== 'FREE';
  const paidThrough = billing.accessEndsAt ?? billing.graceEndsAt ?? null;
  const decision = decideAccountDeletion({
    effectivePlan: billing.effectivePlan,
    paidAccessActive,
    paidThrough,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
  });
  if (decision.status === 'blocked_active_subscription') {
    throw new ActiveSubscriptionBlocksDeletionError(
      decision.paidThrough,
      billing.status
    );
  }

  const [revisions, storedCvs, uploadIntents, generatedCvs] = await Promise.all([
    prisma.cvRevision.findMany({
      where: { userId: user.id, sourceObjectKey: { not: null } },
      select: { sourceObjectKey: true },
    }),
    prisma.storedCv.findMany({
      where: { userId: user.id },
      select: { storageKey: true },
    }),
    prisma.cvUploadIntent.findMany({
      where: { userId: user.id },
      select: { objectKey: true },
    }),
    prisma.generatedCV.findMany({
      where: { userId: user.id, fileKey: { not: null } },
      select: { fileKey: true },
    }),
  ]);

  const objects = [
    ...revisions.map((row) => checkedUserKey(user.id, row.sourceObjectKey, 'uploads')),
    ...storedCvs.map((row) => checkedUserKey(user.id, row.storageKey, 'uploads')),
    ...uploadIntents.map((row) => checkedUserKey(user.id, row.objectKey, 'uploads')),
    ...generatedCvs.map((row) => checkedUserKey(user.id, row.fileKey, 'rewrites')),
    avatarObject(user.id, user.image),
  ].filter((object): object is StoredObject => object !== null);
  const unique = [
    ...new Map(objects.map((object) => [`${object.bucket}\0${object.key}`, object])).values(),
  ];

  try {
    const deleted = await Promise.all(
      unique.map((object) => storage.delete(object.bucket, object.key))
    );
    if (deleted.some((result) => !result)) throw new AccountDeletionStorageFailedError();
  } catch (error) {
    if (error instanceof AccountDeletionStorageFailedError) throw error;
    throw new AccountDeletionStorageFailedError();
  }
}
