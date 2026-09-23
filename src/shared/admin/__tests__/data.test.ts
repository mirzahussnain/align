import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminDataAccess: vi.fn(),
  resolveBillingAccessForUsers: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  aiCount: vi.fn(),
  aiAggregate: vi.fn(),
  aiGroupBy: vi.fn(),
  aiFindMany: vi.fn(),
}));

vi.mock('../authorization', () => ({
  requireAdminDataAccess: mocks.requireAdminDataAccess,
}));
vi.mock('@/shared/billing/access', () => ({
  resolveBillingAccessForUsers: mocks.resolveBillingAccessForUsers,
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    aiUsageEvent: {
      count: mocks.aiCount,
      aggregate: mocks.aiAggregate,
      groupBy: mocks.aiGroupBy,
      findMany: mocks.aiFindMany,
    },
  },
}));

import {
  defaultAdminAiUsageFrom,
  loadAdminAiUsage,
  loadAdminOverview,
  loadAdminUsers,
} from '../data';

const NOW = new Date('2026-09-23T12:00:00.000Z');

describe('admin data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminDataAccess.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@align.test' },
    });
  });

  it('defaults AI usage to the current UTC month', () => {
    expect(defaultAdminAiUsageFrom(NOW)).toBe('2026-09-01');
  });

  it('enforces admin authorization before reading server data', async () => {
    mocks.requireAdminDataAccess.mockRejectedValue(new Error('ADMIN_FORBIDDEN'));

    await expect(loadAdminOverview(NOW)).rejects.toThrow('ADMIN_FORBIDDEN');
    expect(mocks.userCount).not.toHaveBeenCalled();
    expect(mocks.aiCount).not.toHaveBeenCalled();
  });

  it('aggregates the admin overview using authoritative plan and telemetry data', async () => {
    mocks.userCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);
    mocks.userFindMany.mockResolvedValue([
      { id: 'u1' },
      { id: 'u2' },
      { id: 'u3' },
    ]);
    mocks.resolveBillingAccessForUsers.mockResolvedValue(
      new Map([
        ['u1', { effectivePlan: 'FREE' }],
        ['u2', { effectivePlan: 'PRO' }],
        ['u3', { effectivePlan: 'FREE' }],
      ])
    );
    mocks.aiCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    mocks.aiAggregate.mockResolvedValue({ _sum: { estimatedCostUsd: 1.25 } });
    mocks.aiGroupBy.mockResolvedValue([
      { capability: 'job_match_analysis', _count: { capability: 3 } },
    ]);

    await expect(loadAdminOverview(NOW)).resolves.toEqual({
      totalUsers: 3,
      newUsersThisMonth: 2,
      freeUsers: 2,
      proUsers: 1,
      verifiedUsers: 2,
      unverifiedUsers: 1,
      aiOperationsThisMonth: 5,
      successfulAiOperations: 4,
      failedAiOperations: 1,
      estimatedAiCostUsd: 1.25,
      mostUsedAiCapability: 'job_match_analysis',
    });
  });

  it('returns safe paginated user rows with counts, plan, onboarding, and last activity', async () => {
    mocks.userCount.mockResolvedValue(1);
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'member@align.test',
        emailVerified: true,
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        updatedAt: new Date('2026-09-20T10:00:00.000Z'),
        onboardedAt: new Date('2026-09-02T10:00:00.000Z'),
        onboardingState: { status: 'COMPLETED', stage: 'COMPLETE' },
        sessions: [{ updatedAt: new Date('2026-09-22T10:00:00.000Z') }],
        atsAnalyses: [{ createdAt: new Date('2026-09-21T10:00:00.000Z') }],
        jobMatches: [],
        generatedCVs: [],
        _count: { storedCvs: 2, atsAnalyses: 4, jobMatches: 3 },
      },
    ]);
    mocks.resolveBillingAccessForUsers.mockResolvedValue(
      new Map([['u1', { effectivePlan: 'PRO' }]])
    );

    const result = await loadAdminUsers({ search: 'member', page: 1, pageSize: 20 });

    expect(result).toEqual({
      rows: [
        {
          id: 'u1',
          email: 'member@align.test',
          signupDate: new Date('2026-09-01T10:00:00.000Z'),
          emailVerified: true,
          plan: 'PRO',
          onboardingState: 'Completed',
          storedCvCount: 2,
          analysisCount: 4,
          jobMatchCount: 3,
          lastActivityAt: new Date('2026-09-22T10:00:00.000Z'),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { contains: 'member', mode: 'insensitive' } },
        skip: 0,
        take: 20,
      })
    );
  });

  it('applies AI usage filters and keeps incomplete token or cost totals unavailable', async () => {
    mocks.aiCount
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    mocks.aiAggregate.mockResolvedValue({
      _sum: { inputTokens: 120, outputTokens: 80, estimatedCostUsd: 0.004 },
      _avg: { latencyMs: 150 },
    });
    mocks.aiFindMany
      .mockResolvedValueOnce([
        {
          id: 'evt-1',
          capability: 'job_match_analysis',
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          inputTokens: null,
          outputTokens: null,
          latencyMs: 175,
          success: false,
          errorCode: 'TIMEOUT',
          fallbackUsed: true,
          attemptNumber: 2,
          estimatedCostUsd: null,
          createdAt: new Date('2026-09-22T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        { capability: 'job_match_analysis', provider: 'groq', model: 'llama-3.3-70b-versatile' },
      ]);

    const result = await loadAdminAiUsage({
      from: '2026-09-01',
      to: '2026-09-22',
      capability: 'job_match_analysis',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      success: false,
      page: 1,
      pageSize: 25,
    });

    expect(result.summary).toEqual({
      totalRequests: 2,
      totalTokens: null,
      averageLatencyMs: 150,
      failureRate: 100,
      estimatedCostUsd: null,
    });
    expect(result.rows[0]).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      errorCode: 'TIMEOUT',
    });
    expect(mocks.aiFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lt: new Date('2026-09-23T00:00:00.000Z'),
          },
          capability: 'job_match_analysis',
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          success: false,
        },
      })
    );
  });
});
