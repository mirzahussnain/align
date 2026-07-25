import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tier: 'free' as string,
  used: 0,
  profileCount: 0,
  usageCreate: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ subscriptionTier: mocks.tier })) },
    profile: {
      count: vi.fn(async () => mocks.profileCount),
      findMany: vi.fn(async () => []),
    },
    generatedCV: { count: vi.fn(async () => 0) },
    analysis: { count: vi.fn(async () => 0) },
    capabilityUsageEvent: {
      count: vi.fn(async () => 0),
      create: mocks.usageCreate,
    },
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

vi.mock('@/shared/services/usage-meter', () => ({
  checkQuota: vi.fn(async () => ({
    allowed: true,
    used: mocks.used,
    limit: 100,
    remaining: 100 - mocks.used,
  })),
  recordUsage: mocks.recordUsage,
}));

import {
  assertCapability,
  checkCapability,
  consumeCapability,
  EntitlementRequiredError,
} from '../server';

describe('server entitlement decisions', () => {
  beforeEach(() => {
    mocks.tier = 'free';
    mocks.used = 0;
    mocks.profileCount = 0;
    mocks.usageCreate.mockReset().mockResolvedValue({ id: 'event-1' });
    mocks.recordUsage.mockReset().mockResolvedValue(undefined);
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

  it('reports quota usage and remaining units', async () => {
    mocks.used = 4;
    await expect(checkCapability('u1', 'ai_enhanced_ats_analysis')).resolves.toMatchObject({
      allowed: true,
      used: 4,
      limit: 5,
      remaining: 1,
      reason: 'quota_available',
    });
    mocks.used = 5;
    await expect(checkCapability('u1', 'ai_enhanced_ats_analysis')).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      reason: 'quota_exhausted',
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

  it('consumes a successful operation once across retries', async () => {
    mocks.usageCreate
      .mockResolvedValueOnce({ id: 'event-1' })
      .mockRejectedValueOnce({ code: 'P2002' });
    await expect(consumeCapability('u1', 'cv_regeneration', 'op-1')).resolves.toBe(true);
    await expect(consumeCapability('u1', 'cv_regeneration', 'op-1')).resolves.toBe(false);
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('u1', 'cvGenerations');
  });
});

