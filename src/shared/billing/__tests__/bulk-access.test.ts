import { describe, expect, it, vi } from 'vitest';
import type { BillingPurchase } from '@/generated/prisma/client';

const NOW = new Date('2026-09-23T12:00:00.000Z');

function activeProPurchase(): BillingPurchase {
  return {
    id: 'purchase-1',
    billingAccountId: 'account-1',
    provider: 'STRIPE',
    arrangement: 'RECURRING',
    offerId: 'PRO_MONTHLY',
    planId: 'PRO',
    status: 'ACTIVE',
    providerCustomerId: 'customer-1',
    providerPurchaseId: null,
    providerSubscriptionId: null,
    providerPriceId: null,
    accessStartsAt: new Date('2026-09-01T00:00:00.000Z'),
    accessEndsAt: new Date('2026-10-01T00:00:00.000Z'),
    currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    graceEndsAt: null,
    cancelledAt: null,
    expiredAt: null,
    refundedAt: null,
    lastEventAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { user: { findMany: mocks.findMany } },
}));

import { resolveBillingAccessForUsers } from '../access';

describe('resolveBillingAccessForUsers', () => {
  it('resolves multiple users with one authoritative billing query', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'free-user', billingAccount: null },
      { id: 'pro-user', billingAccount: { purchases: [activeProPurchase()] } },
    ]);

    const plans = await resolveBillingAccessForUsers(['free-user', 'pro-user'], NOW);

    expect(plans.get('free-user')?.effectivePlan).toBe('FREE');
    expect(plans.get('pro-user')?.effectivePlan).toBe('PRO');
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
  });
});
