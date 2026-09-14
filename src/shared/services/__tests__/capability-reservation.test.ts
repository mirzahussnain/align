import { beforeEach, describe, expect, it, vi } from 'vitest';

// A small in-memory Prisma stand-in that honours the exact query shapes the
// reservation module issues (unique lookup, create, update, expiry updateMany,
// active-usage count, and the derived UsageCounter upsert). It runs the
// $transaction callback inline against itself, so the module's real lifecycle
// logic is exercised deterministically without a database. Genuine atomicity
// under concurrency is proven separately in the real-Postgres integration suite.

interface Row {
  id: string;
  userId: string;
  capability: string;
  operationId: string;
  period: string;
  status: string;
  operationStatus: string;
  fingerprint: string | null;
  failureReason: string | null;
  resultRef: string | null;
  repairOfOperationId: string | null;
  reservedAt: Date;
  expiresAt: Date;
  committedAt: Date | null;
  releasedAt: Date | null;
}

const store = vi.hoisted(() => ({
  tier: 'free' as string,
  verified: true,
  rows: [] as Row[],
  counters: new Map<string, Record<string, number>>(),
  seq: 0,
}));

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      const clauses = cond as Array<Record<string, unknown>>;
      if (!clauses.some((clause) => matches(row, clause))) return false;
      continue;
    }
    const value = (row as unknown as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === 'object') {
      const c = cond as Record<string, unknown>;
      if ('gt' in c && !((value as Date) > (c.gt as Date))) return false;
      if ('lte' in c && !((value as Date) <= (c.lte as Date))) return false;
      if ('gte' in c && !((value as Date) >= (c.gte as Date))) return false;
      if ('lt' in c && !((value as Date) < (c.lt as Date))) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

const client = vi.hoisted(() => {
  const s = store;
  const capabilityReservation = {
    findUnique: vi.fn(async ({ where }: { where: { userId_capability_operationId: { userId: string; capability: string; operationId: string } } }) => {
      const k = where.userId_capability_operationId;
      return s.rows.find((r) => r.userId === k.userId && r.capability === k.capability && r.operationId === k.operationId) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
      const dup = s.rows.find((r) => r.userId === data.userId && r.capability === data.capability && r.operationId === data.operationId);
      if (dup) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const row: Row = {
        id: `res_${++s.seq}`,
        userId: data.userId!,
        capability: data.capability!,
        operationId: data.operationId!,
        period: data.period!,
        status: data.status ?? 'RESERVED',
        operationStatus: data.operationStatus ?? 'PENDING',
        fingerprint: data.fingerprint ?? null,
        failureReason: data.failureReason ?? null,
        resultRef: data.resultRef ?? null,
        repairOfOperationId: data.repairOfOperationId ?? null,
        reservedAt: data.reservedAt ?? new Date(),
        expiresAt: data.expiresAt!,
        committedAt: data.committedAt ?? null,
        releasedAt: data.releasedAt ?? null,
      };
      s.rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = s.rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of s.rows) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    }),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => s.rows.filter((r) => matches(r, where)).length),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => s.rows.find((r) => matches(r, where)) ?? null),
  };
  const usageCounter = {
    upsert: vi.fn(async ({ where, create, update }: { where: { userId_period: { userId: string; period: string } }; create: Record<string, number>; update: Record<string, { increment: number }> }) => {
      const key = `${where.userId_period.userId}:${where.userId_period.period}`;
      const existing = s.counters.get(key);
      if (!existing) {
        s.counters.set(key, { ...create });
      } else {
        for (const [field, op] of Object.entries(update)) existing[field] = (existing[field] ?? 0) + op.increment;
      }
    }),
  };
  // The plan now comes only from resolveBillingAccess reading billing purchases,
  // so a "pro" store tier is represented as an active recurring PRO purchase.
  const base = {
    $executeRawUnsafe: vi.fn(async () => 0),
    user: {
      findUnique: vi.fn(async () => ({
        emailVerified: s.verified,
        billingAccount: {
          purchases:
            s.tier === 'pro'
              ? [
                  {
                    id: 'pro-purchase',
                    provider: 'STRIPE',
                    arrangement: 'RECURRING',
                    offerId: 'PRO_MONTHLY',
                    planId: 'PRO',
                    status: 'ACTIVE',
                    providerCustomerId: 'cus_test',
                    currentPeriodStart: new Date(Date.now() - 86_400_000),
                    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
                    cancelAtPeriodEnd: false,
                    createdAt: new Date(Date.now() - 86_400_000),
                    updatedAt: new Date(Date.now() - 86_400_000),
                  },
                ]
              : [],
        },
      })),
    },
    capabilityReservation,
    usageCounter,
  };
  return {
    ...base,
    $transaction: vi.fn(async (fn: (tx: typeof base) => Promise<unknown>) => fn(base)),
  };
});

vi.mock('@/shared/lib/prisma', () => ({ prisma: client }));

import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  consumeCapability,
  countActiveUsage,
  reservationFingerprint,
  hashContent,
  checkRepairEligibility,
  commitRepair,
  createResultForReservation,
  sweepExpiredReservations,
  ReservationInvariantError,
} from '../capability-reservation';
import { RESERVATION_TTL_MS } from '@/shared/lib/config';
import { getPlanEntitlement } from '@/shared/entitlements/registry';

const CAP = 'ai_enhanced_ats_analysis' as const; // FREE quota (launch: 1/month)
const T0 = new Date('2026-07-25T12:00:00.000Z');

function counter(userId: string, period: string, field: string): number {
  return store.counters.get(`${userId}:${period}`)?.[field] ?? 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.tier = 'free';
  store.verified = true;
  store.rows = [];
  store.counters = new Map();
  store.seq = 0;
});

describe('reservationFingerprint / hashContent', () => {
  it('is deterministic and distinguishes different inputs', () => {
    expect(reservationFingerprint(['a', 'b'])).toBe(reservationFingerprint(['a', 'b']));
    expect(reservationFingerprint(['a', 'b'])).not.toBe(reservationFingerprint(['a', 'c']));
    expect(hashContent('cv text')).toBe(hashContent('cv text'));
    expect(hashContent('cv text')).not.toBe(hashContent('other'));
  });
});

describe('reserveCapability', () => {
  it('reserves a unit when under quota', async () => {
    const result = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    expect(result.status).toBe('reserved');
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', T0)).toBe(1);
  });

  it('returns unmetered for non-quota capabilities', async () => {
    const result = await reserveCapability({ userId: 'u1', capability: 'ats_analysis', operationId: 'op1', now: T0 });
    expect(result.status).toBe('unmetered');
    expect(store.rows).toHaveLength(0);
  });

  it('rejects an unverified protected capability before opening a billing transaction', async () => {
    store.verified = false;

    await expect(
      reserveCapability({ userId: 'u1', capability: 'job_match_analysis', operationId: 'op' })
    ).rejects.toMatchObject({ code: 'EMAIL_VERIFICATION_REQUIRED', statusCode: 403 });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('denies once the quota is fully committed', async () => {
    // Limit is sourced from the central registry so this survives launch retunes.
    const entitlement = getPlanEntitlement('FREE', CAP);
    const limit = entitlement.mode === 'quota' ? entitlement.limit : 0;
    for (let i = 0; i < limit; i++) {
      await consumeCapability('u1', CAP, `used${i}`, T0);
    }
    const result = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'opX', now: T0 });
    expect(result.status).toBe('exhausted');
    if (result.status === 'exhausted') {
      expect(result.decision).toMatchObject({ reason: 'quota_exhausted', limit, upgradeTarget: 'PRO' });
    }
  });

  it('is idempotent for the same operation id', async () => {
    const a = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    const b = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    expect(a.status).toBe('reserved');
    expect(b.status).toBe('reserved');
    expect(store.rows).toHaveLength(1);
  });

  it('rejects a reused operation id with conflicting content', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', fingerprint: 'fp-a', now: T0 });
    const clash = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', fingerprint: 'fp-b', now: T0 });
    expect(clash.status).toBe('conflict');
  });

  it('lets an expired reservation stop counting against quota', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'old', now: T0 });
    const later = new Date(T0.getTime() + RESERVATION_TTL_MS + 1000);
    const result = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'new', now: later });
    expect(result.status).toBe('reserved');
    expect(store.rows.find((r) => r.operationId === 'old')!.status).toBe('EXPIRED');
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', later)).toBe(1);
  });

  it('recovers a committed operation without re-reserving', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'analysis_1', now: T0 });
    const again = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    expect(again.status).toBe('recovered');
    if (again.status === 'recovered') expect(again.reservation.resultRef).toBe('analysis_1');
  });
});

describe('commitCapability', () => {
  it('commits a held reservation once and mirrors the derived counter', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    const first = await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    const second = await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    expect(first.status).toBe('committed');
    expect(second.status).toBe('committed');
    // aiAnalyses column incremented exactly once despite the repeated commit.
    expect(counter('u1', '2026-07', 'aiAnalyses')).toBe(1);
  });

  it('reports unknown for an operation that was never reserved', async () => {
    const result = await commitCapability({ userId: 'u1', capability: CAP, operationId: 'ghost', now: T0 });
    expect(result.status).toBe('unknown');
  });

  it('refuses to commit a reservation that has lapsed', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    const late = new Date(T0.getTime() + RESERVATION_TTL_MS + 1000);
    const result = await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: late });
    expect(result.status).toBe('expired');
    expect(counter('u1', '2026-07', 'aiAnalyses')).toBe(0);
  });
});

describe('releaseCapability', () => {
  it('returns a held unit to the pool and never charges', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    const released = await releaseCapability({ userId: 'u1', capability: CAP, operationId: 'op1', reason: 'provider_unavailable', now: T0 });
    expect(released.status).toBe('released');
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', T0)).toBe(0);
    // The freed id can be reused for a fresh attempt.
    const again = await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    expect(again.status).toBe('reserved');
  });

  it('never un-charges a committed reservation and is idempotent', async () => {
    await consumeCapability('u1', CAP, 'op1', T0);
    const noop = await releaseCapability({ userId: 'u1', capability: CAP, operationId: 'op1', reason: 'x', now: T0 });
    expect(noop.status).toBe('noop');
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', T0)).toBe(1);
    // Releasing an unknown or already-released op is safe.
    expect((await releaseCapability({ userId: 'u1', capability: CAP, operationId: 'ghost', reason: 'x', now: T0 })).status).toBe('noop');
  });
});

describe('repair (linked re-generation for a lost committed result)', () => {
  async function commitOne(op: string) {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: op, now: T0 });
    await commitCapability({ userId: 'u1', capability: CAP, operationId: op, resultRef: 'result_1', now: T0 });
  }

  it('reports eligibility only for a committed, not-yet-repaired original', async () => {
    expect((await checkRepairEligibility({ userId: 'u1', capability: CAP, originalOperationId: 'ghost' })).status).toBe('not_committed');
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    // A merely-reserved (uncommitted) op is not repairable.
    expect((await checkRepairEligibility({ userId: 'u1', capability: CAP, originalOperationId: 'op1' })).status).toBe('not_committed');
    await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'result_1', now: T0 });
    expect((await checkRepairEligibility({ userId: 'u1', capability: CAP, originalOperationId: 'op1' })).status).toBe('eligible');
  });

  it('records a repair without consuming another quota unit', async () => {
    await commitOne('orig');
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', T0)).toBe(1);

    const repaired = await commitRepair({
      userId: 'u1', capability: CAP, originalOperationId: 'orig', repairOperationId: 'repair-1', resultRef: 'result_2', now: T0,
    });
    expect(repaired.status).toBe('committed');
    // The repair row is committed but excluded from the quota count — still 1.
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', T0)).toBe(1);
    const repairRow = store.rows.find((r) => r.operationId === 'repair-1')!;
    expect(repairRow.repairOfOperationId).toBe('orig');
    expect(repairRow.resultRef).toBe('result_2');
  });

  it('allows only one successful repair per original', async () => {
    await commitOne('orig');
    await commitRepair({ userId: 'u1', capability: CAP, originalOperationId: 'orig', repairOperationId: 'repair-1', resultRef: 'r2', now: T0 });
    const second = await commitRepair({ userId: 'u1', capability: CAP, originalOperationId: 'orig', repairOperationId: 'repair-2', resultRef: 'r3', now: T0 });
    expect(second.status).toBe('already_repaired');
    expect((await checkRepairEligibility({ userId: 'u1', capability: CAP, originalOperationId: 'orig' })).status).toBe('already_repaired');
  });

  it('refuses to repair an operation that never committed', async () => {
    const result = await commitRepair({ userId: 'u1', capability: CAP, originalOperationId: 'nope', repairOperationId: 'repair-1', resultRef: 'r2', now: T0 });
    expect(result.status).toBe('not_committed');
  });
});

describe('createResultForReservation (create-then-commit idempotency)', () => {
  it('runs the creator once and records the result ref on the held reservation', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    let creatorCalls = 0;
    const created = await createResultForReservation({
      userId: 'u1', capability: CAP, operationId: 'op1',
      creator: async () => { creatorCalls++; return { resultRef: 'context:ctx-1', value: { id: 'ctx-1' } }; },
      now: T0,
    });
    expect(created.status).toBe('created');
    if (created.status === 'created') expect(created.resultRef).toBe('context:ctx-1');
    expect(creatorCalls).toBe(1);
    expect(store.rows.find((r) => r.operationId === 'op1')!.resultRef).toBe('context:ctx-1');
  });

  it('does NOT re-run the creator when a result was already recorded (retry after commit failure)', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    // First attempt records the ref (commit is a separate step and is assumed to have failed).
    await createResultForReservation({
      userId: 'u1', capability: CAP, operationId: 'op1',
      creator: async () => ({ resultRef: 'context:ctx-1', value: { id: 'ctx-1' } }), now: T0,
    });

    let secondCreatorCalls = 0;
    const retry = await createResultForReservation({
      userId: 'u1', capability: CAP, operationId: 'op1',
      creator: async () => { secondCreatorCalls++; return { resultRef: 'context:ctx-2', value: { id: 'ctx-2' } }; }, now: T0,
    });

    expect(retry.status).toBe('already_created');
    if (retry.status === 'already_created') expect(retry.resultRef).toBe('context:ctx-1');
    // No duplicate record: the creator never ran a second time.
    expect(secondCreatorCalls).toBe(0);
  });

  it('reports lapsed when the reservation is no longer held', async () => {
    const created = await createResultForReservation({
      userId: 'u1', capability: CAP, operationId: 'ghost',
      creator: async () => ({ resultRef: 'x', value: null }), now: T0,
    });
    expect(created.status).toBe('lapsed');
  });

  it('the full create → commit → retry cycle consumes exactly one unit and never duplicates', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    let creatorCalls = 0;
    const creator = async () => { creatorCalls++; return { resultRef: 'context:ctx-1', value: { id: 'ctx-1' } }; };

    // Attempt 1: create succeeds, commit succeeds.
    await createResultForReservation({ userId: 'u1', capability: CAP, operationId: 'op1', creator, now: T0 });
    await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'context:ctx-1', now: T0 });

    // Retry (client re-sends the same operation id): create is skipped, commit is idempotent.
    const retry = await createResultForReservation({ userId: 'u1', capability: CAP, operationId: 'op1', creator, now: T0 });
    expect(retry.status).toBe('already_created');
    await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'context:ctx-1', now: T0 });

    expect(creatorCalls).toBe(1);
    expect(counter('u1', '2026-07', 'aiAnalyses')).toBe(1);
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', T0)).toBe(1);
  });
});

describe('reservation invariants', () => {
  it('refuses to change the result ref of an already-committed operation', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'analysis_1', now: T0 });
    await expect(
      commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'analysis_DIFFERENT', now: T0 })
    ).rejects.toBeInstanceOf(ReservationInvariantError);
  });

  it('allows an idempotent re-commit with the same (or no) result ref', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 });
    await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'analysis_1', now: T0 });
    expect((await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', resultRef: 'analysis_1', now: T0 })).status).toBe('committed');
    expect((await commitCapability({ userId: 'u1', capability: CAP, operationId: 'op1', now: T0 })).status).toBe('committed');
  });
});

describe('sweepExpiredReservations', () => {
  it('expires only elapsed RESERVED rows and never touches committed usage', async () => {
    await reserveCapability({ userId: 'u1', capability: CAP, operationId: 'stale', now: T0 });
    await consumeCapability('u1', CAP, 'done', T0); // COMMITTED, immutable

    const later = new Date(T0.getTime() + RESERVATION_TTL_MS + 1000);
    // A fresh hold on a DIFFERENT capability, reserved AT sweep time — its own
    // lazy expiry is scoped to job_match_analysis, so it can't pre-expire 'stale'.
    await reserveCapability({ userId: 'u1', capability: 'human_evidence_capture', operationId: 'live', now: later });

    const { expired } = await sweepExpiredReservations({ userId: 'u1', now: later });
    expect(expired).toBe(1);
    expect(store.rows.find((r) => r.operationId === 'stale')!.status).toBe('EXPIRED');
    expect(store.rows.find((r) => r.operationId === 'done')!.status).toBe('COMMITTED');
    expect(store.rows.find((r) => r.operationId === 'live')!.status).toBe('RESERVED');
  });
});

describe('consumeCapability (post-success charge)', () => {
  it('charges exactly once across retries with the same operation id', async () => {
    expect(await consumeCapability('u1', CAP, 'op1', T0)).toBe(true);
    expect(await consumeCapability('u1', CAP, 'op1', T0)).toBe(false);
    expect(counter('u1', '2026-07', 'aiAnalyses')).toBe(1);
    expect(await countActiveUsage(client as never, 'u1', CAP, '2026-07', T0)).toBe(1);
  });

  it('does not charge non-quota capabilities', async () => {
    expect(await consumeCapability('u1', 'ats_analysis', 'op1', T0)).toBe(false);
    expect(store.rows).toHaveLength(0);
  });
});
