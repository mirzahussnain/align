import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn(),
  sendLifecycleEmail: vi.fn(),
  sendWelcomeEmailOnce: vi.fn(),
  prepareAccountDeletion: vi.fn(),
  createStorage: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), consume: vi.fn() })),
}));

vi.mock('server-only', () => ({}));
vi.mock('better-auth', () => ({ betterAuth: vi.fn((options) => ({ options })) }));
vi.mock('better-auth/api', () => ({ createAuthMiddleware: vi.fn((handler) => handler) }));
vi.mock('better-auth/adapters/prisma', () => ({ prismaAdapter: vi.fn(() => ({})) }));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { account: { findFirst: mocks.findAccount } },
}));
vi.mock('@/shared/email/resend', () => ({ sendLifecycleEmail: mocks.sendLifecycleEmail }));
vi.mock('@/shared/email/templates/lifecycle', () => ({
  verificationEmail: vi.fn((input) => ({ subject: 'verify', html: input.url, text: input.url })),
  passwordResetEmail: vi.fn((input) => ({ subject: 'reset', html: input.url, text: input.url })),
  passwordChangedEmail: vi.fn(() => ({ subject: 'changed', html: 'changed', text: 'changed' })),
  accountDeletedEmail: vi.fn(() => ({ subject: 'deleted', html: 'deleted', text: 'deleted' })),
}));
vi.mock('@/shared/services/welcome-email', () => ({
  sendWelcomeEmailOnce: mocks.sendWelcomeEmailOnce,
}));
vi.mock('@/shared/account-deletion/service', () => ({
  prepareAccountDeletion: mocks.prepareAccountDeletion,
}));
vi.mock('../better-auth-rate-limit', () => ({
  createBetterAuthRateLimitStorage: mocks.createStorage,
  BETTER_AUTH_RATE_LIMIT_RULES: {},
}));

import { authOptions } from '../auth';

const user = {
  id: 'u1',
  email: 'ada@example.com',
  emailVerified: false,
  name: 'Ada',
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Better Auth lifecycle configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendLifecycleEmail.mockResolvedValue(undefined);
    mocks.sendWelcomeEmailOnce.mockResolvedValue('sent');
  });

  it('wires Better Auth deletion around the authoritative cleanup boundary', async () => {
    expect(authOptions.user?.deleteUser?.enabled).toBe(true);

    await authOptions.user?.deleteUser?.beforeDelete?.(user);
    expect(mocks.prepareAccountDeletion).toHaveBeenCalledWith(user);

    await authOptions.user?.deleteUser?.afterDelete?.(user);
    expect(mocks.sendLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email })
    );
  });

  it('enables signup verification and session-safe password reset', () => {
    expect(authOptions.emailVerification?.sendOnSignUp).toBe(true);
    expect(authOptions.emailVerification?.autoSignInAfterVerification).toBe(true);
    expect(authOptions.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it('does not send a credential reset email to a Google-only user', async () => {
    mocks.findAccount.mockResolvedValue(null);

    await authOptions.emailAndPassword?.sendResetPassword?.({
      user,
      url: 'https://align.test/reset',
      token: 'secret-token',
    });

    expect(mocks.sendLifecycleEmail).not.toHaveBeenCalled();
  });

  it('sends a credential reset through the lifecycle email boundary', async () => {
    mocks.findAccount.mockResolvedValue({ id: 'credential-account' });

    await authOptions.emailAndPassword?.sendResetPassword?.({
      user,
      url: 'https://align.test/reset',
      token: 'secret-token',
    });

    expect(mocks.sendLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email })
    );
  });

  it('keeps welcome delivery best-effort after verification', async () => {
    mocks.sendWelcomeEmailOnce.mockRejectedValueOnce(new Error('provider detail'));

    await expect(
      authOptions.emailVerification?.afterEmailVerification?.(user)
    ).resolves.toBeUndefined();
  });
});
