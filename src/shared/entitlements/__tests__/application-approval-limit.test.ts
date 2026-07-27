import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Per-application approval cap (§2, §25): Free may approve 2 evidence items per
 * application, Pro is effectively unrestricted. "Approved items for an
 * application" is the sum of application-scoped approvals — captured application
 * evidence plus approved profile-evidence snapshots — for one analysis.
 */
const state = vi.hoisted(() => ({
  tier: 'free' as string | null,
  contexts: 0,
  approvals: 0,
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        billingAccount: {
          purchases:
            state.tier === 'pro'
              ? [
                  {
                    id: 'pro',
                    provider: 'STRIPE',
                    arrangement: 'RECURRING',
                    offerId: 'PRO_MONTHLY',
                    planId: 'PRO',
                    status: 'ACTIVE',
                    providerCustomerId: 'cus_1',
                    currentPeriodStart: new Date(Date.now() - 86_400_000),
                    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
                    cancelAtPeriodEnd: false,
                    createdAt: new Date(Date.now() - 86_400_000),
                    updatedAt: new Date(Date.now() - 86_400_000),
                  },
                ]
              : [],
        },
      })),
    },
    applicationEvidenceContext: { count: vi.fn(async () => state.contexts) },
    profileEvidenceApproval: { count: vi.fn(async () => state.approvals) },
  },
}));

import {
  getApplicationApprovalDecision,
  assertApplicationApprovalLimit,
  EntitlementRequiredError,
} from '../server';

beforeEach(() => {
  state.tier = 'free';
  state.contexts = 0;
  state.approvals = 0;
});

describe('getApplicationApprovalDecision', () => {
  it('allows the first two Free approvals per application', async () => {
    state.contexts = 1;
    state.approvals = 0;
    const d = await getApplicationApprovalDecision('u1', 'an-1');
    expect(d).toMatchObject({ plan: 'FREE', limit: 2, used: 1, remaining: 1, allowed: true });
  });

  it('blocks the third Free approval and points to Pro', async () => {
    state.contexts = 1;
    state.approvals = 1; // 2 total
    const d = await getApplicationApprovalDecision('u1', 'an-1');
    expect(d).toMatchObject({
      plan: 'FREE',
      limit: 2,
      used: 2,
      remaining: 0,
      allowed: false,
      reason: 'resource_limit_reached',
      upgradeTarget: 'PRO',
    });
  });

  it('counts both application-scoped tables toward the cap', async () => {
    state.contexts = 2;
    state.approvals = 3;
    const d = await getApplicationApprovalDecision('u1', 'an-1');
    expect(d.used).toBe(5);
  });

  it('applies the high Pro limit', async () => {
    state.tier = 'pro';
    state.contexts = 50;
    const d = await getApplicationApprovalDecision('u1', 'an-1');
    expect(d).toMatchObject({ plan: 'PRO', limit: 1000, allowed: true });
  });
});

describe('assertApplicationApprovalLimit', () => {
  it('throws the canonical entitlement error at the Free limit', async () => {
    state.contexts = 2;
    await expect(assertApplicationApprovalLimit('u1', 'an-1')).rejects.toBeInstanceOf(EntitlementRequiredError);
  });

  it('permits a new approval below the limit', async () => {
    state.contexts = 1;
    await expect(assertApplicationApprovalLimit('u1', 'an-1')).resolves.toBeUndefined();
  });

  it('frees a slot when an approval is withdrawn (count drops)', async () => {
    state.contexts = 2;
    await expect(assertApplicationApprovalLimit('u1', 'an-1')).rejects.toBeInstanceOf(EntitlementRequiredError);
    state.contexts = 1; // one withdrawn
    await expect(assertApplicationApprovalLimit('u1', 'an-1')).resolves.toBeUndefined();
  });

  it('never blocks Pro at ordinary volumes', async () => {
    state.tier = 'pro';
    state.contexts = 100;
    await expect(assertApplicationApprovalLimit('u1', 'an-1')).resolves.toBeUndefined();
  });
});
