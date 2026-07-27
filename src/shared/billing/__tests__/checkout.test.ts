import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configured: true,
  access: { effectivePlan: 'FREE', source: 'FREE_DEFAULT', status: 'FREE' } as Record<string, unknown>,
  account: { id: 'acc1', provider: null as string | null, providerCustomerId: null as string | null },
  customer: { providerCustomerId: 'cus_new', created: true },
  createCheckout: vi.fn(async () => ({ url: 'https://stripe.test/checkout', providerCheckoutId: 'cs_1' })),
  findOrCreateCustomer: vi.fn(async () => mocks.customer),
  setAccountCustomer: vi.fn(async () => {}),
}));

vi.mock('../env', () => ({
  getServerPriceId: vi.fn(() => 'price_pro_monthly'),
  getPublicAppUrl: vi.fn(() => 'https://app.test'),
}));
vi.mock('../providers', () => ({
  isProviderConfigured: vi.fn(() => mocks.configured),
  resolveProviderAdapter: vi.fn(() => ({
    findOrCreateCustomer: mocks.findOrCreateCustomer,
    createCheckout: mocks.createCheckout,
  })),
}));
vi.mock('../access', () => ({ resolveBillingAccess: vi.fn(async () => mocks.access) }));
vi.mock('../account', () => ({
  ensureBillingAccount: vi.fn(async () => mocks.account),
  setAccountCustomer: mocks.setAccountCustomer,
}));

import { startCheckout } from '../checkout';
import { BillingError } from '../errors';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.access = { effectivePlan: 'FREE', source: 'FREE_DEFAULT', status: 'FREE' };
  mocks.account = { id: 'acc1', provider: null, providerCustomerId: null };
  mocks.customer = { providerCustomerId: 'cus_new', created: true };
  mocks.createCheckout.mockResolvedValue({ url: 'https://stripe.test/checkout', providerCheckoutId: 'cs_1' });
  mocks.findOrCreateCustomer.mockResolvedValue(mocks.customer);
});

describe('startCheckout', () => {
  it('rejects an unknown offer id', async () => {
    await expect(startCheckout('u1', 'NOT_AN_OFFER')).rejects.toMatchObject({ code: 'UNKNOWN_OFFER' });
  });

  it('fails safely when the provider is not configured', async () => {
    mocks.configured = false;
    await expect(startCheckout('u1', 'PRO_MONTHLY')).rejects.toMatchObject({ code: 'BILLING_NOT_CONFIGURED' });
  });

  it('directs an already-subscribed user away from a second checkout', async () => {
    mocks.access = { effectivePlan: 'PRO', source: 'RECURRING_PURCHASE', status: 'ACTIVE' };
    await expect(startCheckout('u1', 'PRO_MONTHLY')).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED' });
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it('creates a checkout session with a server-resolved price and stable idempotency key', async () => {
    const result = await startCheckout('u1', 'PRO_MONTHLY', 'user@test.dev');
    expect(result.url).toBe('https://stripe.test/checkout');
    const arg = (mocks.createCheckout.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      userId: 'u1',
      billingAccountId: 'acc1',
      offerId: 'PRO_MONTHLY',
      planId: 'PRO',
      providerPriceId: 'price_pro_monthly',
      providerCustomerId: 'cus_new',
      idempotencyKey: 'checkout:STRIPE:u1:PRO_MONTHLY',
    });
    // The client never supplies a price/amount/customer — they are server-resolved.
    expect(arg).not.toHaveProperty('amount');
  });

  it('persists a newly created provider customer on the account', async () => {
    await startCheckout('u1', 'PRO_MONTHLY');
    expect(mocks.setAccountCustomer).toHaveBeenCalledWith('acc1', 'STRIPE', 'cus_new');
  });

  it('reuses an existing customer without rewriting it', async () => {
    mocks.account = { id: 'acc1', provider: 'STRIPE', providerCustomerId: 'cus_existing' };
    mocks.customer = { providerCustomerId: 'cus_existing', created: false };
    mocks.findOrCreateCustomer.mockResolvedValue(mocks.customer);
    await startCheckout('u1', 'PRO_MONTHLY');
    expect(mocks.findOrCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ existingCustomerId: 'cus_existing' })
    );
    expect(mocks.setAccountCustomer).not.toHaveBeenCalled();
  });

  it('throws a BillingError type for domain failures', async () => {
    await expect(startCheckout('u1', 'NOT_AN_OFFER')).rejects.toBeInstanceOf(BillingError);
  });
});
