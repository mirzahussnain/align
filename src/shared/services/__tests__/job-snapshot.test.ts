import { describe, expect, it, vi, beforeEach } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    jobSnapshot: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    jobProviderReference: { upsert: vi.fn() },
    savedJob: { upsert: vi.fn(), deleteMany: vi.fn() },
    jobMatchRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

import { attachUserDescription, getOrCreateSnapshotFromNormalisedJob, resolveSelectedDescription } from '@/shared/services/job-snapshot';

const job = {
  source: 'ADZUNA', sourceJobId: 'one', canonicalUrl: 'https://example.test/one', canonicalJobId: 'provider-one', title: 'Platform Engineer', company: 'Fixture Systems Ltd', companyNormalised: 'fixture systems', locationText: 'Leeds, UK', remoteType: 'HYBRID', description: 'Build reliable platform services.', descriptionAvailability: 'FULL', providerReferences: [{ provider: 'ADZUNA', sourceJobId: 'one', sourceUrl: 'https://example.test/one' }, { provider: 'REED', sourceJobId: 'two', sourceUrl: 'https://example.test/two' }], dedupeFingerprint: 'same-vacancy', fetchedAt: '2026-07-28T10:00:00.000Z', sponsorSignal: { registerMatchStatus: 'NONE', jobWording: 'NOT_MENTIONED', explanation: 'Fixture only' }, eligibilityHints: [],
} as const;

describe('JobSnapshot service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one canonical snapshot and attaches every provider reference', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'snapshot-1', providerReferences: [] });
    prisma.jobSnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    await getOrCreateSnapshotFromNormalisedJob(job as never);

    expect(prisma.jobSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canonicalJobId: 'same-vacancy', dedupeFingerprint: 'same-vacancy', providerDescription: 'Build reliable platform services.', descriptionAvailability: 'FULL' }) }));
    expect(prisma.jobProviderReference.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.jobProviderReference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { provider_providerJobId: { provider: 'REED', providerJobId: 'two' } } }));
  });

  it('keeps provider and user descriptions separate and hashes the selected pasted text', async () => {
    const snapshot = { id: 'snapshot-1', providerDescription: 'Provider text', userSuppliedDescription: null, descriptionAvailability: 'PARTIAL', providerReferences: [] };
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshot);
    prisma.jobSnapshot.update.mockResolvedValue({ ...snapshot, userSuppliedDescription: 'User pasted full description' });

    await attachUserDescription({ userId: 'user-1', jobSnapshotId: 'snapshot-1', description: ' User pasted full description ' });

    expect(prisma.jobSnapshot.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userSuppliedDescription: 'User pasted full description', selectedDescriptionSource: 'USER_PASTED', selectedDescriptionHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
  });

  it('resolves provider partial and user pasted selections conservatively', () => {
    expect(resolveSelectedDescription({ providerDescription: 'Snippet', userSuppliedDescription: null, descriptionAvailability: 'PARTIAL' } as never)).toMatchObject({ source: 'PROVIDER_PARTIAL', partial: true });
    expect(resolveSelectedDescription({ providerDescription: 'Snippet', userSuppliedDescription: 'Full text', descriptionAvailability: 'PARTIAL' } as never)).toMatchObject({ source: 'USER_PASTED', text: 'Full text', partial: false });
    expect(resolveSelectedDescription({ providerDescription: null, userSuppliedDescription: null, descriptionAvailability: 'EXTERNAL_ONLY' } as never)).toBeNull();
  });
});