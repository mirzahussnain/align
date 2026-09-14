import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  subRetrieve: vi.fn(),
  subUpdate: vi.fn(),
  subCancel: vi.fn(),
  custRetrieve: vi.fn(),
  custCreate: vi.fn(),
  constructEventAsync: vi.fn(),
}));

vi.mock('stripe', () => {
  class StripeError extends Error {
    type = 'StripeError';
    code?: string;
  }
  class Stripe {
    static errors = { StripeError };
    checkout = { sessions: { create: sdk.checkoutCreate } };
    billingPortal = { sessions: { create: sdk.portalCreate } };
    subscriptions = { retrieve: sdk.subRetrieve, update: sdk.subUpdate, cancel: sdk.subCancel };
    customers = { retrieve: sdk.custRetrieve, create: sdk.custCreate };
    webhooks = { constructEventAsync: sdk.constructEventAsync };
  }
  return { default: Stripe };
});

import { StripeBillingProvider } from '../stripe-provider';

const SECONDS = (d: string) => Math.floor(new Date(d).getTime() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
});

function webhookRequest(signature: string | null, body = 'raw-event-body') {
  const headers = new Headers();
  if (signature !== null) headers.set('stripe-signature', signature);
  return new Request('https://app.test/api/billing/webhook', { method: 'POST', headers, body });
}

describe('StripeBillingProvider.verifyWebhook', () => {
  it('verifies against the RAW body + signature and maps a checkout.session.completed event', async () => {
    sdk.constructEventAsync.mockResolvedValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: SECONDS('2026-07-27T12:00:00Z'),
      data: { object: { customer: 'cus_1', subscription: 'sub_1', metadata: { userId: 'u1', billingAccountId: 'acc1' } } },
    });
    const adapter = new StripeBillingProvider();
    const event = await adapter.verifyWebhook(webhookRequest('sig_abc'));

    // Raw body + signature + secret were used (never a parsed object).
    expect(sdk.constructEventAsync).toHaveBeenCalledWith('raw-event-body', 'sig_abc', 'whsec_123');
    expect(event).toMatchObject({
      provider: 'STRIPE',
      providerEventId: 'evt_1',
      type: 'PURCHASE_CREATED',
      customerRef: 'cus_1',
      subscriptionRef: 'sub_1',
      userRef: 'u1',
      accountRef: 'acc1',
    });
  });

  it('rejects a missing signature header without calling Stripe', async () => {
    const adapter = new StripeBillingProvider();
    await expect(adapter.verifyWebhook(webhookRequest(null))).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    expect(sdk.constructEventAsync).not.toHaveBeenCalled();
  });

  it('rejects a bad signature as WEBHOOK_SIGNATURE_INVALID', async () => {
    sdk.constructEventAsync.mockRejectedValue(new Error('signature mismatch'));
    const adapter = new StripeBillingProvider();
    await expect(adapter.verifyWebhook(webhookRequest('sig_bad'))).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
  });

  it('rejects a verified-but-unsupported event type', async () => {
    sdk.constructEventAsync.mockResolvedValue({ id: 'evt_2', type: 'payout.paid', created: 1, data: { object: {} } });
    const adapter = new StripeBillingProvider();
    await expect(adapter.verifyWebhook(webhookRequest('sig'))).rejects.toMatchObject({
      code: 'WEBHOOK_EVENT_UNSUPPORTED',
    });
  });

  it('maps a subscription event with item-level period fields', async () => {
    sdk.constructEventAsync.mockResolvedValue({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      created: SECONDS('2026-07-27T12:00:00Z'),
      data: {
        object: {
          id: 'sub_9',
          customer: 'cus_9',
          status: 'active',
          metadata: { userId: 'u9', billingAccountId: 'acc9' },
          items: { data: [{ price: { id: 'price_9' } }] },
        },
      },
    });
    const adapter = new StripeBillingProvider();
    const event = await adapter.verifyWebhook(webhookRequest('sig'));
    expect(event).toMatchObject({ type: 'PURCHASE_UPDATED', subscriptionRef: 'sub_9', priceRef: 'price_9', status: 'active' });
  });

  it('carries the checkout session as a link only, never as the subscription to fetch', async () => {
    sdk.constructEventAsync.mockResolvedValue({
      id: 'evt_link',
      type: 'checkout.session.completed',
      created: SECONDS('2026-07-27T12:00:00Z'),
      data: { object: { id: 'cs_test_1', customer: 'cus_1', subscription: 'sub_1', metadata: {} } },
    });
    const event = await new StripeBillingProvider().verifyWebhook(webhookRequest('sig'));

    expect(event.checkoutRef).toBe('cs_test_1');
    expect(event.subscriptionRef).toBe('sub_1');
    // `purchaseRef` is the handler's fallback subscription id — a `cs_…` id there
    // would be fetched as a subscription and always fail.
    expect(event.purchaseRef).toBeUndefined();
  });

  it('resolves the invoice subscription from parent.subscription_details', async () => {
    sdk.constructEventAsync.mockResolvedValue({
      id: 'evt_inv',
      type: 'invoice.paid',
      created: SECONDS('2026-07-27T12:00:00Z'),
      data: {
        object: {
          customer: 'cus_1',
          parent: { subscription_details: { subscription: 'sub_paid' } },
        },
      },
    });
    const event = await new StripeBillingProvider().verifyWebhook(webhookRequest('sig'));
    expect(event).toMatchObject({ type: 'PAYMENT_SUCCEEDED', subscriptionRef: 'sub_paid' });
  });

  it('falls back to a line item when the invoice has no top-level subscription', async () => {
    sdk.constructEventAsync.mockResolvedValue({
      id: 'evt_inv2',
      type: 'invoice.payment_failed',
      created: SECONDS('2026-07-27T12:00:00Z'),
      data: {
        object: {
          customer: 'cus_1',
          parent: null,
          lines: { data: [{ parent: { subscription_item_details: { subscription: 'sub_line' } } }] },
        },
      },
    });
    const event = await new StripeBillingProvider().verifyWebhook(webhookRequest('sig'));
    // Payment recovery depends on this resolving — an unresolved invoice is ignored.
    expect(event).toMatchObject({ type: 'PAYMENT_FAILED', subscriptionRef: 'sub_line' });
  });

  it('leaves the subscription unset when an invoice names none', async () => {
    sdk.constructEventAsync.mockResolvedValue({
      id: 'evt_inv3',
      type: 'invoice.paid',
      created: SECONDS('2026-07-27T12:00:00Z'),
      data: { object: { customer: 'cus_1', lines: { data: [{}] } } },
    });
    const event = await new StripeBillingProvider().verifyWebhook(webhookRequest('sig'));
    expect(event.subscriptionRef).toBeUndefined();
  });
});

describe('StripeBillingProvider.getPurchase', () => {
  it('maps a subscription to an internal snapshot with item-level period dates', async () => {
    sdk.subRetrieve.mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: true,
      trial_end: null,
      items: {
        data: [
          {
            price: { id: 'price_1' },
            current_period_start: SECONDS('2026-07-01T00:00:00Z'),
            current_period_end: SECONDS('2026-08-01T00:00:00Z'),
          },
        ],
      },
    });
    const adapter = new StripeBillingProvider();
    const snap = await adapter.getPurchase('sub_1');
    expect(snap).toMatchObject({
      providerSubscriptionId: 'sub_1',
      providerCustomerId: 'cus_1',
      providerPriceId: 'price_1',
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
    });
    expect(snap.currentPeriodEnd?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('maps a flexible-billing-mode portal cancellation, where cancel_at_period_end stays false', async () => {
    // Captured from a live test-mode subscription after a Customer Portal
    // cancellation: billing_mode.type = 'flexible', the boolean is FALSE, and the
    // real signal is cancel_at === the item's current_period_end.
    const periodEnd = SECONDS('2026-08-27T11:26:18Z');
    sdk.subRetrieve.mockResolvedValue({
      id: 'sub_flex',
      customer: 'cus_flex',
      status: 'active',
      billing_mode: { type: 'flexible' },
      cancel_at_period_end: false,
      cancel_at: periodEnd,
      canceled_at: SECONDS('2026-07-27T11:42:36Z'),
      trial_end: null,
      items: { data: [{ price: { id: 'price_1' }, current_period_start: SECONDS('2026-07-27T11:26:18Z'), current_period_end: periodEnd }] },
    });
    const snapshot = await new StripeBillingProvider().getPurchase('sub_flex');

    expect(snapshot.cancelAtPeriodEnd).toBe(true);
    expect(snapshot.cancelAt).toEqual(new Date('2026-08-27T11:26:18Z'));
    expect(snapshot.currentPeriodEnd).toEqual(new Date('2026-08-27T11:26:18Z'));
    // Still ACTIVE — a scheduled cancellation must not cancel access early.
    expect(snapshot.status).toBe('ACTIVE');
  });

  it('maps a classic-billing-mode cancellation, where the boolean is set', async () => {
    const periodEnd = SECONDS('2026-08-27T11:26:18Z');
    sdk.subRetrieve.mockResolvedValue({
      id: 'sub_classic',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: true,
      cancel_at: periodEnd,
      trial_end: null,
      items: { data: [{ price: { id: 'price_1' }, current_period_end: periodEnd }] },
    });
    const snapshot = await new StripeBillingProvider().getPurchase('sub_classic');
    expect(snapshot.cancelAtPeriodEnd).toBe(true);
  });

  it('reports no scheduled cancellation for a plain active subscription', async () => {
    sdk.subRetrieve.mockResolvedValue({
      id: 'sub_plain',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      trial_end: null,
      items: { data: [{ price: { id: 'price_1' }, current_period_end: SECONDS('2026-08-27T11:26:18Z') }] },
    });
    const snapshot = await new StripeBillingProvider().getPurchase('sub_plain');
    expect(snapshot.cancelAtPeriodEnd).toBe(false);
    expect(snapshot.cancelAt).toBeNull();
  });

  it('does not flag end-of-period when the cancellation is scheduled beyond it', async () => {
    // A cancel_at in a LATER period means the subscription still renews at least
    // once — the date travels on cancelAt, but this period is not the last.
    sdk.subRetrieve.mockResolvedValue({
      id: 'sub_future',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      cancel_at: SECONDS('2026-12-01T00:00:00Z'),
      trial_end: null,
      items: { data: [{ price: { id: 'price_1' }, current_period_end: SECONDS('2026-08-27T11:26:18Z') }] },
    });
    const snapshot = await new StripeBillingProvider().getPurchase('sub_future');
    expect(snapshot.cancelAtPeriodEnd).toBe(false);
    expect(snapshot.cancelAt).toEqual(new Date('2026-12-01T00:00:00Z'));
  });
});

describe('StripeBillingProvider.createCheckout', () => {
  it('creates a subscription-mode session with server metadata and an idempotency key', async () => {
    sdk.checkoutCreate.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/checkout' });
    const adapter = new StripeBillingProvider();
    const result = await adapter.createCheckout({
      userId: 'u1',
      billingAccountId: 'acc1',
      offerId: 'PRO_MONTHLY',
      planId: 'PRO',
      providerPriceId: 'price_1',
      providerCustomerId: 'cus_1',
      successUrl: 'https://app.test/s',
      cancelUrl: 'https://app.test/c',
      idempotencyKey: 'checkout:STRIPE:u1:PRO_MONTHLY',
    });
    expect(result).toEqual({ url: 'https://stripe.test/checkout', providerCheckoutId: 'cs_1' });
    const [params, options] = sdk.checkoutCreate.mock.calls[0];
    expect(params).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_1', quantity: 1 }],
      customer: 'cus_1',
      metadata: { userId: 'u1', billingAccountId: 'acc1', offerId: 'PRO_MONTHLY', planId: 'PRO' },
      allow_promotion_codes: false,
    });
    expect(options).toEqual({ idempotencyKey: 'checkout:STRIPE:u1:PRO_MONTHLY' });
  });
});
