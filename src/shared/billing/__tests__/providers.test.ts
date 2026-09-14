import { describe, expect, it } from 'vitest';
import {
  BILLING_PROVIDERS,
  enabledProviderIds,
  resolveProviderAdapter,
} from '../providers';
import { BILLING_PROVIDER_IDS, type BillingProviderAdapter } from '../provider-contract';
import { StripeBillingProvider } from '../stripe-provider';
import { BillingError } from '../errors';

describe('billing provider registry', () => {
  it('resolves Stripe through the registry, not by direct instantiation', () => {
    const adapter = resolveProviderAdapter('STRIPE');
    expect(adapter.id).toBe('STRIPE');
    expect(adapter).toBeInstanceOf(StripeBillingProvider);
  });

  it('rejects an unsupported provider', () => {
    expect(() => resolveProviderAdapter('PADDLE')).toThrow(BillingError);
    expect(() => resolveProviderAdapter('PADDLE')).toThrow(/Unsupported billing provider/);
    expect(() => resolveProviderAdapter(undefined)).toThrow(/Unsupported billing provider/);
  });

  it('lists STRIPE as the only enabled launch provider', () => {
    expect([...BILLING_PROVIDER_IDS]).toEqual(['STRIPE']);
    expect(enabledProviderIds()).toEqual(['STRIPE']);
  });

  it('fails only provider-specific paths when Stripe config is missing', async () => {
    const previous = { key: process.env.STRIPE_SECRET_KEY, hook: process.env.STRIPE_WEBHOOK_SECRET };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      expect(BILLING_PROVIDERS.STRIPE.isConfigured()).toBe(false);
      // Constructing/listing the adapter never requires config…
      const adapter = resolveProviderAdapter('STRIPE');
      expect(adapter.id).toBe('STRIPE');
      // …only an actual provider call fails, and clearly (never an opaque SDK error).
      await expect(
        adapter.createCheckout({
          userId: 'u1',
          billingAccountId: 'acc1',
          offerId: 'PRO_MONTHLY',
          planId: 'PRO',
          providerPriceId: 'price_x',
          successUrl: 's',
          cancelUrl: 'c',
        })
      ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    } finally {
      if (previous.key) process.env.STRIPE_SECRET_KEY = previous.key;
      if (previous.hook) process.env.STRIPE_WEBHOOK_SECRET = previous.hook;
    }
  });

  it('surfaces a stable PROVIDER_NOT_CONFIGURED on every provider path when unconfigured', async () => {
    const previous = { key: process.env.STRIPE_SECRET_KEY, hook: process.env.STRIPE_WEBHOOK_SECRET };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const adapter: BillingProviderAdapter = new StripeBillingProvider();
      await expect(adapter.verifyWebhook(new Request('https://x'))).rejects.toMatchObject({
        code: 'PROVIDER_NOT_CONFIGURED',
      });
      await expect(
        adapter.createCustomerPortal({ userId: 'u', providerCustomerId: 'c', returnUrl: 'r' })
      ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    } finally {
      if (previous.key) process.env.STRIPE_SECRET_KEY = previous.key;
      if (previous.hook) process.env.STRIPE_WEBHOOK_SECRET = previous.hook;
    }
  });
});
