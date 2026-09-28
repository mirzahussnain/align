import { beforeEach, describe, expect, it, vi } from 'vitest';

import { blankSponsorSignal } from '@/shared/services/job-normalisation';
import type { NormalisedJob } from '@/shared/types/job';

const { prisma, findExistingJobSnapshots } = vi.hoisted(() => ({
  prisma: {
    savedJob: { findMany: vi.fn() },
    jobSnapshot: { create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    jobProviderReference: { upsert: vi.fn() },
  },
  findExistingJobSnapshots: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({ prisma }));
vi.mock('@/shared/services/job-snapshot', () => ({ findExistingJobSnapshots }));

import { projectSearchJobCards } from '@/shared/services/job-search-view';

const vacancy = (index: number): NormalisedJob => ({
  source: 'REED',
  sourceJobId: `job-${index}`,
  providerReferences: [{
    provider: 'REED',
    sourceJobId: `job-${index}`,
    identityStability: 'STABLE',
    sourceUrl: `https://example.test/jobs/${index}`,
  }],
  canonicalUrl: `https://example.test/jobs/${index}`,
  title: 'Support Engineer',
  company: `Company ${index}`,
  locationText: 'Birmingham, UK',
  descriptionAvailability: 'PARTIAL',
  remoteType: 'HYBRID',
  sponsorSignal: blankSponsorSignal(),
  eligibilityHints: [],
  dedupeFingerprint: `fingerprint-${index}`,
  canonicalJobId: `canonical-${index}`,
  fetchedAt: '2026-09-27T10:00:00.000Z',
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.savedJob.findMany.mockResolvedValue([]);
  findExistingJobSnapshots.mockResolvedValue(new Map());
});

describe('read-only search projection', () => {
  it('uses canonical card identity and adds optional durable metadata without writing', async () => {
    findExistingJobSnapshots.mockResolvedValue(new Map([
      ['canonical-1', { id: 'snapshot-1', canonicalJobId: 'fingerprint-1' }],
    ]));

    const [card] = await projectSearchJobCards([vacancy(1)], 'user-1');

    expect(card).toMatchObject({
      id: 'canonical-1',
      canonicalJobId: 'canonical-1',
      jobSnapshotId: 'snapshot-1',
      saved: false,
    });
    expect(prisma.jobSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.jobSnapshot.update).not.toHaveBeenCalled();
    expect(prisma.jobSnapshot.upsert).not.toHaveBeenCalled();
    expect(prisma.jobProviderReference.upsert).not.toHaveBeenCalled();
  });

  it('projects fifty authenticated live results with zero snapshot mutations', async () => {
    const jobs = Array.from({ length: 50 }, (_, index) => vacancy(index));

    const cards = await projectSearchJobCards(jobs, 'user-1');

    expect(cards).toHaveLength(50);
    expect(cards.every((card) => card.id === card.canonicalJobId)).toBe(true);
    expect(cards.every((card) => !('jobSnapshotId' in card))).toBe(true);
    expect(prisma.savedJob.findMany).not.toHaveBeenCalled();
    expect(prisma.jobSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.jobSnapshot.update).not.toHaveBeenCalled();
    expect(prisma.jobSnapshot.upsert).not.toHaveBeenCalled();
    expect(prisma.jobProviderReference.upsert).not.toHaveBeenCalled();
  });

  it('reads saved state only for already-resolved durable snapshots', async () => {
    findExistingJobSnapshots.mockResolvedValue(new Map([
      ['canonical-1', { id: 'snapshot-1', canonicalJobId: 'fingerprint-1' }],
      ['canonical-2', { id: 'snapshot-2', canonicalJobId: 'fingerprint-2' }],
    ]));
    prisma.savedJob.findMany.mockResolvedValue([{ jobSnapshotId: 'snapshot-2' }]);

    const cards = await projectSearchJobCards([vacancy(1), vacancy(2)], 'user-1');

    expect(cards.map((card) => card.saved)).toEqual([false, true]);
    expect(prisma.savedJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', jobSnapshotId: { in: ['snapshot-1', 'snapshot-2'] } },
    }));
  });
});
