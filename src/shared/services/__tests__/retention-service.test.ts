import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    anonymousAtsResult: { updateMany: vi.fn() },
    jobMatchRequest: { updateMany: vi.fn() },
    jobSnapshot: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('../storage-quota', () => ({ sweepExpiredSources: vi.fn(async () => 0) }));
vi.mock('../stored-cv', () => ({ sweepExpiredStoredCvs: vi.fn(async () => 0) }));
vi.mock('../capability-reservation', () => ({ sweepExpiredReservations: vi.fn(async () => ({ expired: 0 })) }));

import { prisma } from '@/shared/lib/prisma';
import { expireAnonymousDemoResults, expireJobMatchRequests } from '../retention-service';

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
});
