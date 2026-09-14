import { describe, expect, it } from 'vitest';
import {
  PLAN_ENTITLEMENTS,
  PRODUCT_CAPABILITIES,
  getPlanEntitlement,
  periodKey,
} from '../registry';

/**
 * The two capabilities this phase added, asserted against the ONE registry.
 *
 * The point of these tests is not that 3 and 25 are the right numbers — pricing
 * can change them — but that they live in the registry, that they are separate
 * from the capabilities they are easily confused with, and that nothing else in
 * the codebase has to know them.
 */

describe('stored_source_cvs', () => {
  it('is a resource limit on original uploaded CVs', () => {
    expect(getPlanEntitlement('FREE', 'stored_source_cvs')).toEqual({ mode: 'resource_limit', limit: 3 });
    expect(getPlanEntitlement('PRO', 'stored_source_cvs')).toEqual({ mode: 'resource_limit', limit: 25 });
  });

  it('is not the same thing as generated CVs, analyses, or retention', () => {
    // Four concepts that all sound like "how many CVs do I get". They are
    // separate capabilities counted over separate tables — which the import
    // integration suite proves against a real database. Here the point is that
    // they are independent settings, so a change to one cannot move another.
    // (Free happens to allow 3 source CVs and 3 generated CVs; that coincidence
    // is not a relationship, which is why PRO's values are asserted too.)
    expect(getPlanEntitlement('PRO', 'stored_source_cvs')).not.toEqual(
      getPlanEntitlement('PRO', 'stored_generated_cvs')
    );
    expect(getPlanEntitlement('PRO', 'stored_source_cvs')).not.toEqual(
      getPlanEntitlement('PRO', 'stored_analyses')
    );
    // Retention is a DURATION, not a count — a different mode entirely.
    expect(getPlanEntitlement('FREE', 'source_file_retention').mode).toBe('partial');
    expect(getPlanEntitlement('FREE', 'stored_source_cvs').mode).toBe('resource_limit');
  });
});

describe('cv_import_reconciliation', () => {
  it('is its own quota, at the agreed launch values', () => {
    expect(getPlanEntitlement('FREE', 'cv_import_reconciliation')).toEqual({
      mode: 'quota',
      limit: 1,
      period: 'lifetime',
    });
    expect(getPlanEntitlement('PRO', 'cv_import_reconciliation')).toEqual({
      mode: 'quota',
      limit: 10,
      period: 'month',
    });
  });

  it('is separate from profile_reconciliation, which is unchanged', () => {
    // Two different comparisons over two different inputs. Sharing one allowance
    // would mean using the import comparison silently costs the user their
    // job-application comparison.
    expect(getPlanEntitlement('FREE', 'profile_reconciliation')).toEqual({
      mode: 'quota',
      limit: 1,
      period: 'lifetime',
    });
    expect(getPlanEntitlement('PRO', 'profile_reconciliation')).toEqual({
      mode: 'quota',
      limit: 10,
      period: 'month',
    });
  });

  it('uses a lifetime bucket on Free, so a new month does not refill it', () => {
    const january = periodKey('lifetime', new Date('2026-01-15T00:00:00Z'));
    const july = periodKey('lifetime', new Date('2026-07-15T00:00:00Z'));
    expect(january).toBe('lifetime');
    expect(july).toBe('lifetime');
  });
});

describe('registry integrity', () => {
  it('defines every capability on both plans', () => {
    for (const capability of PRODUCT_CAPABILITIES) {
      expect(PLAN_ENTITLEMENTS.FREE[capability], `FREE is missing ${capability}`).toBeDefined();
      expect(PLAN_ENTITLEMENTS.PRO[capability], `PRO is missing ${capability}`).toBeDefined();
    }
  });

  it('never makes an AI-backed capability unlimited', () => {
    // Rule from the registry's own header: only deterministic work is `enabled`.
    for (const capability of ['cv_import_reconciliation', 'profile_reconciliation'] as const) {
      for (const plan of ['FREE', 'PRO'] as const) {
        expect(getPlanEntitlement(plan, capability).mode).toBe('quota');
      }
    }
  });
});
