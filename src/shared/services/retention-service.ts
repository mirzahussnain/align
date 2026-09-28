import { prisma } from '@/shared/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { RETENTION_POLICY } from '@/shared/policies';
import { sweepExpiredSources } from './storage-quota';
import { sweepExpiredStoredCvs } from './stored-cv';
import { sweepExpiredReservations } from './capability-reservation';

const before = (milliseconds: number, now: Date) => new Date(now.getTime() - milliseconds);
const JOB_RETENTION_BATCH_SIZE = 500;
const unprotectedJobSnapshot: Prisma.JobSnapshotWhereInput = {
  importedByUserId: null,
  savedJobs: { none: {} },
  matchRequests: { none: {} },
  revisions: { none: {} },
};

export async function expireAnonymousDemoResults(now = new Date()): Promise<number> {
  const result = await prisma.anonymousAtsResult.updateMany({
    where: { expiresAt: { lte: now }, status: { in: ['PROCESSING', 'READY'] } },
    data: {
      status: 'EXPIRED',
      extractedText: '',
      resultJson: Prisma.DbNull,
      overallScore: null,
    },
  });
  return result.count;
}

export async function expireJobMatchRequests(now = new Date()): Promise<number> {
  const result = await prisma.jobMatchRequest.updateMany({
    where: { status: 'PREPARED', OR: [
      { expiresAt: { lte: now } },
      { createdAt: { lte: before(RETENTION_POLICY.abandonedRequestMinutes * 60_000, now) } },
    ] },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

export async function cleanupAbandonedReservations(now = new Date()): Promise<number> {
  const result = await sweepExpiredReservations({ now });
  return result.expired;
}

export async function expireSourceCvObjects(): Promise<number> {
  const [revisions, stored] = await Promise.all([sweepExpiredSources(), sweepExpiredStoredCvs()]);
  return revisions + stored;
}

/** Archive stale, unsaved discovery snapshots. Immutable JobRevisions survive. */
export async function archiveStaleJobs(now = new Date()): Promise<number> {
  const cutoff = before(RETENTION_POLICY.staleJobDays * 86_400_000, now);
  const candidates = await prisma.jobSnapshot.findMany({
    where: {
      status: { in: ['ACTIVE', 'STALE', 'EXPIRED'] },
      lastSeenAt: { lte: cutoff },
      ...unprotectedJobSnapshot,
    },
    select: { id: true },
    take: JOB_RETENTION_BATCH_SIZE,
  });
  if (!candidates.length) return 0;
  const result = await prisma.jobSnapshot.updateMany({ where: { id: { in: candidates.map((item) => item.id) } }, data: { status: 'ARCHIVED' } });
  return result.count;
}

export type JobSnapshotRetentionSummary = {
  examined: number;
  archived: number;
  purged: number;
  protectedSkipped: number;
  failures: number;
};

export async function retainJobSnapshots(
  now = new Date(),
): Promise<JobSnapshotRetentionSummary> {
  const summary: JobSnapshotRetentionSummary = {
    examined: 0,
    archived: 0,
    purged: 0,
    protectedSkipped: 0,
    failures: 0,
  };
  const archiveBase: Prisma.JobSnapshotWhereInput = {
    status: { in: ['ACTIVE', 'STALE', 'EXPIRED'] },
    lastSeenAt: {
      lte: before(RETENTION_POLICY.staleJobDays * 86_400_000, now),
    },
  };
  const purgeBase: Prisma.JobSnapshotWhereInput = {
    status: 'ARCHIVED',
    updatedAt: {
      lte: before(RETENTION_POLICY.archivedJobPurgeDays * 86_400_000, now),
    },
  };

  try {
    const [examined, eligible] = await Promise.all([
      prisma.jobSnapshot.count({ where: archiveBase }),
      prisma.jobSnapshot.count({
        where: { ...archiveBase, ...unprotectedJobSnapshot },
      }),
    ]);
    summary.examined += examined;
    summary.protectedSkipped += examined - eligible;
    const candidates = await prisma.jobSnapshot.findMany({
      where: { ...archiveBase, ...unprotectedJobSnapshot },
      select: { id: true },
      take: JOB_RETENTION_BATCH_SIZE,
    });
    if (candidates.length) {
      summary.archived = (
        await prisma.jobSnapshot.updateMany({
          where: { id: { in: candidates.map(({ id }) => id) } },
          data: { status: 'ARCHIVED' },
        })
      ).count;
    }
  } catch {
    summary.failures += 1;
  }

  try {
    const [examined, eligible] = await Promise.all([
      prisma.jobSnapshot.count({ where: purgeBase }),
      prisma.jobSnapshot.count({
        where: { ...purgeBase, ...unprotectedJobSnapshot },
      }),
    ]);
    summary.examined += examined;
    summary.protectedSkipped += examined - eligible;
    const candidates = await prisma.jobSnapshot.findMany({
      where: { ...purgeBase, ...unprotectedJobSnapshot },
      select: { id: true },
      take: JOB_RETENTION_BATCH_SIZE,
    });
    if (candidates.length) {
      summary.purged = (
        await prisma.jobSnapshot.deleteMany({
          where: { id: { in: candidates.map(({ id }) => id) } },
        })
      ).count;
    }
  } catch {
    summary.failures += 1;
  }

  return summary;
}

export async function runRetentionCleanup(now = new Date()) {
  const [anonymousDemoResults, jobMatchRequests, reservations, sourceCvObjects, jobSnapshots] = await Promise.all([
    expireAnonymousDemoResults(now),
    expireJobMatchRequests(now),
    cleanupAbandonedReservations(now),
    expireSourceCvObjects(),
    retainJobSnapshots(now),
  ]);
  return { anonymousDemoResults, jobMatchRequests, reservations, sourceCvObjects, jobSnapshots };
}
