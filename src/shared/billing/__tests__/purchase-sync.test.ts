import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderPurchaseSnapshot } from '../provider-contract';
import {
  syncPurchaseFromSnapshot,
  syncProviderPurchase,
  offerForProviderPrice,
  classifyPurchaseConflict,
  prismaErrorCode,
} from '../purchase-sync';

const PRICE = 'price_pro_monthly_test';
const NOW = new Date('2026-07-27T12:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

beforeEach(() => {
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = PRICE;
});

function snapshot(overrides: Partial<ProviderPurchaseSnapshot> = {}): ProviderPurchaseSnapshot {
  return {
    providerPurchaseId: 'sub_1',
    providerCustomerId: 'cus_1',
    providerSubscriptionId: 'sub_1',
    providerPriceId: PRICE,
    status: 'ACTIVE',
    currentPeriodStart: days(-1),
    currentPeriodEnd: days(29),
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    ...overrides,
  };
}

interface TxOpts {
  existing?: Record<string, unknown> | null;
  /** A row found only by (provider, providerPurchaseId) — the checkout-linked path. */
  byPurchaseRef?: Record<string, unknown> | null;
  byCustomer?: { billingAccountId: string } | null;
  accountByUser?: string | null;
  /** A BillingAccount bound to (provider, providerCustomerId) — set at checkout. */
  accountByCustomer?: string | null;
  missingAccount?: boolean;
}

function makeTx(opts: TxOpts = {}) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const locks: unknown[][] = [];
  const tx = {
    $executeRawUnsafe: vi.fn(async (_sql: string, ...values: unknown[]) => {
      locks.push(values);
      return 1;
    }),
    billingPurchase: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ('providerSubscriptionId' in where) return opts.existing ?? null;
        if ('providerPurchaseId' in where) return opts.byPurchaseRef ?? null;
        if ('providerCustomerId' in where) return opts.byCustomer ?? null;
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'new-purchase', ...data };
        created.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { id: where.id, ...(opts.existing ?? {}), ...data };
        updated.push(row);
        return row;
      }),
    },
    billingAccount: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.userId) return opts.accountByUser ? { id: opts.accountByUser } : null;
        if (where.id) return opts.missingAccount ? null : { id: where.id };
        return null;
      }),
      findFirst: vi.fn(async () => (opts.accountByCustomer ? { id: opts.accountByCustomer } : null)),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { tx: tx as any, created, updated, locks };
}

describe('offerForProviderPrice', () => {
  it('maps the configured price to PRO_MONTHLY and nothing else', () => {
    expect(offerForProviderPrice('STRIPE', PRICE)?.id).toBe('PRO_MONTHLY');
    expect(offerForProviderPrice('STRIPE', 'price_unknown')).toBeUndefined();
  });
});

describe('syncPurchaseFromSnapshot', () => {
  it('ignores an event with no subscription id', async () => {
    const { tx } = makeTx();
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ providerSubscriptionId: null, providerPurchaseId: '' }),
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'ignored', reason: 'no_subscription' });
  });

  it('fails safely and grants nothing for an unknown provider price', async () => {
    const { tx, created } = makeTx();
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ providerPriceId: 'price_not_ours' }),
      accountRef: 'acc1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'failed', reason: 'unknown_price' });
    expect(created).toHaveLength(0);
  });

  it('creates a Pro purchase and reports an upgrade when none exists', async () => {
    const { tx, created } = makeTx({ accountByUser: 'acc-user' });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot(),
      userRef: 'u1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'processed', planId: 'PRO', status: 'ACTIVE', accessChange: 'upgraded' });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ billingAccountId: 'acc-user', offerId: 'PRO_MONTHLY', planId: 'PRO', lastEventAt: NOW });
  });

  it('ignores no account resolvable', async () => {
    const { tx } = makeTx();
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot(),
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'ignored', reason: 'account_not_found' });
  });

  it('rejects a cross-account ownership conflict', async () => {
    const { tx, updated } = makeTx({
      existing: { id: 'p1', billingAccountId: 'acc-OTHER', status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: days(29), graceEndsAt: null },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot(),
      accountRef: 'acc-MINE',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'failed', reason: 'ownership_conflict' });
    expect(updated).toHaveLength(0);
  });

  it('ignores a stale (older) event and does not overwrite newer state', async () => {
    const { tx, updated } = makeTx({
      existing: {
        id: 'p1',
        billingAccountId: 'acc1',
        status: 'CANCELLED',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: days(29),
        graceEndsAt: null,
        lastEventAt: days(1), // newer than the incoming event
      },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ status: 'ACTIVE' }),
      accountRef: 'acc1',
      occurredAt: days(-1), // older
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'ignored', reason: 'stale_event' });
    expect(updated).toHaveLength(0);
  });

  it('opens a grace window on entering past-due', async () => {
    const { tx, updated } = makeTx({
      existing: { id: 'p1', billingAccountId: 'acc1', status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: days(-1), graceEndsAt: null },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ status: 'PAST_DUE', currentPeriodEnd: days(-1) }),
      accountRef: 'acc1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'processed', status: 'PAST_DUE' });
    // grace = periodEnd + 3 days
    expect((updated[0].graceEndsAt as Date).getTime()).toBe(days(-1).getTime() + 3 * 24 * 60 * 60 * 1000);
  });

  it('clears grace on payment recovery to active', async () => {
    const { tx, updated } = makeTx({
      existing: { id: 'p1', billingAccountId: 'acc1', status: 'PAST_DUE', cancelAtPeriodEnd: false, currentPeriodEnd: days(-1), graceEndsAt: days(2) },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ status: 'ACTIVE', currentPeriodStart: days(0), currentPeriodEnd: days(30) }),
      accountRef: 'acc1',
      occurredAt: NOW,
      now: NOW,
    });
    // Grace access and active access both grant Pro, so the effective access is
    // unchanged; the meaningful assertion is that the grace window is cleared.
    expect(result).toMatchObject({ outcome: 'processed', status: 'ACTIVE' });
    expect(updated[0].graceEndsAt).toBeNull();
  });

  it('keeps access on cancel-at-period-end and records the flag', async () => {
    const { tx, updated } = makeTx({
      existing: { id: 'p1', billingAccountId: 'acc1', status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: days(29), graceEndsAt: null },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ cancelAtPeriodEnd: true }),
      accountRef: 'acc1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'processed', status: 'ACTIVE', accessChange: 'unchanged' });
    expect(updated[0]).toMatchObject({ cancelAtPeriodEnd: true });
  });

  it('reports whether it created or converged onto an existing purchase', async () => {
    const fresh = makeTx({ accountByUser: 'acc-user' });
    await expect(
      syncPurchaseFromSnapshot(fresh.tx, { provider: 'STRIPE', snapshot: snapshot(), userRef: 'u1', occurredAt: NOW, now: NOW })
    ).resolves.toMatchObject({ mutation: 'created' });

    const converged = makeTx({
      existing: { id: 'p1', billingAccountId: 'acc1', status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: days(29), graceEndsAt: null },
    });
    await expect(
      syncPurchaseFromSnapshot(converged.tx, { provider: 'STRIPE', snapshot: snapshot(), accountRef: 'acc1', occurredAt: NOW, now: NOW })
    ).resolves.toMatchObject({ mutation: 'updated', purchaseId: 'p1' });
    expect(converged.created).toHaveLength(0);
  });

  it('flags payment recovery when a return to active closes an open grace window', async () => {
    const { tx } = makeTx({
      existing: { id: 'p1', billingAccountId: 'acc1', status: 'PAST_DUE', cancelAtPeriodEnd: false, currentPeriodEnd: days(-1), graceEndsAt: days(2) },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ status: 'ACTIVE', currentPeriodStart: days(0), currentPeriodEnd: days(30) }),
      accountRef: 'acc1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'processed', status: 'ACTIVE', paymentRecovered: true });
  });
});

describe('convergence lookup order', () => {
  it('converges onto a checkout-linked purchase not yet bound to the subscription', async () => {
    const { tx, created, updated } = makeTx({
      existing: null,
      byPurchaseRef: {
        id: 'p-checkout',
        billingAccountId: 'acc1',
        status: 'INCOMPLETE',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        graceEndsAt: null,
        providerSubscriptionId: null,
      },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot(),
      accountRef: 'acc1',
      checkoutRef: 'cs_test_1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'processed', purchaseId: 'p-checkout', mutation: 'updated' });
    expect(created).toHaveLength(0);
    expect(updated[0]).toMatchObject({ providerSubscriptionId: 'sub_1' });
  });

  it('refuses to adopt a purchase reference already bound to another subscription', async () => {
    const { tx, created, updated } = makeTx({
      existing: null,
      byPurchaseRef: { id: 'p-other', billingAccountId: 'acc1', providerSubscriptionId: 'sub_OTHER' },
    });
    const result = await syncPurchaseFromSnapshot(tx, {
      provider: 'STRIPE',
      snapshot: snapshot(),
      accountRef: 'acc1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'failed', reason: 'purchase_ref_conflict' });
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });
});

/**
 * Invoice events carry NO checkout metadata — only a customer and a subscription.
 * These pin the ladder that lets them resolve an owner anyway, and that a claim
 * disagreeing with the customer's stored binding is refused rather than honoured.
 */
describe('account resolution ladder', () => {
  const invoice = { provider: 'STRIPE' as const, snapshot: snapshot(), occurredAt: NOW, now: NOW };

  it('resolves the owner from BillingAccount.providerCustomerId when no purchase exists yet', async () => {
    const { tx, created } = makeTx({ accountByCustomer: 'acc-from-customer' });
    const result = await syncPurchaseFromSnapshot(tx, invoice);

    expect(result).toMatchObject({ outcome: 'processed', mutation: 'created', accountSource: 'account_customer' });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ billingAccountId: 'acc-from-customer', planId: 'PRO' });
  });

  it('prefers an existing purchase on the same customer over the account binding', async () => {
    const { tx, created } = makeTx({
      byCustomer: { billingAccountId: 'acc-from-purchase' },
      accountByCustomer: 'acc-from-customer',
    });
    const result = await syncPurchaseFromSnapshot(tx, invoice);

    expect(result).toMatchObject({ outcome: 'processed', accountSource: 'purchase_customer' });
    expect(created[0]).toMatchObject({ billingAccountId: 'acc-from-purchase' });
  });

  it('grants nothing when the customer matches no account and no metadata is carried', async () => {
    const { tx, created } = makeTx();
    const result = await syncPurchaseFromSnapshot(tx, invoice);

    expect(result).toMatchObject({ outcome: 'ignored', reason: 'account_not_found' });
    expect(created).toHaveLength(0);
  });

  it('refuses a claim naming another account than the customer is bound to', async () => {
    const { tx, created } = makeTx({ accountByCustomer: 'acc-owner' });
    const result = await syncPurchaseFromSnapshot(tx, { ...invoice, accountRef: 'acc-attacker' });

    expect(result).toMatchObject({ outcome: 'failed', reason: 'ownership_conflict' });
    expect(created).toHaveLength(0);
  });

  it('accepts a claim that agrees with the customer binding', async () => {
    const { tx, created } = makeTx({ accountByCustomer: 'acc-owner' });
    const result = await syncPurchaseFromSnapshot(tx, { ...invoice, accountRef: 'acc-owner' });

    expect(result).toMatchObject({ outcome: 'processed', accountSource: 'metadata_account' });
    expect(created[0]).toMatchObject({ billingAccountId: 'acc-owner' });
  });

  it('falls back to the customer binding when the claimed account no longer exists', async () => {
    // A stale/bogus metadata id must resolve to nothing rather than masquerade as
    // a cross-user conflict — the customer binding is the server-established fact.
    const { tx, created } = makeTx({ accountByCustomer: 'acc-owner', missingAccount: true });
    const result = await syncPurchaseFromSnapshot(tx, { ...invoice, accountRef: 'acc-deleted' });

    expect(result).toMatchObject({ outcome: 'processed', accountSource: 'account_customer' });
    expect(created[0]).toMatchObject({ billingAccountId: 'acc-owner' });
  });

  it('looks the account up by (provider, providerCustomerId)', async () => {
    const { tx } = makeTx({ accountByCustomer: 'acc-owner' });
    await syncPurchaseFromSnapshot(tx, invoice);

    expect(tx.billingAccount.findFirst).toHaveBeenCalledWith({
      where: { provider: 'STRIPE', providerCustomerId: 'cus_1' },
      select: { id: true },
    });
  });
});

describe('syncProviderPurchase', () => {
  it('takes a subscription-scoped advisory lock before reading or writing', async () => {
    const { tx, locks } = makeTx({ accountByUser: 'acc-user' });
    const result = await syncProviderPurchase(tx, {
      provider: 'STRIPE',
      snapshot: snapshot(),
      userRef: 'u1',
      occurredAt: NOW,
      now: NOW,
    });
    expect(result.outcome).toBe('processed');
    expect(locks).toEqual([['billing:purchase', 'STRIPE:sub_1']]);
    // The lock is taken first — before the purchase lookup that must not race.
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      tx.billingPurchase.findFirst.mock.invocationCallOrder[0]
    );
  });

  it('does not lock (or touch the database) for an event with no subscription', async () => {
    const { tx, locks } = makeTx();
    const result = await syncProviderPurchase(tx, {
      provider: 'STRIPE',
      snapshot: snapshot({ providerSubscriptionId: null, providerPurchaseId: '' }),
      occurredAt: NOW,
      now: NOW,
    });
    expect(result).toMatchObject({ outcome: 'ignored', reason: 'no_subscription' });
    expect(locks).toHaveLength(0);
  });
});

describe('classifyPurchaseConflict', () => {
  const p2002 = (target: string[]) => ({ code: 'P2002', meta: { target } });

  /**
   * What Prisma's pg driver adapter really throws — no `meta.target`, the columns
   * nested under `driverAdapterError`. Captured from a live Postgres race.
   */
  const driverP2002 = (fields: string[]) => ({
    code: 'P2002',
    meta: {
      modelName: 'BillingPurchase',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint: { fields } },
      },
    },
  });

  it('classifies the driver-adapter shape the live stack actually raises', () => {
    expect(classifyPurchaseConflict(driverP2002(['provider', '"providerPurchaseId"']))).toBe('unique_purchase');
    expect(classifyPurchaseConflict(driverP2002(['provider', '"providerSubscriptionId"']))).toBe('unique_subscription');
  });

  it('classifies a constraint reported only by index name', () => {
    const byIndex = {
      code: 'P2002',
      meta: { driverAdapterError: { cause: { constraint: { index: 'billing_purchase_provider_providerSubscriptionId_key' } } } },
    };
    expect(classifyPurchaseConflict(byIndex)).toBe('unique_subscription');
  });

  it('classifies each unique constraint a concurrent event can clash on', () => {
    expect(classifyPurchaseConflict(p2002(['provider', 'providerSubscriptionId']))).toBe('unique_subscription');
    expect(classifyPurchaseConflict(p2002(['provider', 'providerPurchaseId']))).toBe('unique_purchase');
    expect(classifyPurchaseConflict(p2002(['provider', 'providerEventId']))).toBe('unique_event_receipt');
    expect(classifyPurchaseConflict(p2002([]))).toBe('unique_other');
    expect(classifyPurchaseConflict({ code: 'P2034' })).toBe('serialization');
  });

  it('does not classify unrelated failures as recoverable conflicts', () => {
    expect(classifyPurchaseConflict({ code: 'P2025' })).toBeNull();
    expect(classifyPurchaseConflict(new Error('boom'))).toBeNull();
    expect(classifyPurchaseConflict(null)).toBeNull();
  });

  it('extracts only well-formed Prisma error codes', () => {
    expect(prismaErrorCode({ code: 'P2002' })).toBe('P2002');
    expect(prismaErrorCode({ code: 'ECONNRESET' })).toBeUndefined();
    expect(prismaErrorCode(new Error('boom'))).toBeUndefined();
  });
});
