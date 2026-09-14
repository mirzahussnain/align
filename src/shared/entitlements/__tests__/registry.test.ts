import { describe, expect, it } from 'vitest';
import {
  getPlanEntitlement,
  isProductCapability,
  PLAN_ENTITLEMENTS,
  PRODUCT_CAPABILITIES,
} from '../registry';

describe('entitlement registry', () => {
  it('declares a FREE and PRO entitlement for every capability', () => {
    for (const capability of PRODUCT_CAPABILITIES) {
      expect(PLAN_ENTITLEMENTS.FREE[capability]).toBeDefined();
      expect(PLAN_ENTITLEMENTS.PRO[capability]).toBeDefined();
    }
  });

  it('keeps provisional limits in the central configuration', () => {
    expect(getPlanEntitlement('FREE', 'cv_regeneration')).toMatchObject({
      mode: 'quota',
      limit: 1,
      period: 'month',
    });
    expect(getPlanEntitlement('PRO', 'additional_career_profiles')).toMatchObject({
      mode: 'resource_limit',
      limit: 3,
    });
  });

  it('rejects unknown capability names at runtime', () => {
    expect(isProductCapability('cv_regeneration')).toBe(true);
    expect(isProductCapability('pro_only_magic')).toBe(false);
  });
});

