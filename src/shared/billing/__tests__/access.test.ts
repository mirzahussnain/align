import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingPurchase } from '@/generated/prisma/client';

const state = vi.hoisted(() => ({
  purchases: [] as BillingPurchase[],
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        billingAccount: { purchases: state.purchases },
      })),
    },
  },
}));

import { resolveBillingAccess } from '../access';

const NOW = new Date('2026-07-26T12:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function purchase(overrides: Partial<BillingPurchase>): BillingPurchase {
  return {
    id: overrides.id ?? 'p1',
    billingAccountId: 'acc1',
    provider: 'STRIPE',
    arrangement: 'RECURRING',
    offerId: 'PRO_MONTHLY',
    planId: 'PRO',
    status: 'ACTIVE',
    providerCustomerId: 'cus_1',
    providerPurchaseId: null,
    providerSubscriptionId: null,
    providerPriceId: null,
    accessStartsAt: null,
    accessEndsAt: null,
    currentPeriodStart: days(-5),
    currentPeriodEnd: days(25),
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    graceEndsAt: null,
    cancelledAt: null,
    expiredAt: null,
    refundedAt: null,
    createdAt: days(-5),
    updatedAt: days(-5),
    ...overrides,
  } as BillingPurchase;
}

describe('resolveBillingAccess', () => {
  beforeEach(() => {
    state.purchases = [];
  });

  it('defaults to Free when there are no purchases', async () => {
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'FREE', source: 'FREE_DEFAULT', status: 'FREE' });
  });

  it('grants Pro for an active recurring purchase', async () => {
    state.purchases = [purchase({})];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({
      effectivePlan: 'PRO',
      source: 'RECURRING_PURCHASE',
      status: 'ACTIVE',
      activeOfferId: 'PRO_MONTHLY',
      provider: 'STRIPE',
    });
  });

  it('grants Pro while trialing', async () => {
    state.purchases = [purchase({ status: 'TRIALING', trialEndsAt: days(3) })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'PRO', source: 'TRIAL', status: 'TRIALING' });
  });

  it('keeps Pro for past-due inside the grace window', async () => {
    state.purchases = [purchase({ status: 'PAST_DUE', currentPeriodEnd: days(-1), graceEndsAt: days(2) })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'PRO', status: 'PAST_DUE_GRACE' });
    expect(r.graceEndsAt).toEqual(days(2));
  });

  it('drops to Free for past-due after grace', async () => {
    state.purchases = [purchase({ status: 'PAST_DUE', currentPeriodEnd: days(-5), graceEndsAt: days(-1) })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'FREE', status: 'UNPAID' });
  });

  it('keeps Pro and reports the schedule when cancellation is pending at period end', async () => {
    // The state a Customer Portal cancellation produces: Stripe keeps the
    // subscription ACTIVE and only ends it when the period lapses.
    state.purchases = [
      purchase({ status: 'ACTIVE', cancelAtPeriodEnd: true, currentPeriodEnd: days(25), accessEndsAt: days(25) }),
    ];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'PRO', status: 'ACTIVE', cancelAtPeriodEnd: true });
    expect(r.accessEndsAt).toEqual(days(25));
  });

  it('keeps Pro when cancelled before the period end', async () => {
    state.purchases = [purchase({ status: 'CANCELLED', cancelAtPeriodEnd: true, currentPeriodEnd: days(10) })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'PRO', status: 'CANCELLED_ACTIVE', cancelAtPeriodEnd: true });
  });

  it('drops to Free when cancelled after the period end', async () => {
    state.purchases = [purchase({ status: 'CANCELLED', currentPeriodEnd: days(-2) })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'FREE', status: 'EXPIRED' });
  });

  it('grants Pro for an active fixed-term pass', async () => {
    state.purchases = [
      purchase({
        arrangement: 'FIXED_TERM',
        offerId: 'PRO_MONTHLY',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        accessStartsAt: days(-1),
        accessEndsAt: days(14),
      }),
    ];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'PRO', source: 'FIXED_TERM_PURCHASE', status: 'ACTIVE' });
    expect(r.accessEndsAt).toEqual(days(14));
  });

  it('drops to Free for an expired fixed-term pass', async () => {
    state.purchases = [
      purchase({
        arrangement: 'FIXED_TERM',
        status: 'EXPIRED',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        accessStartsAt: days(-20),
        accessEndsAt: days(-5),
      }),
    ];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r.effectivePlan).toBe('FREE');
  });

  it('treats a refunded purchase as Free', async () => {
    state.purchases = [purchase({ status: 'REFUNDED', refundedAt: days(-1) })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r.effectivePlan).toBe('FREE');
  });

  it('treats an incomplete purchase as Free', async () => {
    state.purchases = [purchase({ status: 'INCOMPLETE' })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'FREE', status: 'INCOMPLETE' });
  });

  it('lets a higher-ranked Pro grant win over overlapping Free', async () => {
    state.purchases = [
      purchase({ id: 'free1', planId: 'FREE', offerId: 'PRO_MONTHLY', arrangement: 'MANUAL', status: 'ACTIVE' }),
      purchase({ id: 'pro1' }),
    ];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r.effectivePlan).toBe('PRO');
    expect(r.activePurchaseId).toBe('pro1');
  });

  it('resolves equal-ranked overlapping grants deterministically (latest access end)', async () => {
    state.purchases = [
      purchase({ id: 'a', currentPeriodEnd: days(10) }),
      purchase({ id: 'b', currentPeriodEnd: days(40) }),
    ];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r.activePurchaseId).toBe('b');
  });

  it('fails safely on an invalid plan/offer record', async () => {
    state.purchases = [purchase({ planId: 'PREMIUM', offerId: 'NOPE' })];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r.effectivePlan).toBe('FREE');
  });

  it('grants Free when a user has no billing account at all', async () => {
    state.purchases = [];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r).toMatchObject({ effectivePlan: 'FREE', source: 'FREE_DEFAULT' });
  });

  it('derives the plan solely from purchases (no legacy tier authority)', async () => {
    state.purchases = [purchase({})];
    const r = await resolveBillingAccess('u1', NOW);
    expect(r.effectivePlan).toBe('PRO');
  });
});
