import { describe, expect, it, vi, beforeEach } from 'vitest';

const { prisma } = vi.hoisted(() => {
  const prisma = {
    jobSnapshot: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    // Ingestion now resolves an employer NAME to a canonical company, so the
    // aggregator half of the board can carry sponsor evidence at all.
    companyRecord: { findUnique: vi.fn(), findMany: vi.fn() },
    jobProviderReference: { findMany: vi.fn(), upsert: vi.fn() },
    savedJob: { upsert: vi.fn(), deleteMany: vi.fn() },
    jobMatchRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { prisma };
});
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

import {
  attachUserDescription,
  ensurePersistedJob,
  findExistingJobSnapshots,
  persistTrustedProviderJob,
  resolveSelectedDescription,
} from '@/shared/services/job-snapshot';

const job = {
  source: 'ADZUNA', sourceJobId: 'one', canonicalUrl: 'https://example.test/one', canonicalJobId: 'provider-one', title: 'Platform Engineer', company: 'Fixture Systems Ltd', companyNormalised: 'fixture systems', locationText: 'Leeds, UK', remoteType: 'HYBRID', description: 'Build reliable platform services.', descriptionAvailability: 'FULL', providerReferences: [{ provider: 'ADZUNA', sourceJobId: 'one', identityStability: 'STABLE', sourceUrl: 'https://example.test/one' }, { provider: 'REED', sourceJobId: 'two', identityStability: 'STABLE', sourceUrl: 'https://example.test/two' }], dedupeFingerprint: 'same-vacancy', fetchedAt: '2026-07-28T10:00:00.000Z', sponsorSignal: { registerMatchStatus: 'NONE', jobWording: 'NOT_MENTIONED', explanation: 'Fixture only' }, eligibilityHints: [],
} as const;

describe('JobSnapshot service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof prisma) => unknown) => callback(prisma));
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValue([{ pg_advisory_xact_lock: null }]);
    prisma.jobProviderReference.findMany.mockResolvedValue([]);
    prisma.jobSnapshot.findFirst.mockResolvedValue(null);
    // Default: the employer text resolves to nothing. Individual tests opt in.
    prisma.companyRecord.findUnique.mockResolvedValue(null);
    prisma.companyRecord.findMany.mockResolvedValue([]);
  });

  it('resolves provider references before equivalence and merges every stable reference', async () => {
    prisma.jobProviderReference.findMany.mockResolvedValue([{ jobSnapshotId: 'snapshot-ref' }]);
    prisma.jobSnapshot.findUnique.mockResolvedValue({
      id: 'snapshot-ref',
      status: 'ACTIVE',
      importedByUserId: null,
      providerDescription: 'Old text',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      salaryText: null,
      vacancySponsorshipSignal: null,
      companyRecordId: null,
      companyLinkStatus: 'NO_COMPANY_MATCH',
    });
    prisma.jobSnapshot.update.mockResolvedValue({ id: 'snapshot-ref' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    const result = await ensurePersistedJob(job as never);

    expect(result).toMatchObject({ snapshot: { id: 'snapshot-ref' }, outcome: 'UPDATED' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.jobSnapshot.findFirst).not.toHaveBeenCalled();
    expect(prisma.jobProviderReference.upsert).toHaveBeenCalledTimes(2);
  });

  it('uses only a public equivalence match and reactivates an archived snapshot', async () => {
    prisma.jobSnapshot.findFirst.mockResolvedValue({
      id: 'snapshot-equivalent',
      status: 'ARCHIVED',
      importedByUserId: null,
      providerDescription: job.description,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      salaryText: null,
      vacancySponsorshipSignal: job.sponsorSignal,
      companyRecordId: null,
      companyLinkStatus: 'NO_COMPANY_MATCH',
    });
    prisma.jobSnapshot.update.mockResolvedValue({ id: 'snapshot-equivalent', status: 'ACTIVE' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    const result = await ensurePersistedJob(job as never);

    expect(prisma.jobSnapshot.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ canonicalJobId: job.dedupeFingerprint, importedByUserId: null }),
    }));
    expect(result).toMatchObject({ snapshot: { id: 'snapshot-equivalent' }, outcome: 'REACTIVATED' });
    expect(prisma.jobSnapshot.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
  });

  it('reports unchanged when only freshness timestamps are renewed', async () => {
    prisma.jobSnapshot.findFirst.mockResolvedValue({
      id: 'snapshot-unchanged',
      canonicalJobId: job.dedupeFingerprint,
      importedByUserId: null,
      status: 'ACTIVE',
      title: job.title,
      normalisedTitle: 'platform engineer',
      employerName: job.company,
      normalisedEmployerName: job.companyNormalised,
      providerDescription: job.description,
      descriptionAvailability: 'PARTIAL',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      salaryText: null,
      vacancySponsorshipSignal: job.sponsorSignal,
      companyRecordId: null,
      companyLinkStatus: 'NO_COMPANY_MATCH',
      employerSourceId: null,
      locationText: job.locationText,
      city: null,
      region: null,
      country: null,
      workStyle: job.remoteType,
      contractType: null,
      employmentType: null,
      dedupeFingerprint: job.dedupeFingerprint,
      postedAt: null,
      expiresAt: null,
    });
    prisma.jobSnapshot.update.mockResolvedValue({ id: 'snapshot-unchanged' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    await expect(ensurePersistedJob(job as never)).resolves.toMatchObject({
      outcome: 'UNCHANGED',
    });
    expect(prisma.jobSnapshot.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ descriptionAvailability: true }),
    }));
  });

  it('rejects a session-only identity unless it safely matches an existing public snapshot', async () => {
    const unstable = {
      ...job,
      providerReferences: job.providerReferences.map((reference) => ({
        ...reference,
        identityStability: 'SESSION_ONLY' as const,
      })),
    };

    await expect(ensurePersistedJob(unstable as never)).rejects.toMatchObject({
      code: 'JOB_IDENTITY_UNSTABLE',
    });
    expect(prisma.jobSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.jobProviderReference.upsert).not.toHaveBeenCalled();
  });

  it('retries a unique conflict by resolving the winning provider reference', async () => {
    const conflict = Object.assign(new Error('unique provider reference'), { code: 'P2002' });
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (client: typeof prisma) => unknown) => callback(prisma));
    prisma.jobProviderReference.findMany.mockResolvedValue([{ jobSnapshotId: 'snapshot-winner' }]);
    prisma.jobSnapshot.findUnique.mockResolvedValue({
      id: 'snapshot-winner', status: 'ACTIVE', importedByUserId: null,
      providerDescription: job.description, salaryMin: null, salaryMax: null,
      salaryCurrency: null, salaryPeriod: null, salaryText: null,
      vacancySponsorshipSignal: job.sponsorSignal, companyRecordId: null,
      companyLinkStatus: 'NO_COMPANY_MATCH',
    });
    prisma.jobSnapshot.update.mockResolvedValue({ id: 'snapshot-winner' });
    prisma.jobProviderReference.upsert.mockResolvedValue({});

    const result = await ensurePersistedJob(job as never);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(result.snapshot.id).toBe('snapshot-winner');
  });

  it('batch-resolves stable references then public equivalence without writing', async () => {
    prisma.jobProviderReference.findMany.mockResolvedValue([{
      provider: 'ADZUNA',
      providerJobId: 'one',
      jobSnapshot: { id: 'snapshot-ref', canonicalJobId: 'stored-ref', importedByUserId: null },
    }]);
    prisma.jobSnapshot.findMany.mockResolvedValue([{
      id: 'snapshot-equivalent',
      canonicalJobId: 'same-vacancy-two',
      importedByUserId: null,
    }]);
    const second = {
      ...job,
      sourceJobId: 'other',
      canonicalJobId: 'provider-two',
      dedupeFingerprint: 'same-vacancy-two',
      providerReferences: [{
        provider: 'REED' as const,
        sourceJobId: 'other',
        identityStability: 'STABLE' as const,
        sourceUrl: 'https://example.test/other',
      }],
    };

    const matches = await findExistingJobSnapshots([job, second] as never);

    expect(matches.get(job.canonicalJobId)).toMatchObject({ id: 'snapshot-ref' });
    expect(matches.get(second.canonicalJobId)).toMatchObject({ id: 'snapshot-equivalent' });
    expect(prisma.jobSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.jobSnapshot.update).not.toHaveBeenCalled();
    expect(prisma.jobProviderReference.upsert).not.toHaveBeenCalled();
  });

  it('creates one canonical snapshot and attaches every provider reference', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue({ id: 'snapshot-1', providerReferences: [] });
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
    prisma.jobSnapshot.findFirst.mockResolvedValueOnce({ id: 'snapshot-1', status: 'ACTIVE', importedByUserId: null, salaryMin: 90000, salaryMax: 110000, salaryCurrency: 'GBP', salaryPeriod: 'YEAR', salaryText: '£90K–£110K', providerDescription: 'A substantially richer existing provider description.', descriptionAvailability: 'FULL', vacancySponsorshipSignal: { preserved: true }, companyRecordId: null, companyLinkStatus: 'NO_COMPANY_MATCH' });
    prisma.jobSnapshot.findUnique.mockResolvedValue({ id: 'snapshot-1', providerReferences: [] });
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
    prisma.jobSnapshot.findUnique.mockResolvedValue({ id: 'snapshot-1', providerReferences: [] });
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
