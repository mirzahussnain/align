import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminDataAccess: vi.fn(),
  resolveBillingAccessForUsers: vi.fn(),
  queryRaw: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  aiFindMany: vi.fn(),
  aiGroupBy: vi.fn(),
  atsFindMany: vi.fn(),
  jobMatchFindMany: vi.fn(),
  billingPurchaseFindMany: vi.fn(),
}));

vi.mock('../authorization', () => ({
  requireAdminDataAccess: mocks.requireAdminDataAccess,
}));
vi.mock('@/shared/billing/access', () => ({
  resolveBillingAccessForUsers: mocks.resolveBillingAccessForUsers,
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    aiUsageEvent: { findMany: mocks.aiFindMany, groupBy: mocks.aiGroupBy },
    atsAnalysis: { findMany: mocks.atsFindMany },
    jobMatch: { findMany: mocks.jobMatchFindMany },
    billingPurchase: { findMany: mocks.billingPurchaseFindMany },
  },
}));

import {
  defaultAdminAiUsageFrom,
  loadAdminAiUsage,
  loadAdminOverview,
  loadAdminUsers,
} from '../data';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const originalAdminEmails = process.env.ADMIN_EMAILS;

function activityUser(input: {
  id: string;
  email: string;
  createdAt?: Date;
  updatedAt?: Date;
  emailVerified?: boolean;
}) {
  return {
    id: input.id,
    email: input.email,
    emailVerified: input.emailVerified ?? true,
    createdAt: input.createdAt ?? new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-09-20T10:00:00.000Z'),
    onboardedAt: null,
    onboardingState: null,
    sessions: [],
    atsAnalyses: [],
    jobMatches: [],
    generatedCVs: [],
    aiUsageEvents: [],
    _count: { storedCvs: 0, atsAnalyses: 0, jobMatches: 0 },
  };
}

describe('admin data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = 'admin@align.test';
    mocks.requireAdminDataAccess.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@align.test' },
    });
    mocks.atsFindMany.mockResolvedValue([]);
    mocks.jobMatchFindMany.mockResolvedValue([]);
    mocks.billingPurchaseFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it('defaults AI usage to the current UTC month', () => {
    expect(defaultAdminAiUsageFrom(NOW)).toBe('2026-09-01');
  });

  it('enforces admin authorization before reading server data', async () => {
    mocks.requireAdminDataAccess.mockRejectedValue(new Error('ADMIN_FORBIDDEN'));

    await expect(loadAdminOverview(NOW)).rejects.toThrow('ADMIN_FORBIDDEN');
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.aiFindMany).not.toHaveBeenCalled();
  });

  it('excludes internal accounts from customer KPIs and keeps AI attempts distinct from feature runs', async () => {
    mocks.userFindMany
      .mockResolvedValueOnce([
        activityUser({ id: 'admin', email: 'admin@align.test' }),
        activityUser({ id: 'free', email: 'free@align.test', updatedAt: new Date('2026-09-23T10:00:00Z') }),
        activityUser({ id: 'pro', email: 'pro@align.test', createdAt: new Date('2026-08-01T10:00:00Z') }),
      ])
      .mockResolvedValueOnce([]);
    mocks.resolveBillingAccessForUsers.mockResolvedValue(
      new Map([
        ['admin', { effectivePlan: 'PRO' }],
        ['free', { effectivePlan: 'FREE' }],
        ['pro', { effectivePlan: 'PRO' }],
      ])
    );
    mocks.queryRaw
      .mockResolvedValueOnce([{
        featureRuns: 1, providerAttempts: 3, unattributedAttempts: 1,
        successfulFeatureRuns: 1, fallbackFeatureRuns: 1, fallbackAttempts: 1,
        averageLatencyMs: 200, totalTokens: 265, estimatedCostUsd: 0.002,
        knownCostAttempts: 2, tokenBearingAttempts: 3,
        providerBreakdown: { gemini: 2, groq: 1 },
      }])
      .mockResolvedValueOnce([{ today: 1, last7Days: 2, last30Days: 2 }]);
    mocks.aiFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.aiGroupBy.mockResolvedValue([
      { capability: 'job_match_analysis', _count: { capability: 2 } },
    ]);

    const result = await loadAdminOverview(NOW);

    expect(result).toMatchObject({
      customerUsers: 2,
      internalUsers: 1,
      freeUsers: 1,
      proUsers: 1,
      conversionRate: 50,
      aiFeatureRunsThisMonth: 1,
      providerAttemptsThisMonth: 3,
      unattributedAttemptsThisMonth: 1,
      aiSuccessRate: 100,
      fallbackRate: 100,
      providerBreakdown: { gemini: 2, groq: 1 },
      knownCostCoverage: 66.66666666666666,
      estimatedAiCostUsd: 0.002,
      mostUsedAiCapability: 'job_match_analysis',
    });
  });

  it('returns safe paginated user rows with internal identity and last activity', async () => {
    mocks.userCount.mockResolvedValue(1);
    mocks.userFindMany.mockResolvedValue([
      {
        ...activityUser({ id: 'u1', email: 'admin@align.test' }),
        onboardedAt: new Date('2026-09-02T10:00:00.000Z'),
        sessions: [{ updatedAt: new Date('2026-09-22T10:00:00.000Z') }],
        atsAnalyses: [{ createdAt: new Date('2026-09-21T10:00:00.000Z') }],
        _count: { storedCvs: 2, atsAnalyses: 4, jobMatches: 3 },
      },
    ]);
    mocks.resolveBillingAccessForUsers.mockResolvedValue(
      new Map([['u1', { effectivePlan: 'PRO' }]])
    );

    const result = await loadAdminUsers({ search: 'admin', page: 1, pageSize: 20 });

    expect(result.rows[0]).toMatchObject({
      id: 'u1',
      email: 'admin@align.test',
      isInternal: true,
      plan: 'PRO',
      onboardingState: 'Completed',
      lastActivityAt: new Date('2026-09-22T10:00:00.000Z'),
    });
  });

  it('applies AI usage filters and reports run, fallback, provider, and cost coverage summaries', async () => {
    mocks.queryRaw.mockResolvedValueOnce([{
      featureRuns: 1, providerAttempts: 2, unattributedAttempts: 1,
      successfulFeatureRuns: 0, fallbackFeatureRuns: 1, fallbackAttempts: 1,
      averageLatencyMs: 175, totalTokens: null, estimatedCostUsd: null,
      knownCostAttempts: 0, tokenBearingAttempts: 1, providerBreakdown: { groq: 2 },
    }]);
    mocks.aiFindMany
      .mockResolvedValueOnce([
        {
          id: 'evt-1', capability: 'job_match_analysis', provider: 'groq', model: 'llama-3.3-70b-versatile',
          inputTokens: 120, outputTokens: 80, latencyMs: 150, success: false, errorCode: 'TIMEOUT',
          fallbackUsed: true, attemptNumber: 2, estimatedCostUsd: null,
          createdAt: new Date('2026-09-22T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        { capability: 'job_match_analysis', provider: 'groq', model: 'llama-3.3-70b-versatile' },
      ]);

    const result = await loadAdminAiUsage({
      from: '2026-09-01', to: '2026-09-22', capability: 'job_match_analysis',
      provider: 'groq', model: 'llama-3.3-70b-versatile', success: false,
      page: 1, pageSize: 25,
    });

    expect(result.summary).toMatchObject({
      featureRuns: 1,
      providerAttempts: 2,
      unattributedAttempts: 1,
      fallbackRate: 100,
      fallbackAttempts: 1,
      providerBreakdown: { groq: 2 },
      knownCostCoverage: 0,
      estimatedCostUsd: null,
      totalTokens: null,
    });
    expect(result.rows[0]).toMatchObject({ estimatedCostUsd: null, errorCode: 'TIMEOUT' });
  });
});
