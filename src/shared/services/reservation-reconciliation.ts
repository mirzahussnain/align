// Usage aggregate reconciliation.
//
// The CapabilityReservation ledger is authoritative for quota; UsageCounter is a
// DERIVED compatibility aggregate, incremented in the same transaction as each
// commit. Because it is derived, it can in principle drift from the ledger (a
// hand-edit, a partial restore, a historical bug). This module reconstructs the
// expected aggregate purely from committed reservations and compares it with the
// stored counter, so drift is DETECTABLE and — in development/admin contexts —
// repairable.
//
// Quota enforcement never consults UsageCounter (it counts committed + active
// reservations directly, see countActiveUsage), so this is a diagnostic and
// repair aid, never part of the enforcement path.

import { prisma } from '@/shared/lib/prisma';
import { DERIVED_COUNTER } from '@/shared/services/capability-reservation';
import type { MeteredAction } from '@/shared/services/usage-meter';
import { UsageReservationStatus, type Prisma } from '../../generated/prisma/client';

/** The UsageCounter numeric columns the ledger derives. */
const COUNTER_FIELDS: MeteredAction[] = ['aiAnalyses', 'cvGenerations', 'profileReasoning'];

export type ExpectedUsage = Record<MeteredAction, number>;

function emptyUsage(): ExpectedUsage {
  return { aiAnalyses: 0, cvGenerations: 0, profileReasoning: 0 };
}

/**
 * Rebuild the expected UsageCounter aggregate for one user+period purely from
 * COMMITTED reservations. Repair rows (repairOfOperationId set) are excluded —
 * they re-produce a result the user already paid for and consume no unit — so a
 * repaired result never inflates the aggregate. RESERVED/RELEASED/EXPIRED rows
 * are excluded because only COMMITTED rows are consumed usage.
 */
export async function expectedUsageFromLedger(
  userId: string,
  period: string,
  client: Prisma.TransactionClient = prisma
): Promise<ExpectedUsage> {
  const committed = await client.capabilityReservation.groupBy({
    by: ['capability'],
    where: {
      userId,
      period,
      status: UsageReservationStatus.COMMITTED,
      repairOfOperationId: null,
    },
    _count: { _all: true },
  });

  const usage = emptyUsage();
  for (const row of committed) {
    const action = DERIVED_COUNTER[row.capability as keyof typeof DERIVED_COUNTER];
    if (!action) continue; // capability with no derived counter column
    usage[action] += row._count._all;
  }
  return usage;
}

export interface UsageDrift {
  userId: string;
  period: string;
  expected: ExpectedUsage;
  actual: ExpectedUsage;
  /** Per-field difference (actual − expected). Zero on every field ⇒ no drift. */
  delta: ExpectedUsage;
  hasDrift: boolean;
}

/**
 * Compare the derived UsageCounter against the ledger-reconstructed aggregate for
 * one user+period. A positive delta means the counter over-reports (a user was
 * shown more usage than the ledger justifies); negative means it under-reports.
 */
export async function reconcileUsage(
  userId: string,
  period: string,
  client: Prisma.TransactionClient = prisma
): Promise<UsageDrift> {
  const expected = await expectedUsageFromLedger(userId, period, client);
  const counter = await client.usageCounter.findUnique({
    where: { userId_period: { userId, period } },
    select: { aiAnalyses: true, cvGenerations: true, profileReasoning: true },
  });
  const actual: ExpectedUsage = {
    aiAnalyses: counter?.aiAnalyses ?? 0,
    cvGenerations: counter?.cvGenerations ?? 0,
    profileReasoning: counter?.profileReasoning ?? 0,
  };
  const delta = emptyUsage();
  let hasDrift = false;
  for (const field of COUNTER_FIELDS) {
    delta[field] = actual[field] - expected[field];
    if (delta[field] !== 0) hasDrift = true;
  }
  return { userId, period, expected, actual, delta, hasDrift };
}

/**
 * Overwrite the derived UsageCounter for one user+period with the ledger-derived
 * aggregate. GUARD-RAILED: refuses to run outside development unless `force` is
 * explicitly set, because rewriting a compatibility aggregate is an admin action,
 * not something a request path should ever trigger. Returns the drift it repaired.
 */
export async function repairUsageDrift(
  userId: string,
  period: string,
  opts: { force?: boolean } = {}
): Promise<UsageDrift> {
  if (process.env.NODE_ENV === 'production' && !opts.force) {
    throw new Error('repairUsageDrift refused: production repair requires an explicit force flag (admin only).');
  }
  return prisma.$transaction(async (tx) => {
    const drift = await reconcileUsage(userId, period, tx);
    if (drift.hasDrift) {
      await tx.usageCounter.upsert({
        where: { userId_period: { userId, period } },
        create: { userId, period, ...drift.expected },
        update: { ...drift.expected },
      });
    }
    return drift;
  });
}
