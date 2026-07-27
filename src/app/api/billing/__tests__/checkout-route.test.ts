import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/shared/billing/errors';

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string } } | null,
  startCheckout: vi.fn(),
}));

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => mocks.session) } } }));
vi.mock('@/shared/lib/rate-limit', () => ({ applyRateLimit: vi.fn(async () => null), billingLimiter: null }));
vi.mock('@/shared/billing/checkout', () => ({ startCheckout: mocks.startCheckout }));

import { POST } from '@/app/api/billing/checkout/route';

function req(body: unknown = { offerId: 'PRO_MONTHLY' }) {
  return new Request('https://app.test/api/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: 'u1', email: 'u@test.dev' } };
  mocks.startCheckout.mockResolvedValue({ url: 'https://stripe.test/checkout' });
});

describe('POST /api/billing/checkout', () => {
  it('rejects an unauthenticated request', async () => {
    mocks.session = null;
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mocks.startCheckout).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const res = await POST(req({ nope: true }));
    expect(res.status).toBe(400);
  });

  it('returns the hosted checkout URL for a valid offer', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://stripe.test/checkout');
    expect(mocks.startCheckout).toHaveBeenCalledWith('u1', 'PRO_MONTHLY', 'u@test.dev');
  });

  it('maps a domain BillingError to a safe typed response', async () => {
    mocks.startCheckout.mockRejectedValue(new BillingError('ALREADY_SUBSCRIBED', 'has one'));
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_SUBSCRIBED');
  });
});
