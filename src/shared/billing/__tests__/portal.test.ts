import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  customer: null as { provider: string; providerCustomerId: string } | null,
  configured: true,
  access: {} as Record<string, unknown>,
  purchase: null as Record<string, unknown> | null,
  createPortal: vi.fn(async () => ({ url: 'https://stripe.test/portal' })),
  cancelPurchase: vi.fn(async () => {}),
  updatePurchase: vi.fn(async () => ({})),
}));

vi.mock('../env', () => ({ getPublicAppUrl: vi.fn(() => 'https://app.test') }));
vi.mock('../providers', () => ({
  isProviderConfigured: vi.fn(() => mocks.configured),
  resolveProviderAdapter: vi.fn(() => ({
    createCustomerPortal: mocks.createPortal,
    cancelPurchase: mocks.cancelPurchase,
  })),
}));
vi.mock('../account', () => ({ getProviderCustomerId: vi.fn(async () => mocks.customer) }));
vi.mock('../access', () => ({ resolveBillingAccess: vi.fn(async () => mocks.access) }));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    billingPurchase: {
      findFirst: vi.fn(async () => mocks.purchase),
      update: mocks.updatePurchase,
    },
  },
}));

import { startPortal, cancelActiveSubscription } from '../portal';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.customer = { provider: 'STRIPE', providerCustomerId: 'cus_1' };
  mocks.access = { activePurchaseId: 'p1', source: 'RECURRING_PURCHASE', accessEndsAt: new Date('2026-08-27T00:00:00Z') };
  mocks.purchase = { id: 'p1', provider: 'STRIPE', providerSubscriptionId: 'sub_1' };
});

describe('startPortal', () => {
  it('rejects when the user has no provider customer', async () => {
    mocks.customer = null;
    await expect(startPortal('u1')).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('opens a portal session for the user’s own customer', async () => {
    const result = await startPortal('u1');
    expect(result.url).toBe('https://stripe.test/portal');
    expect(mocks.createPortal).toHaveBeenCalledWith(
      // Return users to the canonical route-backed billing settings view.
      expect.objectContaining({ providerCustomerId: 'cus_1', returnUrl: 'https://app.test/dashboard/settings/billing' })
    );
  });

  it('fails safely when the provider is not configured', async () => {
    mocks.configured = false;
    await expect(startPortal('u1')).rejects.toMatchObject({ code: 'PORTAL_UNAVAILABLE' });
  });
});

describe('cancelActiveSubscription', () => {
  it('schedules cancel-at-period-end and flags the purchase', async () => {
    const result = await cancelActiveSubscription('u1');
    expect(mocks.cancelPurchase).toHaveBeenCalledWith({ providerPurchaseId: 'sub_1', atPeriodEnd: true });
    expect(mocks.updatePurchase).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { cancelAtPeriodEnd: true } })
    );
    expect(result.accessEndsAt).toBe('2026-08-27T00:00:00.000Z');
  });

  it('rejects when there is no active subscription', async () => {
    mocks.access = { source: 'FREE_DEFAULT' };
    await expect(cancelActiveSubscription('u1')).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('rejects a subscription the user does not own', async () => {
    mocks.purchase = null; // ownership-scoped query returns nothing
    await expect(cancelActiveSubscription('u1')).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    expect(mocks.cancelPurchase).not.toHaveBeenCalled();
  });
});
