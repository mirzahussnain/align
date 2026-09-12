import { prisma } from '@/shared/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { RETENTION } from '@/shared/config/analysis-domain';
import { sweepExpiredSources } from './storage-quota';
import { sweepExpiredStoredCvs } from './stored-cv';
import { sweepExpiredReservations } from './capability-reservation';

const before = (milliseconds: number, now: Date) => new Date(now.getTime() - milliseconds);

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
      { createdAt: { lte: before(RETENTION.abandonedRequestMinutes * 60_000, now) } },
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
  const cutoff = before(RETENTION.staleJobDays * 86_400_000, now);
  const candidates = await prisma.jobSnapshot.findMany({
    where: {
      importedByUserId: null,
      status: { in: ['ACTIVE', 'STALE', 'EXPIRED'] },
      lastSeenAt: { lte: cutoff },
      savedJobs: { none: {} },
      matchRequests: { none: { status: 'PREPARED' } },
    },
    select: { id: true },
    take: 500,
  });
  if (!candidates.length) return 0;
  const result = await prisma.jobSnapshot.updateMany({ where: { id: { in: candidates.map((item) => item.id) } }, data: { status: 'ARCHIVED' } });
  return result.count;
}

export async function runRetentionCleanup(now = new Date()) {
  const [anonymousDemoResults, jobMatchRequests, reservations, sourceCvObjects, jobSnapshots] = await Promise.all([
    expireAnonymousDemoResults(now),
    expireJobMatchRequests(now),
    cleanupAbandonedReservations(now),
    expireSourceCvObjects(),
    archiveStaleJobs(now),
  ]);
  return { anonymousDemoResults, jobMatchRequests, reservations, sourceCvObjects, jobSnapshots };
}
