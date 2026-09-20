import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const sendLifecycleEmail = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/shared/email/resend', () => ({ sendLifecycleEmail }));

const databaseUrl = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(databaseUrl);
const { prisma } = isLocalDb
  ? await import('@/shared/lib/prisma')
  : { prisma: null as never };
const { sendWelcomeEmailOnce } = await import('../welcome-email');

const createdUsers = new Set<string>();

async function seedWelcomeUser() {
  const userId = `test_welcome_${randomUUID()}`;
  createdUsers.add(userId);
  return prisma.user.create({
    data: {
      id: userId,
      name: 'Welcome Integration',
      email: `${userId}@example.test`,
      emailVerified: true,
    },
  });
}

describe.skipIf(!isLocalDb)('welcome email — real Postgres concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendLifecycleEmail.mockResolvedValue(undefined);
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

  it('collapses concurrent welcome claims and records sent only after acceptance', async () => {
    const user = await seedWelcomeUser();

    await expect(
      Promise.all([sendWelcomeEmailOnce(user), sendWelcomeEmailOnce(user)])
    ).resolves.toEqual(['sent', 'already_sent']);
    expect(sendLifecycleEmail).toHaveBeenCalledTimes(1);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    ).resolves.toMatchObject({ welcomeEmailSentAt: expect.any(Date) });
  });

  it('leaves the claim unset after delivery failure and permits a retry', async () => {
    const user = await seedWelcomeUser();
    sendLifecycleEmail.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(sendWelcomeEmailOnce(user)).rejects.toThrow('provider unavailable');
    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({
      welcomeEmailSentAt: null,
    });

    await expect(sendWelcomeEmailOnce(user)).resolves.toBe('sent');
    expect(sendLifecycleEmail).toHaveBeenCalledTimes(2);
  });
});
