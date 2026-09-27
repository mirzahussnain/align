import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminDataAccess: vi.fn(),
  resolveBillingAccessForUsers: vi.fn(),
  queryRaw: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock('../authorization', () => ({ requireAdminDataAccess: mocks.requireAdminDataAccess }));
vi.mock('@/shared/billing/access', () => ({
  resolveBillingAccessForUsers: mocks.resolveBillingAccessForUsers,
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    aiUsageEvent: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

import { loadAdminUsers } from '../data';

const originalAdminEmails = process.env.ADMIN_EMAILS;

function user(id: string, email: string, lastActivityAt: Date) {
  return {
    id,
    email,
    emailVerified: true,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    onboardedAt: null,
    onboardingState: null,
    sessions: [{ updatedAt: lastActivityAt }],
    atsAnalyses: [],
    jobMatches: [],
    generatedCVs: [],
    aiUsageEvents: [],
    _count: { storedCvs: 0, atsAnalyses: 0, jobMatches: 0 },
  };
}

describe('refined admin users data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = 'admin@align.test';
    mocks.requireAdminDataAccess.mockResolvedValue({ user: { id: 'admin' } });
    mocks.userCount.mockResolvedValue(2);
    mocks.queryRaw.mockResolvedValue([{ id: 'newer' }, { id: 'older' }]);
    mocks.userFindMany.mockResolvedValue([
      user('older', 'admin@align.test', new Date('2026-09-20T10:00:00.000Z')),
      user('newer', 'member@align.test', new Date('2026-09-24T10:00:00.000Z')),
    ]);
    mocks.resolveBillingAccessForUsers.mockResolvedValue(
      new Map([
        ['older', { effectivePlan: 'PRO' }],
        ['newer', { effectivePlan: 'FREE' }],
      ])
    );
  });

  afterEach(() => {
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it('sorts the full result by last activity and identifies internal users', async () => {
    const result = await loadAdminUsers({
      page: 1,
      pageSize: 20,
      sort: 'last_activity',
    });

    expect(result.rows.map(({ id }) => id)).toEqual(['newer', 'older']);
    expect(result.rows.find(({ id }) => id === 'older')).toMatchObject({ isInternal: true });
    expect(result.rows.find(({ id }) => id === 'newer')).toMatchObject({ isInternal: false });
  });
});
