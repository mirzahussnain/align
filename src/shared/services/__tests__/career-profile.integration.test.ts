import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
const { prisma } = isLocalDb ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { createProfileWithinPlanLimit } = await import('../career-profile');

describe.skipIf(!isLocalDb)('Career Profile limits with real PostgreSQL', () => {
  const userId = `test_profile_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: userId, name: 'Profile Test', email: `${userId}@example.test` },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('allows exactly one concurrent first profile on the Free plan', async () => {
    const outcomes = await Promise.allSettled([
      createProfileWithinPlanLimit({ userId, label: 'Engineering' }),
      createProfileWithinPlanLimit({ userId, label: 'Operations' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await prisma.profile.count({ where: { userId } })).toBe(1);
    expect(await prisma.profile.count({ where: { userId, isDefault: true } })).toBe(1);
  });
});
