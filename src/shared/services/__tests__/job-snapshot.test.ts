import { describe, expect, it, vi, beforeEach } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    jobSnapshot: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    // Ingestion now resolves an employer NAME to a canonical company, so the
    // aggregator half of the board can carry sponsor evidence at all.
    companyRecord: { findUnique: vi.fn(), findMany: vi.fn() },
    jobProviderReference: { upsert: vi.fn() },
    savedJob: { upsert: vi.fn(), deleteMany: vi.fn() },
    jobMatchRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

import { attachUserDescription, persistTrustedProviderJob, resolveSelectedDescription } from '@/shared/services/job-snapshot';

const job = {
  source: 'ADZUNA', sourceJobId: 'one', canonicalUrl: 'https://example.test/one', canonicalJobId: 'provider-one', title: 'Platform Engineer', company: 'Fixture Systems Ltd', companyNormalised: 'fixture systems', locationText: 'Leeds, UK', remoteType: 'HYBRID', description: 'Build reliable platform services.', descriptionAvailability: 'FULL', providerReferences: [{ provider: 'ADZUNA', sourceJobId: 'one', sourceUrl: 'https://example.test/one' }, { provider: 'REED', sourceJobId: 'two', sourceUrl: 'https://example.test/two' }], dedupeFingerprint: 'same-vacancy', fetchedAt: '2026-07-28T10:00:00.000Z', sponsorSignal: { registerMatchStatus: 'NONE', jobWording: 'NOT_MENTIONED', explanation: 'Fixture only' }, eligibilityHints: [],
} as const;

describe('JobSnapshot service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the employer text resolves to nothing. Individual tests opt in.
    prisma.companyRecord.findUnique.mockResolvedValue(null);
    prisma.companyRecord.findMany.mockResolvedValue([]);
  });

  it('creates one canonical snapshot and attaches every provider reference', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'snapshot-1', providerReferences: [] });
    prisma.jobSnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    await persistTrustedProviderJob(job as never);

    // Availability is assessed from the text being STORED, never copied from the
    // NormalisedJob. This fixture declares FULL, but the text is one sentence
    // from Adzuna — a provider that contractually returns partial bodies — so
    // the persisted verdict is PARTIAL. Trusting the incoming field is what let
    // a truncated Adzuna advert be stored as a complete one.
    expect(prisma.jobSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canonicalJobId: 'same-vacancy', dedupeFingerprint: 'same-vacancy', providerDescription: 'Build reliable platform services.', descriptionAvailability: 'PARTIAL' }) }));
    expect(prisma.jobProviderReference.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.jobProviderReference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { provider_providerJobId: { provider: 'REED', providerJobId: 'two' } } }));
  });

  it('preserves reliable canonical salary and richer provider intelligence on a weaker refresh', async () => {
    prisma.jobSnapshot.findUnique
      .mockResolvedValueOnce({ id: 'snapshot-1', salaryMin: 90000, salaryMax: 110000, salaryCurrency: 'GBP', salaryPeriod: 'YEAR', salaryText: '£90K–£110K', providerDescription: 'A substantially richer existing provider description.', descriptionAvailability: 'FULL', vacancySponsorshipSignal: { preserved: true } })
      .mockResolvedValueOnce({ id: 'snapshot-1', providerReferences: [] });
    prisma.jobSnapshot.update.mockResolvedValue({ id: 'snapshot-1' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    await persistTrustedProviderJob({ ...job, description: 'Short refresh' } as never);

    // The richer stored description is retained, and the availability is
    // recomputed FROM IT. Previously a stored FULL was sticky — `existing
    // ?.descriptionAvailability === 'FULL' ? 'FULL' : …` — so a wrong
    // classification could never be corrected by any later refresh.
    expect(prisma.jobSnapshot.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ salaryMin: 90000, salaryMax: 110000, salaryText: '£90K–£110K', providerDescription: 'A substantially richer existing provider description.', descriptionAvailability: 'PARTIAL', vacancySponsorshipSignal: { preserved: true } }) }));
  });

  it('never persists the classifier’s derived country as provider evidence', async () => {
    // MEASURED DATA-CORRUPTION REGRESSION. `assessUkLocation` treats a stored
    // country of GB/UK as EXPLICIT country evidence. Persisting its own derived
    // `countryCode` into that column closed a feedback loop: one buggy
    // classification stamped `country = 'GB'` onto a New York vacancy, and every
    // later run read it back as proof the vacancy was British — permanently, and
    // immune to fixing the classifier. 172 rows were corrupted this way before
    // it was caught. Only the PROVIDER's own country may be written here.
    prisma.jobSnapshot.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'snapshot-1', providerReferences: [] });
    prisma.jobSnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    await persistTrustedProviderJob({ ...job, locationText: 'New York City', country: undefined, countryCode: 'GB' } as never);

    const written = prisma.jobSnapshot.create.mock.calls[0][0].data;
    expect(written.country).toBeNull();
  });

  it('keeps provider and user descriptions separate and hashes the selected pasted text', async () => {
    const snapshot = { id: 'snapshot-1', importedByUserId: 'user-1', providerDescription: 'Provider text', userSuppliedDescription: null, descriptionAvailability: 'PARTIAL', providerReferences: [] };
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshot);
    prisma.jobSnapshot.update.mockResolvedValue({ ...snapshot, userSuppliedDescription: 'User pasted full description' });

    await attachUserDescription({ userId: 'user-1', jobSnapshotId: 'snapshot-1', description: ' User pasted full description ' });

    expect(prisma.jobSnapshot.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userSuppliedDescription: 'User pasted full description', selectedDescriptionSource: 'USER_PASTED', selectedDescriptionHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
  });

  it('resolves provider partial and user pasted selections conservatively', () => {
    const pastedAdvert = [
      'About the role',
      'We are recruiting a platform engineer to join our Leeds infrastructure team.',
      'Responsibilities include running the Kubernetes estate and the deployment pipeline.',
      'Requirements: three years of production platform experience and strong Terraform.',
      'Benefits: 25 days annual leave, a matched pension and a training budget.',
      'You will work alongside four other engineers and report to the head of platform.',
      'Applications close at the end of the month and interviews run over two stages.',
    ].join('\n');

    expect(resolveSelectedDescription({ providerDescription: 'Snippet', userSuppliedDescription: null, descriptionAvailability: 'PARTIAL' } as never)).toMatchObject({ source: 'PROVIDER_PARTIAL', partial: true, availability: 'PARTIAL' });

    // A COMPLETE paste is full: the provider ceiling does not apply to the user.
    expect(resolveSelectedDescription({ providerDescription: 'Snippet', userSuppliedDescription: pastedAdvert, descriptionAvailability: 'PARTIAL' } as never)).toMatchObject({ source: 'USER_PASTED', partial: false, availability: 'FULL' });

    // A short paste is NOT. Pasting is not a promise of completeness — a user
    // can paste back the same teaser — and treating it as full is how a partial
    // analysis gets presented as a reliable match.
    expect(resolveSelectedDescription({ providerDescription: 'Snippet', userSuppliedDescription: 'Full text', descriptionAvailability: 'PARTIAL' } as never)).toMatchObject({ source: 'USER_PASTED', text: 'Full text', partial: true, availability: 'PARTIAL' });

    expect(resolveSelectedDescription({ providerDescription: null, userSuppliedDescription: null, descriptionAvailability: 'EXTERNAL_ONLY' } as never)).toBeNull();
  });
});
