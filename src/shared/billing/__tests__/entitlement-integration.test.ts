import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingPurchase } from '@/generated/prisma/client';

const state = vi.hoisted(() => ({
  purchases: [] as BillingPurchase[],
  used: 0,
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        billingAccount: { purchases: state.purchases },
      })),
    },
    profile: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    generatedCV: { count: vi.fn(async () => 0) },
    analysis: { count: vi.fn(async () => 0) },
    experience: { count: vi.fn(async () => 0) },
    projectEntry: { count: vi.fn(async () => 0) },
    education: { count: vi.fn(async () => 0) },
    skill: { count: vi.fn(async () => 0) },
    certification: { count: vi.fn(async () => 0) },
    training: { count: vi.fn(async () => 0) },
    licence: { count: vi.fn(async () => 0) },
    professionalRegistration: { count: vi.fn(async () => 0) },
    language: { count: vi.fn(async () => 0) },
    volunteering: { count: vi.fn(async () => 0) },
    otherEvidence: { count: vi.fn(async () => 0) },
  },
}));

vi.mock('@/shared/services/capability-reservation', () => ({
  countActiveUsage: vi.fn(async () => state.used),
  consumeCapability: vi.fn(async () => true),
}));

import { getEntitlement, getUserPlan } from '@/shared/entitlements/server';

const NOW = Date.now();
const days = (n: number) => new Date(NOW + n * 24 * 60 * 60 * 1000);

function activeProPurchase(overrides: Partial<BillingPurchase> = {}): BillingPurchase {
  return {
    id: 'p1',
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

describe('entitlement service is fed by the billing resolver', () => {
  beforeEach(() => {
    state.purchases = [];
    state.used = 0;
  });

  it('resolves Free capability limits when there is no active purchase', async () => {
    expect(await getUserPlan('u1')).toBe('FREE');
    await expect(getEntitlement('u1', 'advanced_tools')).resolves.toMatchObject({
      allowed: false,
      plan: 'FREE',
    });
  });

  it('an active Pro purchase upgrades capability decisions', async () => {
    state.purchases = [activeProPurchase()];
    expect(await getUserPlan('u1')).toBe('PRO');
    await expect(getEntitlement('u1', 'advanced_tools')).resolves.toMatchObject({
      allowed: true,
      plan: 'PRO',
    });
  });

  it('a lapsed purchase (past-due after grace) reverts to Free capability decisions', async () => {
    state.purchases = [activeProPurchase({ status: 'PAST_DUE', currentPeriodEnd: days(-10), graceEndsAt: days(-3) })];
    expect(await getUserPlan('u1')).toBe('FREE');
    await expect(getEntitlement('u1', 'advanced_tools')).resolves.toMatchObject({ allowed: false, plan: 'FREE' });
  });

  it('does not use raw provider status for capability decisions — an active purchase grants Pro', async () => {
    state.purchases = [activeProPurchase()];
    await expect(getEntitlement('u1', 'ai_enhanced_ats_analysis')).resolves.toMatchObject({
      plan: 'PRO',
      limit: 15,
    });
  });

  it('quota decisions still read usage from the reservation ledger, independent of provider', async () => {
    state.purchases = [activeProPurchase({ provider: 'MANUAL' })];
    state.used = 15;
    // Provider identity does not change usage: the count comes from the ledger.
    await expect(getEntitlement('u1', 'ai_enhanced_ats_analysis')).resolves.toMatchObject({
      plan: 'PRO',
      used: 15,
      remaining: 0,
      reason: 'quota_exhausted',
    });
  });
});
