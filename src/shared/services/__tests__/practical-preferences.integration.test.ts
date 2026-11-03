import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? '';
const isLocalDatabase = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(databaseUrl);
const { prisma } = isLocalDatabase ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { savePracticalPreferences } = await import('@/shared/services/practical-preferences');

describe.skipIf(!isLocalDatabase)('practical preference persistence', () => {
  const firstUserId = `preferences_${randomUUID()}`;
  const secondUserId = `preferences_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: firstUserId, name: 'First User', email: `${firstUserId}@example.test` },
        { id: secondUserId, name: 'Second User', email: `${secondUserId}@example.test` },
      ],
    });
    await prisma.profilePracticalFacts.create({
      data: { userId: firstUserId, drivingLicenceHeld: true },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('creates preferences for an existing account without a practical-facts row', async () => {
    await savePracticalPreferences(secondUserId, {
      relocationPreference: 'CONSIDER',
      maxCommuteMinutes: 45,
      preferredWorkStyles: ['REMOTE', 'HYBRID'],
    });

    expect(await prisma.profilePracticalFacts.findUnique({ where: { userId: secondUserId } })).toMatchObject({
      relocationPreference: 'CONSIDER',
      maxCommuteMinutes: 45,
      preferredWorkStyles: ['REMOTE', 'HYBRID'],
    });
  });

  it('updates and clears preferences without changing unrelated practical facts or another user', async () => {
    await savePracticalPreferences(firstUserId, {
      relocationPreference: 'YES',
      maxCommuteMinutes: 30,
      preferredWorkStyles: ['ONSITE'],
    });
    await savePracticalPreferences(firstUserId, {
      relocationPreference: null,
      maxCommuteMinutes: null,
      preferredWorkStyles: [],
    });

    expect(await prisma.profilePracticalFacts.findUnique({ where: { userId: firstUserId } })).toMatchObject({
      relocationPreference: null,
      maxCommuteMinutes: null,
      preferredWorkStyles: [],
      drivingLicenceHeld: true,
    });
    expect(await prisma.profilePracticalFacts.findUnique({ where: { userId: secondUserId } })).toMatchObject({
      relocationPreference: 'CONSIDER',
      maxCommuteMinutes: 45,
      preferredWorkStyles: ['REMOTE', 'HYBRID'],
    });
  });
});
