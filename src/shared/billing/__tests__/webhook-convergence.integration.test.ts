// Real-PostgreSQL proof of webhook convergence.
//
// The unit suite proves the convergence logic against an in-memory stand-in, but
// only a real database can prove that `pg_advisory_xact_lock` actually serialises
// two webhook deliveries racing to create the same subscription-backed purchase,
// and that the unique constraints behave as the recovery path assumes. This suite
// therefore talks to the live local Postgres and is SKIPPED unless DATABASE_URL
// points at a local host — it never runs against a remote/production database,
// and it seeds and tears down its own throwaway user so it cannot touch anyone
// else's data.
//
// Run it with the local database URL, e.g.
//   DATABASE_URL='postgresql://align:align@localhost:5433/align?schema=public' \
//     npx vitest run src/shared/billing/__tests__/webhook-convergence.integration.test.ts

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ProviderPurchaseSnapshot, VerifiedBillingEvent } from '../provider-contract';

const url = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);

const { prisma } = isLocalDb ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { processVerifiedEvent } = await import('../webhook-handler');
const { __setBillingLogSink } = await import('../logging');

const PRICE = 'price_pro_monthly_integration';
const NOW = new Date('2026-07-27T12:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe.skipIf(!isLocalDb)('webhook convergence — real Postgres', () => {
  let userId: string;
  let accountId: string;
  let subscriptionId: string;
  let live: ProviderPurchaseSnapshot;
  let logs: Array<Record<string, unknown>>;
  let restoreSink: () => void;

  const adapter = () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ getPurchase: vi.fn(async () => live) }) as any;

  function snapshot(overrides: Partial<ProviderPurchaseSnapshot> = {}): ProviderPurchaseSnapshot {
    return {
      providerPurchaseId: subscriptionId,
      providerCustomerId: `cus_${userId}`,
      providerSubscriptionId: subscriptionId,
      providerPriceId: PRICE,
      status: 'ACTIVE',
      currentPeriodStart: days(0),
      currentPeriodEnd: days(30),
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      ...overrides,
    };
  }

  function event(id: string, overrides: Partial<VerifiedBillingEvent> = {}): VerifiedBillingEvent {
    return {
      provider: 'STRIPE',
      providerEventId: id,
      type: 'PURCHASE_CREATED',
      occurredAt: NOW,
      customerRef: `cus_${userId}`,
      subscriptionRef: subscriptionId,
      userRef: userId,
      accountRef: accountId,
      ...overrides,
    };
  }

  const purchases = () => prisma.billingPurchase.findMany({ where: { billingAccountId: accountId } });
  const receiptsFor = (ids: string[]) =>
    prisma.billingEventReceipt.findMany({ where: { provider: 'STRIPE', providerEventId: { in: ids } } });

  beforeAll(async () => {
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = PRICE;
    userId = `test_wh_${randomUUID()}`;
    await prisma.user.create({ data: { id: userId, name: 'Webhook Test', email: `${userId}@example.test` } });
    const account = await prisma.billingAccount.create({
      data: { userId, provider: 'STRIPE', providerCustomerId: `cus_${userId}` },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    // Cascades the billing account and its purchases.
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    subscriptionId = `sub_${randomUUID()}`;
    live = snapshot();
    await prisma.billingPurchase.deleteMany({ where: { billingAccountId: accountId } });
    logs = [];
    restoreSink = __setBillingLogSink((record) => logs.push(record));
  });

  afterEach(async () => {
    restoreSink();
    await prisma.billingEventReceipt.deleteMany({ where: { providerEventId: { startsWith: 'evt_it_' } } });
  });

  it('creates exactly one purchase for two concurrent distinct events', async () => {
    const ids = [`evt_it_checkout_${randomUUID()}`, `evt_it_subcreated_${randomUUID()}`];

    const [a, b] = await Promise.all([
      processVerifiedEvent(event(ids[0], { checkoutRef: `cs_${randomUUID()}` }), adapter()),
      processVerifiedEvent(event(ids[1], { purchaseRef: subscriptionId }), adapter()),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await purchases()).toHaveLength(1);

    const receipts = await receiptsFor(ids);
    expect(receipts).toHaveLength(2);
    expect(receipts.every((r) => r.outcome === 'processed' || r.outcome === 'ignored')).toBe(true);
    expect(logs.filter((l) => l.evt === 'webhook_failed')).toHaveLength(0);
    expect(logs.filter((l) => l.evt === 'access_upgraded')).toHaveLength(1);
  });

  it('holds under a burst of five concurrent events for one subscription', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `evt_it_burst_${i}_${randomUUID()}`);

    const results = await Promise.all(ids.map((id) => processVerifiedEvent(event(id), adapter())));

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await purchases()).toHaveLength(1);
    const receipts = await receiptsFor(ids);
    expect(receipts).toHaveLength(5);
    expect(receipts.every((r) => r.outcome !== 'failed')).toBe(true);
  });

  it('is idempotent when the same event is delivered concurrently with itself', async () => {
    const id = `evt_it_dupe_${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => processVerifiedEvent(event(id), adapter()))
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await purchases()).toHaveLength(1);
    expect(await receiptsFor([id])).toHaveLength(1);
  });

  it('reprocesses a failed receipt on retry and converges', async () => {
    const id = `evt_it_retry_${randomUUID()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failing = { getPurchase: vi.fn(async () => { throw new Error('provider down'); }) } as any;

    expect(await processVerifiedEvent(event(id), failing)).toEqual({ status: 500, outcome: 'failed' });
    expect((await receiptsFor([id]))[0]).toMatchObject({ outcome: 'failed' });

    expect(await processVerifiedEvent(event(id), adapter())).toEqual({ status: 200, outcome: 'processed' });
    expect((await receiptsFor([id]))[0]).toMatchObject({ outcome: 'processed' });
    expect(await purchases()).toHaveLength(1);

    expect(await processVerifiedEvent(event(id), adapter())).toEqual({ status: 200, outcome: 'duplicate' });
    expect(await purchases()).toHaveLength(1);
  });

  it('starts grace on payment failure and restores active access on recovery', async () => {
    const created = `evt_it_created_${randomUUID()}`;
    const failed = `evt_it_failed_${randomUUID()}`;
    const paid = `evt_it_paid_${randomUUID()}`;

    await processVerifiedEvent(event(created), adapter());

    live = snapshot({ status: 'PAST_DUE', currentPeriodEnd: days(1) });
    await processVerifiedEvent(
      event(failed, { type: 'PAYMENT_FAILED', occurredAt: new Date(NOW.getTime() + 10_000) }),
      adapter()
    );
    const pastDue = (await purchases())[0];
    expect(pastDue.status).toBe('PAST_DUE');
    expect(pastDue.graceEndsAt).not.toBeNull();

    live = snapshot({ status: 'ACTIVE', currentPeriodStart: days(1), currentPeriodEnd: days(31) });
    await processVerifiedEvent(
      event(paid, { type: 'PAYMENT_SUCCEEDED', occurredAt: new Date(NOW.getTime() + 20_000) }),
      adapter()
    );
    const recovered = (await purchases())[0];
    expect(recovered.status).toBe('ACTIVE');
    expect(recovered.graceEndsAt).toBeNull();
    expect(recovered.id).toBe(pastDue.id);
  });

  // ── Invoice events arriving before any purchase row exists ──────────────────
  // An invoice event carries NO checkout metadata, so ownership must come from the
  // customer binding on BillingAccount. These run against the real
  // `@@index([provider, providerCustomerId])` lookup and the real advisory lock.

  /** An invoice-derived event: a customer and a subscription, and nothing else. */
  const invoice = (id: string, overrides: Partial<VerifiedBillingEvent> = {}) =>
    event(id, { type: 'PAYMENT_SUCCEEDED', userRef: undefined, accountRef: undefined, ...overrides });

  it('creates the purchase from an invoice that arrives before every other event', async () => {
    const id = `evt_it_invoice_first_${randomUUID()}`;

    const result = await processVerifiedEvent(invoice(id), adapter());

    expect(result).toEqual({ status: 200, outcome: 'processed' });
    const rows = await purchases();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ACTIVE', planId: 'PRO', providerSubscriptionId: subscriptionId });
    expect(logs.filter((l) => l.evt === 'purchase_created')).toHaveLength(1);
    expect(logs.filter((l) => l.evt === 'webhook_processed')[0]).toMatchObject({ accountSource: 'account_customer' });
  });

  it('converges a later subscription.created onto the invoice-created purchase', async () => {
    const first = `evt_it_invoice_lead_${randomUUID()}`;
    const second = `evt_it_sub_follow_${randomUUID()}`;

    await processVerifiedEvent(invoice(first), adapter());
    const created = (await purchases())[0];

    const follow = await processVerifiedEvent(
      event(second, { purchaseRef: subscriptionId, occurredAt: new Date(NOW.getTime() + 10_000) }),
      adapter()
    );

    expect(follow).toEqual({ status: 200, outcome: 'processed' });
    const rows = await purchases();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
  });

  it('creates exactly one purchase when an invoice and a subscription event race', async () => {
    const ids = [`evt_it_race_invoice_${randomUUID()}`, `evt_it_race_sub_${randomUUID()}`];

    const results = await Promise.all([
      processVerifiedEvent(invoice(ids[0]), adapter()),
      processVerifiedEvent(event(ids[1], { purchaseRef: subscriptionId }), adapter()),
    ]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.some((r) => r.outcome === 'failed')).toBe(false);
    expect(await purchases()).toHaveLength(1);
    expect(logs.filter((l) => l.evt === 'purchase_created')).toHaveLength(1);
  });

  it('initialises past-due with grace from an early payment failure, then recovers', async () => {
    const failed = `evt_it_early_failed_${randomUUID()}`;
    const paid = `evt_it_early_paid_${randomUUID()}`;

    live = snapshot({ status: 'PAST_DUE', currentPeriodEnd: days(1) });
    expect(await processVerifiedEvent(invoice(failed, { type: 'PAYMENT_FAILED' }), adapter())).toEqual({
      status: 200,
      outcome: 'processed',
    });
    const pastDue = (await purchases())[0];
    expect(pastDue.status).toBe('PAST_DUE');
    expect(pastDue.graceEndsAt).not.toBeNull();

    live = snapshot({ status: 'ACTIVE', currentPeriodStart: days(1), currentPeriodEnd: days(31) });
    await processVerifiedEvent(invoice(paid, { occurredAt: new Date(NOW.getTime() + 10_000) }), adapter());

    const recovered = (await purchases())[0];
    expect(recovered.id).toBe(pastDue.id);
    expect(recovered.status).toBe('ACTIVE');
    expect(recovered.graceEndsAt).toBeNull();
    expect(await purchases()).toHaveLength(1);
  });

  it('grants nothing for an invoice whose customer is bound to no account', async () => {
    const id = `evt_it_stranger_${randomUUID()}`;
    live = snapshot({ providerCustomerId: `cus_stranger_${randomUUID()}` });

    const result = await processVerifiedEvent(invoice(id, { customerRef: 'cus_stranger' }), adapter());

    expect(result).toEqual({ status: 200, outcome: 'ignored' });
    expect(await purchases()).toHaveLength(0);
    expect(await prisma.billingPurchase.count({ where: { providerSubscriptionId: subscriptionId } })).toBe(0);
  });

  it('refuses an event claiming a user other than the customer is bound to', async () => {
    const otherUserId = `test_wh_other_${randomUUID()}`;
    await prisma.user.create({ data: { id: otherUserId, name: 'Other', email: `${otherUserId}@example.test` } });
    const other = await prisma.billingAccount.create({
      data: { userId: otherUserId, provider: 'STRIPE', providerCustomerId: `cus_${otherUserId}` },
    });
    const id = `evt_it_hijack_${randomUUID()}`;

    try {
      // The live subscription's customer belongs to the first user; the metadata
      // claims the second. Nothing may be granted to either.
      const result = await processVerifiedEvent(
        event(id, { userRef: otherUserId, accountRef: other.id }),
        adapter()
      );

      expect(result).toEqual({ status: 200, outcome: 'failed' });
      expect(await purchases()).toHaveLength(0);
      expect(await prisma.billingPurchase.count({ where: { billingAccountId: other.id } })).toBe(0);
      expect(logs.filter((l) => l.evt === 'ownership_conflict')).toHaveLength(1);
    } finally {
      await prisma.user.delete({ where: { id: otherUserId } }).catch(() => {});
    }
  });

  it('grants nothing for an unknown provider price', async () => {
    const id = `evt_it_unknown_${randomUUID()}`;
    live = snapshot({ providerPriceId: 'price_not_ours' });

    const result = await processVerifiedEvent(event(id), adapter());
    expect(result).toEqual({ status: 200, outcome: 'failed' });
    expect(await purchases()).toHaveLength(0);
  });
});
