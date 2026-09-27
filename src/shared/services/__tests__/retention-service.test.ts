import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    anonymousAtsResult: { updateMany: vi.fn() },
    jobMatchRequest: { updateMany: vi.fn() },
    jobSnapshot: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('../storage-quota', () => ({ sweepExpiredSources: vi.fn(async () => 0) }));
vi.mock('../stored-cv', () => ({ sweepExpiredStoredCvs: vi.fn(async () => 0) }));
vi.mock('../capability-reservation', () => ({ sweepExpiredReservations: vi.fn(async () => ({ expired: 0 })) }));

import { prisma } from '@/shared/lib/prisma';
import {
  expireAnonymousDemoResults,
  expireJobMatchRequests,
  retainJobSnapshots,
} from '../retention-service';

describe('analysis-domain retention cleanup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only expires temporary anonymous results that reached their deadline', async () => {
    vi.mocked(prisma.anonymousAtsResult.updateMany).mockResolvedValue({ count: 2 });
    const now = new Date('2026-09-12T12:00:00.000Z');
    await expect(expireAnonymousDemoResults(now)).resolves.toBe(2);
    expect(prisma.anonymousAtsResult.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { expiresAt: { lte: now }, status: { in: ['PROCESSING', 'READY'] } },
      data: expect.objectContaining({ status: 'EXPIRED', extractedText: '', overallScore: null }),
    }));
  });

  it('expires only prepared Job Match requests', async () => {
    vi.mocked(prisma.jobMatchRequest.updateMany).mockResolvedValue({ count: 1 });
    const now = new Date('2026-09-12T12:00:00.000Z');
    await expect(expireJobMatchRequests(now)).resolves.toBe(1);
    expect(prisma.jobMatchRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'PREPARED' }),
      data: { status: 'EXPIRED' },
    }));
  });

  it('archives at 45 days, purges 180-day archived rows, and applies every protection relation', async () => {
    const now = new Date('2026-09-27T12:00:00.000Z');
    vi.mocked(prisma.jobSnapshot.count)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1);
    vi.mocked(prisma.jobSnapshot.findMany)
      .mockResolvedValueOnce([{ id: 'archive-1' }, { id: 'archive-2' }, { id: 'archive-3' }] as never)
      .mockResolvedValueOnce([{ id: 'purge-1' }] as never);
    vi.mocked(prisma.jobSnapshot.updateMany).mockResolvedValue({ count: 3 });
    vi.mocked(prisma.jobSnapshot.deleteMany).mockResolvedValue({ count: 1 });

    await expect(retainJobSnapshots(now)).resolves.toEqual({
      examined: 12,
      archived: 3,
      purged: 1,
      protectedSkipped: 8,
      failures: 0,
    });

    const archiveQuery = vi.mocked(prisma.jobSnapshot.findMany).mock.calls[0][0];
    expect(archiveQuery).toMatchObject({
      where: {
        importedByUserId: null,
        lastSeenAt: { lte: new Date('2026-08-13T12:00:00.000Z') },
        savedJobs: { none: {} },
        matchRequests: { none: {} },
        revisions: { none: {} },
      },
      select: { id: true },
      take: 500,
    });
    const purgeQuery = vi.mocked(prisma.jobSnapshot.findMany).mock.calls[1][0];
    expect(purgeQuery).toMatchObject({
      where: {
        status: 'ARCHIVED',
        updatedAt: { lte: new Date('2026-03-31T12:00:00.000Z') },
        importedByUserId: null,
        savedJobs: { none: {} },
        matchRequests: { none: {} },
        revisions: { none: {} },
      },
      select: { id: true },
      take: 500,
    });
  });
});
