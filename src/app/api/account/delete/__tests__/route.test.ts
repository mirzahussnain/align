import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteUser: vi.fn(),
  applyRateLimit: vi.fn(),
  resolveBillingAccess: vi.fn(),
}));

vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession, deleteUser: mocks.deleteUser } },
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  applyRateLimit: mocks.applyRateLimit,
  accountActionLimiter: {},
}));
vi.mock('@/shared/billing/access', () => ({
  resolveBillingAccess: mocks.resolveBillingAccess,
}));

import { ActiveSubscriptionBlocksDeletionError } from '@/shared/account-deletion/errors';
import { POST } from '../route';

async function post(body?: unknown) {
  const response = await POST(
    new Request('https://align.test/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: response.status, body: await response.json() };
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'u1' } });
    mocks.applyRateLimit.mockResolvedValue(null);
    mocks.deleteUser.mockResolvedValue({ success: true, message: 'User deleted' });
  });

  it('requires an authenticated session', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await post()).toMatchObject({ status: 401 });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('requires strict exact confirmation before delegation', async () => {
    expect(await post({ confirmation: 'delete' })).toMatchObject({ status: 400 });
    expect(await post({ confirmation: 'DELETE', extra: true })).toMatchObject({ status: 400 });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('delegates password verification and deletion to Better Auth', async () => {
    expect(await post({ confirmation: 'DELETE', password: 'current-password' })).toEqual({
      status: 200,
      body: { deleted: true },
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { password: 'current-password' } })
    );
  });

  it('rate-limits before invoking Better Auth deletion', async () => {
    mocks.applyRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ code: 'RATE_LIMIT_EXCEEDED' }), { status: 429 })
    );

    expect(await post({ confirmation: 'DELETE' })).toMatchObject({ status: 429 });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('maps Better Auth stale-session failures to reauthentication', async () => {
    mocks.deleteUser.mockRejectedValue({ body: { code: 'SESSION_EXPIRED' } });

    expect(await post({ confirmation: 'DELETE' })).toEqual({
      status: 401,
      body: { code: 'RECENT_AUTHENTICATION_REQUIRED' },
    });
  });

  it('maps active billing to a safe actionable response', async () => {
    const paidThrough = new Date('2026-10-01T00:00:00.000Z');
    mocks.deleteUser.mockRejectedValue(
      new ActiveSubscriptionBlocksDeletionError(paidThrough, 'CANCELLED_ACTIVE')
    );
    mocks.resolveBillingAccess.mockResolvedValue({ portalAvailable: true });

    const result = await post({ confirmation: 'DELETE' });
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION',
      paidThrough: paidThrough.toISOString(),
      status: 'CANCELLED_ACTIVE',
      portalAvailable: true,
    });
  });
});
