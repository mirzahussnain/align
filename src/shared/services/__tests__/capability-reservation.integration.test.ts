// Real-PostgreSQL proof of reservation atomicity.
//
// The unit suite proves the lifecycle logic against an in-memory stand-in, but
// only a real database can prove that the advisory lock actually serialises two
// requests competing for the last quota unit. This suite therefore talks to the
// live local Postgres and is SKIPPED unless DATABASE_URL points at a local host
// — it never runs against a remote/production database, and it seeds and tears
// down its own throwaway user so it cannot touch anyone else's data.
//
// Run it with the local database URL, e.g.
//   DATABASE_URL='postgresql://align:align@localhost:5433/align?schema=public' \
//     npx vitest run src/shared/services/__tests__/capability-reservation.integration.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);

// Import the real client lazily so the mocked unit suites are unaffected and the
// module only loads when we are actually going to use it.
const { prisma } = isLocalDb ? await import('@/shared/lib/prisma') : { prisma: null as never };
const {
  reserveCapability,
  commitCapability,
  releaseCapability,
  countActiveUsage,
} = await import('../capability-reservation');

const CAP = 'ai_enhanced_ats_analysis' as const; // FREE quota(5)
const PERIOD = (() => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
})();

describe.skipIf(!isLocalDb)('capability reservation — real Postgres concurrency', () => {
  let userId: string;

  beforeAll(async () => {
    userId = `test_res_${randomUUID()}`;
    await prisma.user.create({
      data: { id: userId, name: 'Reservation Test', email: `${userId}@example.test` },
    });
  });

  afterAll(async () => {
    // Cascades reservations and usage counters.
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.capabilityReservation.deleteMany({ where: { userId } });
    await prisma.usageCounter.deleteMany({ where: { userId } });
  });

  async function fillCommitted(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const op = `seed_${randomUUID()}`;
      await reserveCapability({ userId, capability: CAP, operationId: op });
      await commitCapability({ userId, capability: CAP, operationId: op });
    }
  }

  it('lets only one of two concurrent requests take the last unit', async () => {
    await fillCommitted(4); // one unit left of five

    const [a, b] = await Promise.all([
      reserveCapability({ userId, capability: CAP, operationId: `op_${randomUUID()}` }),
      reserveCapability({ userId, capability: CAP, operationId: `op_${randomUUID()}` }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['exhausted', 'reserved']);
    expect(await countActiveUsage(prisma, userId, CAP, PERIOD, new Date())).toBe(5);
  });

  it('shares a single reservation for concurrent duplicate operation ids', async () => {
    const op = `dupe_${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => reserveCapability({ userId, capability: CAP, operationId: op }))
    );

    expect(results.every((r) => r.status === 'reserved')).toBe(true);
    const rows = await prisma.capabilityReservation.count({ where: { userId, capability: CAP, operationId: op } });
    expect(rows).toBe(1);
  });

  it('charges exactly once when commit is repeated', async () => {
    const op = `commit_${randomUUID()}`;
    await reserveCapability({ userId, capability: CAP, operationId: op });
    await Promise.all([
      commitCapability({ userId, capability: CAP, operationId: op, resultRef: 'analysis_x' }),
      commitCapability({ userId, capability: CAP, operationId: op, resultRef: 'analysis_x' }),
    ]);
    await commitCapability({ userId, capability: CAP, operationId: op });

    const counter = await prisma.usageCounter.findUnique({
      where: { userId_period: { userId, period: PERIOD } },
      select: { aiAnalyses: true },
    });
    expect(counter?.aiAnalyses).toBe(1);
    expect(await countActiveUsage(prisma, userId, CAP, PERIOD, new Date())).toBe(1);
  });

  it('returns a released unit to the pool', async () => {
    await fillCommitted(4);
    const op = `rel_${randomUUID()}`;
    await reserveCapability({ userId, capability: CAP, operationId: op });
    expect(await countActiveUsage(prisma, userId, CAP, PERIOD, new Date())).toBe(5);

    await releaseCapability({ userId, capability: CAP, operationId: op, reason: 'provider_unavailable' });
    expect(await countActiveUsage(prisma, userId, CAP, PERIOD, new Date())).toBe(4);

    // The freed unit can be reserved again.
    const again = await reserveCapability({ userId, capability: CAP, operationId: `op_${randomUUID()}` });
    expect(again.status).toBe('reserved');
  });

  it('stops counting an expired reservation and frees its unit', async () => {
    await fillCommitted(4);
    const stale = `stale_${randomUUID()}`;
    await reserveCapability({ userId, capability: CAP, operationId: stale });
    // Force the hold to look abandoned.
    await prisma.capabilityReservation.updateMany({
      where: { userId, capability: CAP, operationId: stale },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    // A fresh reserve triggers lazy expiry and succeeds despite five prior holds.
    const fresh = await reserveCapability({ userId, capability: CAP, operationId: `op_${randomUUID()}` });
    expect(fresh.status).toBe('reserved');
    const staleRow = await prisma.capabilityReservation.findFirst({ where: { userId, operationId: stale } });
    expect(staleRow?.status).toBe('EXPIRED');
  });

  it('commits one unit for one logical operation regardless of provider path', async () => {
    // Fallback across providers is a single logical op; reservation is at the
    // route boundary, so a first-provider failure then fallback success commits once.
    const op = `logical_${randomUUID()}`;
    await reserveCapability({ userId, capability: CAP, operationId: op });
    await commitCapability({ userId, capability: CAP, operationId: op });
    expect(await countActiveUsage(prisma, userId, CAP, PERIOD, new Date())).toBe(1);
  });

  it('charges zero when the whole operation fails (release) or persistence fails', async () => {
    const op = `fail_${randomUUID()}`;
    await reserveCapability({ userId, capability: CAP, operationId: op });
    // All providers failed, or persistence threw after a successful provider call:
    // either way the route releases and nothing is committed.
    await releaseCapability({ userId, capability: CAP, operationId: op, reason: 'provider_unavailable' });
    expect(await countActiveUsage(prisma, userId, CAP, PERIOD, new Date())).toBe(0);
    const counter = await prisma.usageCounter.findUnique({
      where: { userId_period: { userId, period: PERIOD } },
      select: { aiAnalyses: true },
    });
    expect(counter?.aiAnalyses ?? 0).toBe(0);
  });

  it('recovers a committed result by operation id without re-reserving', async () => {
    const op = `recover_${randomUUID()}`;
    await reserveCapability({ userId, capability: CAP, operationId: op });
    await commitCapability({ userId, capability: CAP, operationId: op, resultRef: 'analysis_recover' });

    const again = await reserveCapability({ userId, capability: CAP, operationId: op });
    expect(again.status).toBe('recovered');
    if (again.status === 'recovered') expect(again.reservation.resultRef).toBe('analysis_recover');
    // No second unit was taken.
    expect(await countActiveUsage(prisma, userId, CAP, PERIOD, new Date())).toBe(1);
  });
});
