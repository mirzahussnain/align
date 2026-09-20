import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeRawUnsafe: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  sendLifecycleEmail: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/shared/email/resend', () => ({
  sendLifecycleEmail: mocks.sendLifecycleEmail,
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@/shared/lib/prisma';
import { sendWelcomeEmailOnce } from '../welcome-email';

const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

function transactionClient() {
  return {
    $executeRawUnsafe: mocks.executeRawUnsafe,
    user: { findUnique: mocks.findUnique, update: mocks.update },
  };
}

describe('sendWelcomeEmailOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transactionClient() as never)
    );
    mocks.findUnique.mockResolvedValue({ welcomeEmailSentAt: null });
    mocks.update.mockResolvedValue({});
    mocks.sendLifecycleEmail.mockResolvedValue(undefined);
  });

  it('does not mark delivery complete when the provider rejects it', async () => {
    mocks.sendLifecycleEmail.mockRejectedValueOnce(new Error('EMAIL_DELIVERY_FAILED'));

    await expect(sendWelcomeEmailOnce(user)).rejects.toThrow('EMAIL_DELIVERY_FAILED');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('uses a stable provider idempotency key and records acceptance afterwards', async () => {
    await expect(sendWelcomeEmailOnce(user)).resolves.toBe('sent');

    expect(mocks.sendLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email, idempotencyKey: 'welcome/u1' })
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.sendLifecycleEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0]
    );
  });

  it('collapses concurrent attempts after the first accepted delivery', async () => {
    let welcomeEmailSentAt: Date | null = null;
    let queue = Promise.resolve();
    vi.mocked(prisma.$transaction).mockImplementation((callback) => {
      const result = queue.then(() => callback(transactionClient() as never));
      queue = result.then(() => undefined, () => undefined);
      return result as never;
    });
    mocks.findUnique.mockImplementation(async () => ({ welcomeEmailSentAt }));
    mocks.update.mockImplementation(async ({ data }) => {
      welcomeEmailSentAt = data.welcomeEmailSentAt;
      return {};
    });

    await expect(
      Promise.all([sendWelcomeEmailOnce(user), sendWelcomeEmailOnce(user)])
    ).resolves.toEqual(['sent', 'already_sent']);
    expect(mocks.sendLifecycleEmail).toHaveBeenCalledTimes(1);
  });
});
