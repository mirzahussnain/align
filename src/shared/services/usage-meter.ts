// Monthly AI usage accounting.
//
// The pricing page could not honestly advertise "N AI analyses per month"
// before this existed, because nothing counted them. Counting `Analysis` rows
// was never an option: the free tier prunes analyses beyond its cap
// (storage-quota.ts), so a user who ran 40 analyses may hold 10 rows. Every
// prune would have silently refunded quota.
//
// `UsageCounter` is append-only and never pruned. It is the only record that
// survives storage cleanup, which is exactly why quota reads from it.

import { prisma } from '@/shared/lib/prisma';
import type { Entitlements } from '@/shared/lib/entitlements';

/** Countable actions. Each maps to a column on `usage_counter`. */
export type MeteredAction = 'aiAnalyses' | 'cvGenerations' | 'profileReasoning';

/**
 * Calendar-month bucket in UTC, "YYYY-MM".
 *
 * UTC rather than local time so a user travelling across a timezone cannot roll
 * their own quota over early, and so the boundary is the same for every user.
 */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface UsageSnapshot {
  period: string;
  aiAnalyses: number;
  cvGenerations: number;
  profileReasoning: number;
}

const EMPTY = (period: string): UsageSnapshot => ({
  period,
  aiAnalyses: 0,
  cvGenerations: 0,
  profileReasoning: 0,
});

/** This month's consumption. A user with no row yet has simply used nothing. */
export async function getUsage(userId: string, now = new Date()): Promise<UsageSnapshot> {
  const period = currentPeriod(now);

  try {
    const row = await prisma.usageCounter.findUnique({
      where: { userId_period: { userId, period } },
      select: { aiAnalyses: true, cvGenerations: true, profileReasoning: true },
    });
    return row ? { period, ...row } : EMPTY(period);
  } catch (error) {
    console.warn(
      '[usage-meter] Failed to read usage:',
      error instanceof Error ? error.message : error
    );
    return EMPTY(period);
  }
}

/**
 * Record one consumed unit.
 *
 * A single upsert, which the `(userId, period)` unique index makes atomic — two
 * concurrent analyses cannot read-modify-write over each other and lose a count.
 *
 * Never throws. A metering failure must not fail the request the user is waiting
 * on; under-counting is the correct way to fail here, since the alternative is
 * charging someone for work that errored.
 */
export async function recordUsage(
  userId: string,
  action: MeteredAction,
  now = new Date()
): Promise<void> {
  const period = currentPeriod(now);

  try {
    await prisma.usageCounter.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, [action]: 1 },
      update: { [action]: { increment: 1 } },
    });
  } catch (error) {
    console.warn(
      `[usage-meter] Failed to record ${action} for user ${userId}:`,
      error instanceof Error ? error.message : error
    );
  }
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  /** `null` when the tier is unmetered. */
  limit: number | null;
  remaining: number | null;
}

/**
 * Whether a user may perform one more of `action` this month.
 *
 * Checked BEFORE the model call, so a user who is out of quota gets a clean 429
 * rather than a completed analysis they were not entitled to.
 */
export async function checkQuota(
  userId: string,
  action: MeteredAction,
  entitlements: Entitlements,
  now = new Date()
): Promise<QuotaCheck> {
  const limit = entitlements.monthlyLimits[action];

  if (limit === null || !Number.isFinite(limit)) {
    const usage = await getUsage(userId, now);
    return { allowed: true, used: usage[action], limit: null, remaining: null };
  }

  const usage = await getUsage(userId, now);
  const used = usage[action];

  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}
