import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny Prisma stand-in supporting exactly the queries the reconciliation
// helper issues: a groupBy over committed reservations and a usageCounter read.
interface Row {
  userId: string;
  capability: string;
  period: string;
  status: string;
  repairOfOperationId: string | null;
}

const store = vi.hoisted(() => ({
  rows: [] as Row[],
  counters: new Map<string, { aiAnalyses: number; cvGenerations: number; profileReasoning: number }>(),
}));

const client = vi.hoisted(() => ({
  capabilityReservation: {
    groupBy: vi.fn(async ({ by, where }: { by: string[]; where: Record<string, unknown> }) => {
      const filtered = store.rows.filter(
        (r) =>
          r.userId === where.userId &&
          r.period === where.period &&
          r.status === where.status &&
          r.repairOfOperationId === where.repairOfOperationId
      );
      const groups = new Map<string, number>();
      for (const row of filtered) {
        const key = String((row as unknown as Record<string, unknown>)[by[0]]);
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      return [...groups.entries()].map(([capability, count]) => ({ capability, _count: { _all: count } }));
    }),
  },
  usageCounter: {
    findUnique: vi.fn(async ({ where }: { where: { userId_period: { userId: string; period: string } } }) => {
      const key = `${where.userId_period.userId}:${where.userId_period.period}`;
      return store.counters.get(key) ?? null;
    }),
    upsert: vi.fn(async ({ where, create }: { where: { userId_period: { userId: string; period: string } }; create: Record<string, number> }) => {
      const key = `${where.userId_period.userId}:${where.userId_period.period}`;
      store.counters.set(key, { aiAnalyses: 0, cvGenerations: 0, profileReasoning: 0, ...create } as never);
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
}));

vi.mock('@/shared/lib/prisma', () => ({ prisma: client }));

import { expectedUsageFromLedger, reconcileUsage } from '../reservation-reconciliation';

const PERIOD = '2026-07';

function committed(capability: string, count: number, repair = false) {
  for (let i = 0; i < count; i++) {
    store.rows.push({ userId: 'u1', capability, period: PERIOD, status: 'COMMITTED', repairOfOperationId: repair ? 'orig' : null });
  }
}

beforeEach(() => {
  store.rows = [];
  store.counters = new Map();
  vi.clearAllMocks();
});

describe('expectedUsageFromLedger', () => {
  it('rebuilds the aggregate from committed reservations, mapping capabilities to counter fields', async () => {
    committed('ai_enhanced_ats_analysis', 3);
    committed('job_match_analysis', 2); // both map to aiAnalyses
    committed('cv_regeneration', 4);
    committed('profile_reconciliation', 1);

    const usage = await expectedUsageFromLedger('u1', PERIOD, client as never);
    expect(usage).toEqual({ aiAnalyses: 5, cvGenerations: 4, profileReasoning: 1 });
  });

  it('excludes repair rows and non-committed rows from the aggregate', async () => {
    committed('cv_regeneration', 2);
    committed('cv_regeneration', 3, true); // repairs — must NOT count
    store.rows.push({ userId: 'u1', capability: 'cv_regeneration', period: PERIOD, status: 'RESERVED', repairOfOperationId: null });
    store.rows.push({ userId: 'u1', capability: 'cv_regeneration', period: PERIOD, status: 'RELEASED', repairOfOperationId: null });
    store.rows.push({ userId: 'u1', capability: 'cv_regeneration', period: PERIOD, status: 'EXPIRED', repairOfOperationId: null });

    const usage = await expectedUsageFromLedger('u1', PERIOD, client as never);
    expect(usage.cvGenerations).toBe(2);
  });
});

describe('reconcileUsage — drift detection', () => {
  it('reports no drift when the counter matches the ledger', async () => {
    committed('ai_enhanced_ats_analysis', 3);
    store.counters.set(`u1:${PERIOD}`, { aiAnalyses: 3, cvGenerations: 0, profileReasoning: 0 });

    const drift = await reconcileUsage('u1', PERIOD, client as never);
    expect(drift.hasDrift).toBe(false);
    expect(drift.delta).toEqual({ aiAnalyses: 0, cvGenerations: 0, profileReasoning: 0 });
  });

  it('detects a counter that over-reports relative to the ledger', async () => {
    committed('ai_enhanced_ats_analysis', 2);
    store.counters.set(`u1:${PERIOD}`, { aiAnalyses: 5, cvGenerations: 0, profileReasoning: 0 });

    const drift = await reconcileUsage('u1', PERIOD, client as never);
    expect(drift.hasDrift).toBe(true);
    expect(drift.expected.aiAnalyses).toBe(2);
    expect(drift.actual.aiAnalyses).toBe(5);
    expect(drift.delta.aiAnalyses).toBe(3);
  });

  it('detects a missing counter row as under-reporting', async () => {
    committed('cv_regeneration', 1);
    const drift = await reconcileUsage('u1', PERIOD, client as never);
    expect(drift.hasDrift).toBe(true);
    expect(drift.delta.cvGenerations).toBe(-1);
  });
});
