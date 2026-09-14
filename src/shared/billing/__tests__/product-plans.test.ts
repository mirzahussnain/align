import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_PLAN_ID,
  higherRankedPlan,
  isProductPlanId,
  planRank,
  PRODUCT_PLAN_IDS,
  PRODUCT_PLANS,
  publicPlansByRank,
} from '../product-plans';
import { PLAN_ENTITLEMENTS } from '@/shared/entitlements/registry';

describe('product-plan registry', () => {
  it('exposes only FREE and PRO at launch', () => {
    expect([...PRODUCT_PLAN_IDS]).toEqual(['FREE', 'PRO']);
    expect(publicPlansByRank().map((p) => p.id)).toEqual(['FREE', 'PRO']);
  });

  it('keeps precedence central: PRO outranks FREE', () => {
    expect(planRank('PRO')).toBeGreaterThan(planRank('FREE'));
    expect(higherRankedPlan('FREE', 'PRO')).toBe('PRO');
    expect(higherRankedPlan('PRO', 'FREE')).toBe('PRO');
  });

  it('defaults to FREE', () => {
    expect(DEFAULT_PRODUCT_PLAN_ID).toBe('FREE');
  });

  it('every product plan has entitlement configuration under its entitlementPlanId', () => {
    for (const id of PRODUCT_PLAN_IDS) {
      const plan = PRODUCT_PLANS[id];
      expect(PLAN_ENTITLEMENTS[plan.entitlementPlanId]).toBeDefined();
    }
  });

  it('never encodes a billing interval into the plan identity', () => {
    // Offer ids like PRO_MONTHLY are not product plans; the plan id is interval-free.
    for (const id of PRODUCT_PLAN_IDS) {
      expect(id).not.toMatch(/MONTH|YEAR|ANNUAL|DAY/i);
    }
  });

  it('validates plan ids at runtime', () => {
    expect(isProductPlanId('PRO')).toBe(true);
    expect(isProductPlanId('PREMIUM')).toBe(false);
    expect(isProductPlanId('pro_monthly')).toBe(false);
  });
});
