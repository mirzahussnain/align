import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tier: 'free' as string,
  used: 0,
  profileCount: 0,
  /** Rows in the ONE table the reusable-evidence allowance counts. */
  otherEvidenceCount: 0,
  /** Every canonical Career Profile table, which must never be counted. */
  careerRecordCount: 0,
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
    experience: { count: vi.fn(async () => mocks.careerRecordCount) },
    projectEntry: { count: vi.fn(async () => mocks.careerRecordCount) },
    education: { count: vi.fn(async () => mocks.careerRecordCount) },
    skill: { count: vi.fn(async () => mocks.careerRecordCount) },
    certification: { count: vi.fn(async () => mocks.careerRecordCount) },
    training: { count: vi.fn(async () => mocks.careerRecordCount) },
    licence: { count: vi.fn(async () => mocks.careerRecordCount) },
    professionalRegistration: { count: vi.fn(async () => mocks.careerRecordCount) },
    language: { count: vi.fn(async () => mocks.careerRecordCount) },
    volunteering: { count: vi.fn(async () => mocks.careerRecordCount) },
    otherEvidence: { count: vi.fn(async () => mocks.otherEvidenceCount) },
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
    mocks.otherEvidenceCount = 0;
    mocks.careerRecordCount = 0;
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

  // ── Reusable stored evidence vs canonical Career Profile records ───────────
  //
  // `profile_evidence_storage` is a COMMERCIAL allowance on reusable evidence.
  // Career history — experience, education, projects, skills, certifications,
  // training, licences, registrations, languages, volunteering — is ordinary
  // profile completion and must never consume it.

  it('does not count any canonical Career Profile record as stored evidence', async () => {
    // 10 rows in each of the ten canonical tables — far past the Free limit of 25.
    mocks.careerRecordCount = 10;
    await expect(checkCapability('u1', 'profile_evidence_storage')).resolves.toMatchObject({
      allowed: true,
      used: 0,
      limit: 25,
      remaining: 25,
      reason: 'allowed',
    });
  });

  it('counts reusable evidence records, and only those', async () => {
    mocks.careerRecordCount = 10;
    mocks.otherEvidenceCount = 12;
    await expect(checkCapability('u1', 'profile_evidence_storage')).resolves.toMatchObject({
      allowed: true,
      used: 12,
      limit: 25,
      remaining: 13,
    });
  });

  it('rejects a new reusable evidence record at the Free limit', async () => {
    mocks.otherEvidenceCount = 25;
    await expect(checkCapability('u1', 'profile_evidence_storage')).resolves.toMatchObject({
      allowed: false,
      used: 25,
      remaining: 0,
      reason: 'resource_limit_reached',
      upgradeTarget: 'PRO',
    });
    await expect(assertCapability('u1', 'profile_evidence_storage')).rejects.toBeInstanceOf(
      EntitlementRequiredError
    );
  });

  it('frees a slot as soon as a reusable evidence record is deleted', async () => {
    mocks.otherEvidenceCount = 25;
    await expect(checkCapability('u1', 'profile_evidence_storage')).resolves.toMatchObject({ allowed: false });
    mocks.otherEvidenceCount = 24;
    await expect(checkCapability('u1', 'profile_evidence_storage')).resolves.toMatchObject({
      allowed: true,
      used: 24,
      remaining: 1,
    });
  });

  it('reads the count from one query over the reusable-evidence table alone', async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    vi.mocked(prisma.experience.count).mockClear();
    vi.mocked(prisma.skill.count).mockClear();
    vi.mocked(prisma.otherEvidence.count).mockClear();
    await checkCapability('u1', 'profile_evidence_storage');
    expect(prisma.otherEvidence.count).toHaveBeenCalledTimes(1);
    expect(prisma.experience.count).not.toHaveBeenCalled();
    expect(prisma.skill.count).not.toHaveBeenCalled();
  });

  it('returns the configured partial access level', async () => {
    await expect(checkCapability('u1', 'view_full_job_match_report')).resolves.toMatchObject({
      allowed: true,
      mode: 'partial',
      accessLevel: 'preview',
    });
  });
});
