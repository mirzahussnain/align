/**
 * Webhook convergence — distinct Stripe events, one BillingPurchase.
 *
 * Stripe emits `checkout.session.completed`, `customer.subscription.created`,
 * `customer.subscription.updated` and `invoice.paid` for the SAME subscription
 * under DIFFERENT event ids, and delivers them concurrently. Event-id idempotency
 * cannot make that convergent; only a subscription-scoped lock plus deterministic
 * unique-conflict recovery can.
 *
 * These tests run the real handler and the real sync against an in-memory database
 * stand-in that enforces the two unique constraints the schema actually declares
 * — `(provider, providerSubscriptionId)` and `(provider, providerPurchaseId)` —
 * and that can have its advisory lock DISABLED, which reproduces the production
 * failure (two creates, P2002, WEBHOOK_PROCESSING_FAILED, 500) and proves the
 * conflict-recovery path drives it to 200 instead.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderPurchaseSnapshot, VerifiedBillingEvent } from '../provider-contract';

// ── In-memory stand-in for the Postgres client ────────────────────────────────

type Row = Record<string, unknown> & { id: string };

/**
 * The unique constraints declared on BillingPurchase, in SCHEMA order — Postgres
 * reports whichever index it checks first, which is the `providerPurchaseId` one.
 */
const PURCHASE_UNIQUES: Array<[string, string]> = [
  ['provider', 'providerPurchaseId'],
  ['provider', 'providerSubscriptionId'],
];

/**
 * Mirrors what Prisma's pg driver adapter actually throws: code `P2002` with the
 * constraint nested under `meta.driverAdapterError`, and NO `meta.target`.
 */
class UniqueViolation extends Error {
  readonly code = 'P2002';
  readonly meta: Record<string, unknown>;
  constructor(fields: string[]) {
    super('Unique constraint failed');
    this.name = 'PrismaClientKnownRequestError';
    this.meta = {
      modelName: 'BillingPurchase',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { fields },
        },
      },
    };
  }
}

class FakeDb {
  purchases = new Map<string, Row>();
  receipts = new Map<string, Row>();
  accounts = new Map<string, { id: string; userId: string; provider: string | null; providerCustomerId: string | null }>();
  /** Turn the advisory lock off to force the raw unique-constraint race. */
  lockEnabled = true;
  /** Every advisory lock key acquired, in order. */
  lockKeys: string[] = [];
  transactions = 0;

  private lockChain = new Map<string, Promise<void>>();
  private seq = 0;

  /**
   * Checkout binds the provider customer to the account BEFORE the session is
   * created, so in production an account already carries its customer by the time
   * ANY webhook arrives. `providerCustomerId` is therefore part of the default
   * fixture, not an opt-in.
   */
  account(id: string, userId: string, providerCustomerId: string | null = null) {
    this.accounts.set(id, { id, userId, provider: providerCustomerId ? 'STRIPE' : null, providerCustomerId });
    return this.accounts.get(id)!;
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  private async lock(key: string): Promise<() => void> {
    this.lockKeys.push(key);
    if (!this.lockEnabled) return () => {};
    const previous = this.lockChain.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lockChain.set(key, previous.then(() => held));
    await previous;
    return release;
  }

  private assertUnique(row: Row, ignoreId?: string): void {
    for (const keys of PURCHASE_UNIQUES) {
      if (keys.some((k) => row[k] == null)) continue;
      for (const other of this.purchases.values()) {
        if (other.id === ignoreId) continue;
        if (keys.every((k) => other[k] === row[k])) throw new UniqueViolation([...keys]);
      }
    }
  }

  /** A tiny `where` matcher covering the shapes purchase-sync actually issues. */
  private matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (condition !== null && typeof condition === 'object' && 'in' in (condition as object)) {
        return (condition as { in: unknown[] }).in.includes(row[key]);
      }
      return row[key] === condition;
    });
  }

  private client = (undo: Array<() => void>, held: Array<() => void> = []) => ({
    $executeRawUnsafe: async (_sql: string, namespace: string, key: string) => {
      // A transaction-scoped advisory lock: released when the tx ends, either way.
      held.push(await this.lock(`${namespace}|${key}`));
      return 1;
    },
    billingPurchase: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        // Yield so concurrent flows genuinely interleave rather than running to
        // completion one after the other.
        await Promise.resolve();
        for (const row of this.purchases.values()) if (this.matches(row, where)) return { ...row };
        return null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        await Promise.resolve();
        const row = { id: this.id('purchase'), createdAt: new Date(), ...data } as Row;
        this.assertUnique(row);
        this.purchases.set(row.id, row);
        undo.push(() => this.purchases.delete(row.id));
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        await Promise.resolve();
        const before = this.purchases.get(where.id);
        if (!before) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        const row = { ...before, ...data } as Row;
        this.assertUnique(row, where.id);
        this.purchases.set(where.id, row);
        undo.push(() => this.purchases.set(where.id, before));
        return { ...row };
      },
    },
    billingAccount: {
      findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
        await Promise.resolve();
        if (where.id) return this.accounts.get(where.id) ?? null;
        if (where.userId) {
          for (const account of this.accounts.values()) if (account.userId === where.userId) return account;
        }
        return null;
      },
      findFirst: async ({ where }: { where: { provider?: string; providerCustomerId?: string } }) => {
        await Promise.resolve();
        for (const account of this.accounts.values()) {
          if (account.provider === where.provider && account.providerCustomerId === where.providerCustomerId) {
            return account;
          }
        }
        return null;
      },
    },
    billingEventReceipt: {
      findUnique: async ({
        where,
      }: {
        where: { provider_providerEventId: { provider: string; providerEventId: string } };
      }) => {
        await Promise.resolve();
        const { provider, providerEventId } = where.provider_providerEventId;
        return this.receipts.get(`${provider}:${providerEventId}`) ?? null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { provider_providerEventId: { provider: string; providerEventId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        await Promise.resolve();
        const { provider, providerEventId } = where.provider_providerEventId;
        const key = `${provider}:${providerEventId}`;
        const before = this.receipts.get(key);
        const row = (before ? { ...before, ...update } : { id: this.id('receipt'), ...create }) as Row;
        this.receipts.set(key, row);
        undo.push(() => (before ? this.receipts.set(key, before) : this.receipts.delete(key)));
        return { ...row };
      },
    },
  });

  /** The top-level client: same surface, every statement auto-committed. */
  get root() {
    return this.client([]);
  }

  async $transaction<T>(fn: (tx: ReturnType<FakeDb['client']>) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const undo: Array<() => void> = [];
    const held: Array<() => void> = [];
    try {
      return await fn(this.client(undo, held));
    } catch (error) {
      // Roll every write of this transaction back, newest first.
      for (const revert of [...undo].reverse()) revert();
      throw error;
    } finally {
      // Advisory locks are transaction-scoped: released on commit AND on rollback.
      for (const release of held) release();
    }
  }
}

let db: FakeDb;

const prismaMock = vi.hoisted(() => ({
  billingEventReceipt: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock }));

import { processVerifiedEvent } from '../webhook-handler';
import { __setBillingLogSink } from '../logging';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRICE = 'price_pro_monthly_test';
const NOW = new Date('2026-07-27T12:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
const SUB = 'sub_convergence_1';
const ACCOUNT = 'acc_1';
const USER = 'user_1';
const CUSTOMER = 'cus_1';

function snapshot(overrides: Partial<ProviderPurchaseSnapshot> = {}): ProviderPurchaseSnapshot {
  return {
    providerPurchaseId: SUB,
    providerCustomerId: 'cus_1',
    providerSubscriptionId: SUB,
    providerPriceId: PRICE,
    status: 'ACTIVE',
    currentPeriodStart: days(0),
    currentPeriodEnd: days(30),
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    ...overrides,
  };
}

/** The live subscription the adapter returns; mutated to model a status change. */
let live: ProviderPurchaseSnapshot;

function adapter() {
  return {
    getPurchase: vi.fn(async (id: string) => {
      if (id !== SUB) throw new Error(`unexpected subscription read: ${id}`);
      return live;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** `checkout.session.completed` — carries the session link, not a subscription id of its own. */
function checkoutCompleted(overrides: Partial<VerifiedBillingEvent> = {}): VerifiedBillingEvent {
  return {
    provider: 'STRIPE',
    providerEventId: 'evt_checkout',
    type: 'PURCHASE_CREATED',
    occurredAt: new Date(NOW.getTime() + 1_000),
    customerRef: 'cus_1',
    subscriptionRef: SUB,
    checkoutRef: 'cs_test_1',
    userRef: USER,
    accountRef: ACCOUNT,
    ...overrides,
  };
}

/** `customer.subscription.created` — same subscription, a DIFFERENT event id. */
function subscriptionCreated(overrides: Partial<VerifiedBillingEvent> = {}): VerifiedBillingEvent {
  return {
    provider: 'STRIPE',
    providerEventId: 'evt_sub_created',
    type: 'PURCHASE_CREATED',
    occurredAt: new Date(NOW.getTime() + 2_000),
    customerRef: 'cus_1',
    subscriptionRef: SUB,
    purchaseRef: SUB,
    userRef: USER,
    accountRef: ACCOUNT,
    ...overrides,
  };
}

function invoiceEvent(id: string, type: 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED', offsetMs: number): VerifiedBillingEvent {
  return {
    provider: 'STRIPE',
    providerEventId: id,
    type,
    occurredAt: new Date(NOW.getTime() + offsetMs),
    customerRef: 'cus_1',
    subscriptionRef: SUB,
  };
}

let logs: Array<Record<string, unknown>>;
let restoreSink: () => void;

const purchases = () => [...db.purchases.values()];
const receipts = () => [...db.receipts.values()];
const logged = (evt: string) => logs.filter((l) => l.evt === evt);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = PRICE;

  db = new FakeDb();
  db.account(ACCOUNT, USER, CUSTOMER);
  live = snapshot();

  prismaMock.billingEventReceipt.findUnique.mockImplementation((args) => db.root.billingEventReceipt.findUnique(args));
  prismaMock.billingEventReceipt.upsert.mockImplementation((args) => db.root.billingEventReceipt.upsert(args));
  prismaMock.$transaction.mockImplementation((fn) => db.$transaction(fn));

  logs = [];
  restoreSink = __setBillingLogSink((record) => logs.push(record));
});

afterEach(() => {
  restoreSink();
});

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('event ordering', () => {
  it('converges when checkout.session.completed arrives first', async () => {
    const a = await processVerifiedEvent(checkoutCompleted(), adapter());
    const b = await processVerifiedEvent(subscriptionCreated(), adapter());

    expect([a, b]).toEqual([
      { status: 200, outcome: 'processed' },
      { status: 200, outcome: 'processed' },
    ]);
    expect(purchases()).toHaveLength(1);
    expect(receipts().map((r) => r.outcome)).toEqual(['processed', 'processed']);
  });

  it('converges when customer.subscription.created arrives first', async () => {
    const a = await processVerifiedEvent(subscriptionCreated(), adapter());
    const b = await processVerifiedEvent(checkoutCompleted(), adapter());

    // Both acknowledge. The checkout event carries the EARLIER provider timestamp,
    // so the stale guard declines to re-apply it — a convergent no-op, not a
    // failure: the subscription event already applied the same live snapshot, and
    // both events carry the same ownership metadata, so nothing is lost.
    expect(a).toEqual({ status: 200, outcome: 'processed' });
    expect(b.status).toBe(200);
    expect(b.outcome).not.toBe('failed');

    expect(purchases()).toHaveLength(1);
    expect(purchases()[0]).toMatchObject({ status: 'ACTIVE', planId: 'PRO', providerSubscriptionId: SUB });
    // Both receipts reached a TERMINAL outcome, so neither will be reprocessed.
    expect(receipts().every((r) => r.outcome === 'processed' || r.outcome === 'ignored')).toBe(true);
    expect(logged('webhook_failed')).toHaveLength(0);
  });

  it('grants access exactly once across the whole three-event burst', async () => {
    // The real sequence from the failing test-mode checkout, all three events.
    await Promise.all([
      processVerifiedEvent(invoiceEvent('evt_invoice_paid', 'PAYMENT_SUCCEEDED', 500), adapter()),
      processVerifiedEvent(checkoutCompleted(), adapter()),
      processVerifiedEvent(subscriptionCreated(), adapter()),
    ]);

    expect(purchases()).toHaveLength(1);
    expect(logged('access_upgraded')).toHaveLength(1);
    // Exactly one insert; every other event converged by updating it.
    expect(logged('purchase_created')).toHaveLength(1);
  });

  it('does not depend on arrival order to reach the same final state', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    const first = { ...purchases()[0] };

    db = new FakeDb();
    db.account(ACCOUNT, USER, CUSTOMER);
    await processVerifiedEvent(checkoutCompleted(), adapter());
    await processVerifiedEvent(subscriptionCreated(), adapter());

    const second = purchases()[0];
    expect(second.status).toBe(first.status);
    expect(second.planId).toBe(first.planId);
    expect(second.providerSubscriptionId).toBe(first.providerSubscriptionId);
  });
});

// ── Concurrency ───────────────────────────────────────────────────────────────

describe('concurrent delivery', () => {
  it('produces exactly one purchase and two 200s when both events run at once', async () => {
    const [a, b] = await Promise.all([
      processVerifiedEvent(checkoutCompleted(), adapter()),
      processVerifiedEvent(subscriptionCreated(), adapter()),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect([a.outcome, b.outcome]).toEqual(['processed', 'processed']);
    expect(purchases()).toHaveLength(1);
    expect(receipts()).toHaveLength(2);
    expect(receipts().every((r) => r.outcome === 'processed')).toBe(true);
    expect(logged('webhook_failed')).toHaveLength(0);
  });

  it('serialises concurrent events on a subscription-scoped advisory lock', async () => {
    await Promise.all([
      processVerifiedEvent(checkoutCompleted(), adapter()),
      processVerifiedEvent(subscriptionCreated(), adapter()),
    ]);
    expect(db.lockKeys).toEqual([`billing:purchase|STRIPE:${SUB}`, `billing:purchase|STRIPE:${SUB}`]);
  });

  it('recovers a unique-constraint race by re-reading the winner and updating it', async () => {
    // Reproduce the production failure exactly: no serialisation, so both events
    // read "no purchase", both insert, and the loser hits the unique constraint.
    db.lockEnabled = false;

    const [a, b] = await Promise.all([
      processVerifiedEvent(checkoutCompleted(), adapter()),
      processVerifiedEvent(subscriptionCreated(), adapter()),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(purchases()).toHaveLength(1);

    // The conflict happened, was classified, and was recovered — not 500'd.
    const detected = logged('webhook_conflict_detected');
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ dbErrorCode: 'P2002', conflictCategory: 'unique_purchase' });
    expect(logged('webhook_conflict_recovered')).toHaveLength(1);
    // The recovery UPDATED the winner rather than inserting a second row.
    expect(logged('purchase_created')).toHaveLength(1);
    expect(logged('purchase_updated')).toHaveLength(1);
    expect(receipts().every((r) => r.outcome === 'processed')).toBe(true);
  });

  it('surfaces the diagnostic fields needed to triage a conflict, without provider ids or PII', async () => {
    db.lockEnabled = false;
    await Promise.all([
      processVerifiedEvent(checkoutCompleted(), adapter()),
      processVerifiedEvent(subscriptionCreated(), adapter()),
    ]);

    const conflict = logged('webhook_conflict_detected')[0];
    expect(conflict.providerEventId).toBe('evt_sub_created');
    expect(conflict.subscriptionHash).toEqual(expect.stringMatching(/^[0-9a-f]{12}$/));
    expect(conflict.attempt).toBe(1);
    // The raw provider references are never logged.
    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain(SUB);
    expect(serialised).not.toContain('cus_1');

    const recovered = logged('webhook_conflict_recovered')[0];
    expect(recovered.purchaseId).toBe(purchases()[0].id);
  });
});

// ── Idempotency and receipt semantics ─────────────────────────────────────────

describe('receipt semantics', () => {
  it('is idempotent for a repeated delivery of either event', async () => {
    await processVerifiedEvent(checkoutCompleted(), adapter());
    await processVerifiedEvent(subscriptionCreated(), adapter());

    const repeats = await Promise.all([
      processVerifiedEvent(checkoutCompleted(), adapter()),
      processVerifiedEvent(subscriptionCreated(), adapter()),
    ]);

    expect(repeats).toEqual([
      { status: 200, outcome: 'duplicate' },
      { status: 200, outcome: 'duplicate' },
    ]);
    expect(purchases()).toHaveLength(1);
    expect(receipts()).toHaveLength(2);
  });

  it('reprocesses a failed receipt on retry and makes it terminally processed', async () => {
    // First delivery fails on an unreachable provider — exactly what a 500'd event
    // leaves behind.
    const failing = {
      getPurchase: vi.fn(async () => {
        throw new Error('provider unreachable');
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const first = await processVerifiedEvent(subscriptionCreated(), failing);
    expect(first).toEqual({ status: 500, outcome: 'failed' });
    expect(receipts()[0]).toMatchObject({ outcome: 'failed' });

    // Stripe retries the same event id: it is reprocessed, not short-circuited.
    const retry = await processVerifiedEvent(subscriptionCreated(), adapter());
    expect(retry).toEqual({ status: 200, outcome: 'processed' });
    expect(receipts()[0]).toMatchObject({ outcome: 'processed' });
    expect(purchases()).toHaveLength(1);

    // A further duplicate after success is a no-op.
    const again = await processVerifiedEvent(subscriptionCreated(), adapter());
    expect(again).toEqual({ status: 200, outcome: 'duplicate' });
    expect(purchases()).toHaveLength(1);
  });

  it('rolls the receipt back with the purchase when the transaction fails', async () => {
    // A non-conflict failure inside the transaction must leave no processed receipt
    // claiming work that never committed.
    db.lockEnabled = false;
    const boom = new Error('write failed');
    const original = db.$transaction.bind(db);
    prismaMock.$transaction.mockImplementationOnce(async (fn) =>
      original(async (tx) => {
        await fn(tx);
        throw boom;
      })
    );

    const result = await processVerifiedEvent(subscriptionCreated(), adapter());
    expect(result).toEqual({ status: 500, outcome: 'failed' });
    expect(purchases()).toHaveLength(0);
    // The only receipt is the failure record written outside the rolled-back tx.
    expect(receipts()).toHaveLength(1);
    expect(receipts()[0]).toMatchObject({ outcome: 'failed', errorCode: 'WEBHOOK_PROCESSING_FAILED' });
  });

  it('never leaves a processed receipt without the purchase it names', async () => {
    await processVerifiedEvent(checkoutCompleted(), adapter());
    await processVerifiedEvent(subscriptionCreated(), adapter());
    const ids = new Set(purchases().map((p) => p.id));
    for (const receipt of receipts()) {
      if (receipt.outcome !== 'processed') continue;
      expect(ids.has(receipt.purchaseId as string)).toBe(true);
    }
  });
});

// ── Stale guard ───────────────────────────────────────────────────────────────

describe('stale events', () => {
  it('does not let an older event overwrite newer state', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    const before = { ...purchases()[0] };

    // A late-delivered, OLDER event whose live snapshot has since changed.
    live = snapshot({ status: 'CANCELLED', cancelAtPeriodEnd: true });
    const stale = await processVerifiedEvent(
      checkoutCompleted({ providerEventId: 'evt_stale', occurredAt: new Date(NOW.getTime() - 60_000) }),
      adapter()
    );

    expect(stale).toEqual({ status: 200, outcome: 'ignored' });
    expect(logged('webhook_stale_event')).toHaveLength(1);
    expect(purchases()[0].status).toBe(before.status);
    expect(purchases()[0].lastEventAt).toEqual(before.lastEventAt);
  });
});

// ── Invoice payment failure and recovery ──────────────────────────────────────

describe('invoice payment failure and recovery', () => {
  it('starts a grace window on invoice.payment_failed', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());

    live = snapshot({ status: 'PAST_DUE', currentPeriodEnd: days(1) });
    const failed = await processVerifiedEvent(invoiceEvent('evt_invoice_failed', 'PAYMENT_FAILED', 10_000), adapter());

    expect(failed).toEqual({ status: 200, outcome: 'processed' });
    const purchase = purchases()[0];
    expect(purchase.status).toBe('PAST_DUE');
    // Grace = period end + the configured window (3 days).
    expect((purchase.graceEndsAt as Date).getTime()).toBe(days(1).getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(logged('grace_started')).toHaveLength(1);
  });

  it('restores ACTIVE and clears grace on a later invoice.paid', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    live = snapshot({ status: 'PAST_DUE', currentPeriodEnd: days(1) });
    await processVerifiedEvent(invoiceEvent('evt_invoice_failed', 'PAYMENT_FAILED', 10_000), adapter());
    expect(purchases()[0].graceEndsAt).not.toBeNull();

    // Payment recovers: the LIVE subscription is active again.
    live = snapshot({ status: 'ACTIVE', currentPeriodStart: days(1), currentPeriodEnd: days(31) });
    const paid = await processVerifiedEvent(invoiceEvent('evt_invoice_paid_2', 'PAYMENT_SUCCEEDED', 20_000), adapter());

    expect(paid).toEqual({ status: 200, outcome: 'processed' });
    const purchase = purchases()[0];
    expect(purchase.status).toBe('ACTIVE');
    expect(purchase.graceEndsAt).toBeNull();
    expect(purchase.currentPeriodEnd).toEqual(days(31));
    expect(logged('payment_recovered')).toHaveLength(1);
    expect(purchases()).toHaveLength(1);
  });

  it('reads the live subscription rather than trusting the invoice event', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    const a = adapter();
    live = snapshot({ status: 'PAST_DUE' });
    await processVerifiedEvent(invoiceEvent('evt_invoice_x', 'PAYMENT_SUCCEEDED', 30_000), a);
    expect(a.getPurchase).toHaveBeenCalledWith(SUB);
    // An invoice event never carries the status itself — the fetched snapshot wins.
    expect(purchases()[0].status).toBe('PAST_DUE');
  });

  it('ignores an invoice event that names no subscription, leaving access untouched', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    const orphan = await processVerifiedEvent(
      { ...invoiceEvent('evt_orphan', 'PAYMENT_SUCCEEDED', 40_000), subscriptionRef: undefined },
      adapter()
    );
    expect(orphan).toEqual({ status: 200, outcome: 'ignored' });
    expect(purchases()[0].status).toBe('ACTIVE');
  });
});

// ── Invoice events that arrive BEFORE any purchase row exists ─────────────────

/**
 * The gap this suite pins: invoice events carry no checkout metadata — only a
 * customer and a subscription. Stripe delivers `invoice.paid`,
 * `checkout.session.completed` and `customer.subscription.created` in parallel, so
 * the invoice routinely lands FIRST, with no BillingPurchase to resolve ownership
 * from. Ownership then has to come from the customer binding the account already
 * carries (checkout writes it before the session is created).
 */
describe('invoice-first arrival', () => {
  it('resolves the account from BillingAccount.providerCustomerId and creates the purchase', async () => {
    const paid = await processVerifiedEvent(invoiceEvent('evt_invoice_first', 'PAYMENT_SUCCEEDED', 500), adapter());

    expect(paid).toEqual({ status: 200, outcome: 'processed' });
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0]).toMatchObject({
      billingAccountId: ACCOUNT,
      status: 'ACTIVE',
      planId: 'PRO',
      providerSubscriptionId: SUB,
    });
    expect(logged('purchase_created')).toHaveLength(1);
    expect(logged('access_upgraded')).toHaveLength(1);
    // The resolution path is greppable, so an operator can tell an invoice-derived
    // grant from a metadata-derived one.
    expect(logged('webhook_processed')[0]).toMatchObject({ accountSource: 'account_customer' });
  });

  it('fetches and validates the live subscription rather than granting from the invoice', async () => {
    const a = adapter();
    await processVerifiedEvent(invoiceEvent('evt_invoice_first', 'PAYMENT_SUCCEEDED', 500), a);
    expect(a.getPurchase).toHaveBeenCalledWith(SUB);

    // A live subscription on a price we do not sell grants nothing, even though the
    // customer resolves and the invoice was genuinely paid.
    db.purchases.clear();
    live = snapshot({ providerPriceId: 'price_not_ours' });
    const unknown = await processVerifiedEvent(invoiceEvent('evt_invoice_unknown', 'PAYMENT_SUCCEEDED', 600), adapter());
    expect(unknown).toEqual({ status: 200, outcome: 'failed' });
    expect(purchases()).toHaveLength(0);
  });

  it('converges a later subscription.created onto the same purchase', async () => {
    await processVerifiedEvent(invoiceEvent('evt_invoice_first', 'PAYMENT_SUCCEEDED', 500), adapter());
    const created = purchases()[0].id;

    const follow = await processVerifiedEvent(subscriptionCreated(), adapter());

    expect(follow).toEqual({ status: 200, outcome: 'processed' });
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0].id).toBe(created);
    // Exactly one insert across the pair; the second event UPDATED it.
    expect(logged('purchase_created')).toHaveLength(1);
    expect(logged('purchase_updated')).toHaveLength(1);
  });

  it('holds when the whole burst arrives at once with the invoice leading', async () => {
    const results = await Promise.all([
      processVerifiedEvent(invoiceEvent('evt_invoice_first', 'PAYMENT_SUCCEEDED', 500), adapter()),
      processVerifiedEvent(checkoutCompleted(), adapter()),
      processVerifiedEvent(subscriptionCreated(), adapter()),
    ]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.some((r) => r.outcome === 'failed')).toBe(false);
    expect(purchases()).toHaveLength(1);
    expect(logged('purchase_created')).toHaveLength(1);
    expect(receipts()).toHaveLength(3);
  });

  it('initialises a past-due purchase with grace when payment_failed arrives first', async () => {
    live = snapshot({ status: 'PAST_DUE', currentPeriodEnd: days(1) });
    const failed = await processVerifiedEvent(invoiceEvent('evt_failed_first', 'PAYMENT_FAILED', 500), adapter());

    expect(failed).toEqual({ status: 200, outcome: 'processed' });
    expect(purchases()).toHaveLength(1);
    const purchase = purchases()[0];
    expect(purchase).toMatchObject({ billingAccountId: ACCOUNT, status: 'PAST_DUE' });
    expect((purchase.graceEndsAt as Date).getTime()).toBe(days(1).getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(logged('grace_started')).toHaveLength(1);
  });

  it('restores ACTIVE and clears grace when the retry succeeds, on the same row', async () => {
    live = snapshot({ status: 'PAST_DUE', currentPeriodEnd: days(1) });
    await processVerifiedEvent(invoiceEvent('evt_failed_first', 'PAYMENT_FAILED', 500), adapter());
    const pastDue = purchases()[0];

    live = snapshot({ status: 'ACTIVE', currentPeriodStart: days(1), currentPeriodEnd: days(31) });
    const paid = await processVerifiedEvent(invoiceEvent('evt_paid_after', 'PAYMENT_SUCCEEDED', 10_000), adapter());

    expect(paid).toEqual({ status: 200, outcome: 'processed' });
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0].id).toBe(pastDue.id);
    expect(purchases()[0]).toMatchObject({ status: 'ACTIVE', graceEndsAt: null });
    expect(logged('payment_recovered')).toHaveLength(1);
  });

  it('grants nothing for an invoice on a customer bound to no account', async () => {
    live = snapshot({ providerCustomerId: 'cus_stranger' });
    const stranger = await processVerifiedEvent(
      { ...invoiceEvent('evt_stranger', 'PAYMENT_SUCCEEDED', 500), customerRef: 'cus_stranger' },
      adapter()
    );

    // Acknowledged, not retried: a retry cannot make an unknown customer resolve.
    expect(stranger).toEqual({ status: 200, outcome: 'ignored' });
    expect(purchases()).toHaveLength(0);
    expect(logged('webhook_ignored')[0]).toMatchObject({ errorCode: 'account_not_found' });
  });

  it('refuses to bind a customer that belongs to another user, granting nothing', async () => {
    db.account('acc_2', 'user_2', 'cus_2');

    // Metadata claims user_2, but the LIVE subscription's customer is bound to
    // user_1's account. No purchase exists yet, so only the customer binding stands
    // between this and a purchase created on the wrong account.
    const hijack = await processVerifiedEvent(
      subscriptionCreated({ providerEventId: 'evt_customer_hijack', userRef: 'user_2', accountRef: 'acc_2' }),
      adapter()
    );

    expect(hijack).toEqual({ status: 200, outcome: 'failed' });
    expect(purchases()).toHaveLength(0);
    expect(logged('ownership_conflict')).toHaveLength(1);
    expect(logged('access_upgraded')).toHaveLength(0);
  });
});

// ── Scheduled cancellation via the Customer Portal ────────────────────────────

describe('scheduled cancellation', () => {
  /** `customer.subscription.updated` — what the portal cancellation emits. */
  const portalUpdate = (id: string, offsetMs: number): VerifiedBillingEvent => ({
    provider: 'STRIPE',
    providerEventId: id,
    type: 'PURCHASE_UPDATED',
    occurredAt: new Date(NOW.getTime() + offsetMs),
    customerRef: 'cus_1',
    subscriptionRef: SUB,
    purchaseRef: SUB,
    userRef: USER,
    accountRef: ACCOUNT,
  });

  it('stores cancelAtPeriodEnd false for a plain active subscription', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    expect(purchases()[0]).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: false });
  });

  it('persists the flag, preserves the period, and keeps the plan on a portal cancellation', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    const periodEnd = purchases()[0].currentPeriodEnd;

    // The live subscription now reports a scheduled cancellation. It is still
    // ACTIVE — Stripe does not cancel until the period actually ends.
    live = snapshot({ status: 'ACTIVE', cancelAtPeriodEnd: true, cancelAt: days(30) });
    const result = await processVerifiedEvent(portalUpdate('evt_portal_cancel', 10_000), adapter());

    expect(result).toEqual({ status: 200, outcome: 'processed' });
    const purchase = purchases()[0];
    expect(purchase.cancelAtPeriodEnd).toBe(true);
    // Status must NOT flip to CANCELLED — paid access runs to the period end.
    expect(purchase.status).toBe('ACTIVE');
    expect(purchase.planId).toBe('PRO');
    expect(purchase.currentPeriodEnd).toEqual(periodEnd);
    expect(purchase.accessEndsAt).toEqual(purchase.currentPeriodEnd);
    // Access is unchanged: the user keeps Pro until the period ends.
    expect(logged('access_downgraded')).toHaveLength(0);
  });

  it('logs the cancellation transition with the fields needed to audit it', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    live = snapshot({ status: 'ACTIVE', cancelAtPeriodEnd: true, cancelAt: days(30) });
    await processVerifiedEvent(portalUpdate('evt_portal_cancel', 10_000), adapter());

    const detected = logged('cancellation_scheduled_detected');
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      eventType: 'PURCHASE_UPDATED',
      cancelAtPeriodEnd: true,
      staleDecision: 'applied_newer',
      mutation: 'updated',
      currentPeriodEnd: days(30).toISOString(),
    });
    expect(detected[0].occurredAt).toBe(new Date(NOW.getTime() + 10_000).toISOString());
    expect(detected[0].storedLastEventAt).toBe(new Date(NOW.getTime() + 2_000).toISOString());
    // Still no provider ids anywhere.
    expect(JSON.stringify(logs)).not.toContain(SUB);
  });

  it('applies a cancellation whose timestamp EQUALS the stored lastEventAt', async () => {
    // Stripe stamps `created` to the second, so a portal action landing in the
    // same second as the previous event is routine. Equal must not mean stale.
    const created = subscriptionCreated();
    await processVerifiedEvent(created, adapter());
    expect(purchases()[0].lastEventAt).toEqual(created.occurredAt);

    live = snapshot({ status: 'ACTIVE', cancelAtPeriodEnd: true, cancelAt: days(30) });
    const result = await processVerifiedEvent(portalUpdate('evt_same_second', 2_000), adapter());

    expect(result).toEqual({ status: 200, outcome: 'processed' });
    expect(purchases()[0].cancelAtPeriodEnd).toBe(true);
    expect(logged('webhook_stale_event')).toHaveLength(0);
    expect(logged('purchase_sync_applied')[1]).toMatchObject({ staleDecision: 'applied_equal' });
  });

  it('still rejects a truly older cancellation event', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());

    live = snapshot({ status: 'ACTIVE', cancelAtPeriodEnd: true, cancelAt: days(30) });
    const result = await processVerifiedEvent(portalUpdate('evt_older', -60_000), adapter());

    expect(result).toEqual({ status: 200, outcome: 'ignored' });
    expect(purchases()[0].cancelAtPeriodEnd).toBe(false);
    expect(logged('webhook_stale_event')[0]).toMatchObject({ staleDecision: 'rejected_older' });
  });

  it('surfaces the scheduled cancellation to the UI only once persisted', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    // Before: the UI's condition for showing an end date is false.
    expect(showsScheduledCancellation(purchases()[0])).toBe(false);

    live = snapshot({ status: 'ACTIVE', cancelAtPeriodEnd: true, cancelAt: days(30) });
    await processVerifiedEvent(portalUpdate('evt_portal_cancel', 10_000), adapter());

    expect(showsScheduledCancellation(purchases()[0])).toBe(true);
  });
});

/**
 * The exact condition BillingView renders an end date on, applied to the stored
 * row: `accessEndsAt != null && (cancelAtPeriodEnd || status !== 'ACTIVE')`. This
 * pins that the banner is driven by PERSISTED state, never by anything the
 * browser or the provider redirect could assert.
 */
function showsScheduledCancellation(purchase: Record<string, unknown>): boolean {
  const accessEndsAt = purchase.accessEndsAt as Date | null;
  return accessEndsAt != null && (purchase.cancelAtPeriodEnd === true || purchase.status !== 'ACTIVE');
}

// ── Safety must not be weakened by convergence ────────────────────────────────

describe('safety', () => {
  it('grants nothing for an unknown price, on either event', async () => {
    live = snapshot({ providerPriceId: 'price_not_ours' });
    const a = await processVerifiedEvent(checkoutCompleted(), adapter());
    const b = await processVerifiedEvent(subscriptionCreated(), adapter());

    expect([a, b]).toEqual([
      { status: 200, outcome: 'failed' },
      { status: 200, outcome: 'failed' },
    ]);
    expect(purchases()).toHaveLength(0);
    expect(logged('unknown_provider_price')).toHaveLength(2);
    expect(logged('access_upgraded')).toHaveLength(0);
  });

  it('refuses to re-home a subscription to another user', async () => {
    await processVerifiedEvent(subscriptionCreated(), adapter());
    db.account('acc_2', 'user_2', 'cus_2');

    const hijack = await processVerifiedEvent(
      subscriptionCreated({ providerEventId: 'evt_hijack', userRef: 'user_2', accountRef: 'acc_2' }),
      adapter()
    );

    expect(hijack).toEqual({ status: 200, outcome: 'failed' });
    expect(logged('ownership_conflict')).toHaveLength(1);
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0].billingAccountId).toBe(ACCOUNT);
  });

  it('does not create a purchase when no billing account can be resolved', async () => {
    // An unrecognised customer with no metadata: nothing identifies an owner.
    live = snapshot({ providerCustomerId: 'cus_unknown' });
    const orphan = await processVerifiedEvent(
      subscriptionCreated({ userRef: undefined, accountRef: undefined, customerRef: 'cus_unknown' }),
      adapter()
    );
    expect(orphan).toEqual({ status: 200, outcome: 'ignored' });
    expect(purchases()).toHaveLength(0);
  });

  it('gives up with a 500 instead of looping when a conflict never resolves', async () => {
    db.lockEnabled = false;
    const conflict = new UniqueViolation(['provider', 'providerSubscriptionId']);
    prismaMock.$transaction.mockRejectedValue(conflict);

    const result = await processVerifiedEvent(subscriptionCreated(), adapter());
    expect(result).toEqual({ status: 500, outcome: 'failed' });
    // Bounded: three attempts, then a diagnosable failure the provider can retry.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
    expect(logged('webhook_failed')[0]).toMatchObject({ dbErrorCode: 'P2002', attempt: 3 });
  });

  it('never swallows a non-conflict failure as a convergence retry', async () => {
    prismaMock.$transaction.mockRejectedValue(Object.assign(new Error('nope'), { code: 'P2025' }));
    const result = await processVerifiedEvent(subscriptionCreated(), adapter());
    expect(result).toEqual({ status: 500, outcome: 'failed' });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(logged('webhook_conflict_detected')).toHaveLength(0);
  });
});
