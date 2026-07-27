import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tier: 'free' as string,
  used: 0,
  profileCount: 0,
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    // Plan is resolved from billing purchases; these tests all exercise FREE.
    user: { findUnique: vi.fn(async () => ({ billingAccount: { purchases: [] } })) },
    profile: {
      count: vi.fn(async () => mocks.profileCount),
      findMany: vi.fn(async () => []),
    },
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

// The entitlement service reads quota usage from the reservation ledger. Its
// atomic behaviour is proven in capability-reservation's own unit and real-DB
// suites; here we only need the count it reports, so the ledger is mocked.
vi.mock('@/shared/services/capability-reservation', () => ({
  countActiveUsage: vi.fn(async () => mocks.used),
  consumeCapability: vi.fn(async () => true),
}));

import { assertCapability, checkCapability, EntitlementRequiredError } from '../server';

describe('server entitlement decisions', () => {
  beforeEach(() => {
    mocks.tier = 'free';
    mocks.used = 0;
    mocks.profileCount = 0;
  });

  it('allows enabled capabilities', async () => {
    await expect(checkCapability('u1', 'ats_analysis')).resolves.toMatchObject({
      allowed: true,
      reason: 'allowed',
      plan: 'FREE',
    });
  });

  it('rejects disabled capabilities with an upgrade target', async () => {
    const decision = await checkCapability('u1', 'advanced_tools');
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'plan_required',
      upgradeTarget: 'PRO',
    });
    await expect(assertCapability('u1', 'advanced_tools')).rejects.toBeInstanceOf(
      EntitlementRequiredError
    );
  });

  it('reports quota usage and remaining units from the reservation ledger', async () => {
    // Free job-match analyses are 2/month at launch.
    mocks.used = 1;
    await expect(checkCapability('u1', 'job_match_analysis')).resolves.toMatchObject({
      allowed: true,
      used: 1,
      limit: 2,
      remaining: 1,
      reason: 'quota_available',
    });
    mocks.used = 2;
    await expect(checkCapability('u1', 'job_match_analysis')).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      reason: 'quota_exhausted',
    });
  });

  it('counts each quota capability independently', async () => {
    // AI-enhanced ATS and job-match are independent launch quotas (1 and 2/month);
    // the reservation ledger counts each capability's own rows, so exhausting one
    // must not affect the other. The mock returns the same used for both, but the
    // per-capability limits still resolve from the registry.
    mocks.used = 0;
    await expect(checkCapability('u1', 'ai_enhanced_ats_analysis')).resolves.toMatchObject({
      allowed: true,
      limit: 1,
      reason: 'quota_available',
    });
    await expect(checkCapability('u1', 'job_match_analysis')).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      reason: 'quota_available',
    });
  });

  it('uses server-calculated resource counts', async () => {
    mocks.profileCount = 1;
    await expect(checkCapability('u1', 'additional_career_profiles')).resolves.toMatchObject({
      allowed: false,
      used: 1,
      remaining: 0,
      reason: 'resource_limit_reached',
    });
  });

  it('returns the configured partial access level', async () => {
    await expect(checkCapability('u1', 'view_full_job_match_report')).resolves.toMatchObject({
      allowed: true,
      mode: 'partial',
      accessLevel: 'preview',
    });
  });
});
