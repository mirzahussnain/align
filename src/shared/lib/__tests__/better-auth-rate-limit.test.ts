import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createBetterAuthRateLimitStorage } from '../better-auth-rate-limit';

describe('Better Auth distributed rate-limit storage', () => {
  it('uses one atomic consume operation and rejects requests above the rule', async () => {
    const evalCommand = vi
      .fn()
      .mockResolvedValueOnce([1, 60])
      .mockResolvedValueOnce([2, 58])
      .mockResolvedValueOnce([3, 57]);
    const storage = createBetterAuthRateLimitStorage({
      eval: evalCommand,
      get: vi.fn(),
      set: vi.fn(),
    } as never);
    expect(storage).toBeDefined();
    if (!storage) throw new Error('Expected configured storage');

    await expect(storage.consume?.('verify-email/ip', { window: 60, max: 2 }))
      .resolves.toEqual({ allowed: true, retryAfter: null });
    await expect(storage.consume?.('verify-email/ip', { window: 60, max: 2 }))
      .resolves.toEqual({ allowed: true, retryAfter: null });
    await expect(storage.consume?.('verify-email/ip', { window: 60, max: 2 }))
      .resolves.toEqual({ allowed: false, retryAfter: 57 });

    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      ['align:better-auth:rate-limit:verify-email/ip'],
      ['60']
    );
  });
});
