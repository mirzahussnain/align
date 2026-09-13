import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
const { prisma } = isLocalDb ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { saveJobForUser, unsaveJobForUser } = await import('../saved-job');

describe.skipIf(!isLocalDb)('saved job limits with real PostgreSQL', () => {
  const userId = `test_saved_${randomUUID()}`;
  const otherUserId = `test_saved_other_${randomUUID()}`;
  const snapshotIds: string[] = [];

  async function createSnapshot(index: number, importedByUserId?: string) {
    const snapshot = await prisma.jobSnapshot.create({
      data: {
        canonicalJobId: `test:saved:${userId}:${index}`,
        dedupeFingerprint: `test:saved:${userId}:${index}`,
        title: `Role ${index}`,
        normalisedTitle: `role ${index}`,
        employerName: 'Test Employer',
        normalisedEmployerName: 'test employer',
        descriptionAvailability: 'EXTERNAL_ONLY',
        importedByUserId,
      },
      select: { id: true },
    });
    snapshotIds.push(snapshot.id);
    return snapshot.id;
  }

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: userId, name: 'Saved Job Test', email: `${userId}@example.test` },
        { id: otherUserId, name: 'Other User', email: `${otherUserId}@example.test` },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.savedJob.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } }).catch(() => {});
    await prisma.jobSnapshot.deleteMany({ where: { id: { in: snapshotIds } } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('allows exactly one concurrent save at the final Free slot', async () => {
    const seeded = await Promise.all(Array.from({ length: 11 }, (_, index) => createSnapshot(index)));
    await prisma.savedJob.createMany({
      data: seeded.slice(0, 9).map((jobSnapshotId) => ({ userId, jobSnapshotId })),
    });

    const outcomes = await Promise.allSettled([
      saveJobForUser({ userId, jobSnapshotId: seeded[9] }),
      saveJobForUser({ userId, jobSnapshotId: seeded[10] }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await prisma.savedJob.count({ where: { userId } })).toBe(10);
  });

  it('frees a slot after deletion and keeps duplicate saves idempotent', async () => {
    const ids = await Promise.all(Array.from({ length: 11 }, (_, index) => createSnapshot(20 + index)));
    await prisma.savedJob.createMany({ data: ids.slice(0, 10).map((jobSnapshotId) => ({ userId, jobSnapshotId })) });

    const duplicate = await saveJobForUser({ userId, jobSnapshotId: ids[0] });
    expect(duplicate.created).toBe(false);
    await unsaveJobForUser({ userId, jobSnapshotId: ids[0] });
    await expect(saveJobForUser({ userId, jobSnapshotId: ids[10] })).resolves.toMatchObject({ created: true });
    expect(await prisma.savedJob.count({ where: { userId } })).toBe(10);
  });

  it('cannot save another user private imported vacancy', async () => {
    const privateId = await createSnapshot(50, otherUserId);

    await expect(saveJobForUser({ userId, jobSnapshotId: privateId })).rejects.toMatchObject({
      code: 'INVALID_JOB_REFERENCE',
    });
  });
});
