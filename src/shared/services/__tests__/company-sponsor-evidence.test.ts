import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: { companyRecord: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

const getSponsorRegisterVersion = vi.fn(async () => 'register-v1');
vi.mock('@/shared/services/sponsor-registry', () => ({
  getSponsorRegisterVersion: () => getSponsorRegisterVersion(),
}));

const matchSponsorCompaniesCached = vi.fn();
vi.mock('@/shared/services/sponsor-match-cache', () => ({
  matchSponsorCompaniesCached: (...args: unknown[]) => matchSponsorCompaniesCached(...args),
}));

vi.mock('@/shared/lib/cache/cache-provider', () => ({ getCacheStore: () => ({}) }));

const {
  ensureCompanySponsorEvidence,
  isSponsorEvidenceStale,
  sponsorStatusToEvidenceStatus,
  toSponsorEvidenceViewModel,
} = await import('@/shared/services/company-sponsor-evidence');

const company = (over: Record<string, unknown> = {}) => ({
  id: 'company-1',
  displayName: 'Fixture Systems Ltd',
  sponsorMatchStatus: 'NOT_CHECKED',
  sponsorOrganisationName: null,
  sponsorRegisterVersion: null,
  sponsorCheckedAt: null,
  sponsorEvidence: null,
  ...over,
});

const matched = (status: string, organisationName?: string) =>
  new Map([['Fixture Systems Ltd', { status, ...(organisationName ? { organisationName } : {}), reasons: ['A reason.'] }]]);

beforeEach(() => {
  vi.clearAllMocks();
  getSponsorRegisterVersion.mockResolvedValue('register-v1');
  prisma.companyRecord.update.mockResolvedValue({});
});

describe('status mapping', () => {
  it('presents exact and high-confidence likely matches as MATCHED', () => {
    expect(sponsorStatusToEvidenceStatus('EXACT')).toBe('MATCHED');
    expect(sponsorStatusToEvidenceStatus('LIKELY')).toBe('MATCHED');
    expect(sponsorStatusToEvidenceStatus('AMBIGUOUS')).toBe('AMBIGUOUS');
    expect(sponsorStatusToEvidenceStatus('NONE')).toBe('NONE');
    expect(sponsorStatusToEvidenceStatus('NOT_CHECKED')).toBe('NOT_CHECKED');
    expect(sponsorStatusToEvidenceStatus(null)).toBe('NOT_CHECKED');
  });
});

describe('persistence', () => {
  it('persists a matched result with its register version and provenance', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());
    matchSponsorCompaniesCached.mockResolvedValue(matched('EXACT', 'FIXTURE SYSTEMS LIMITED'));

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result).toMatchObject({ outcome: 'CHECKED', status: 'MATCHED' });
    const written = prisma.companyRecord.update.mock.calls[0][0].data;
    expect(written).toMatchObject({
      sponsorMatchStatus: 'EXACT',
      sponsorOrganisationName: 'FIXTURE SYSTEMS LIMITED',
      sponsorRegisterVersion: 'register-v1',
    });
    expect(written.sponsorCheckedAt).toBeInstanceOf(Date);
    expect(written.sponsorEvidence).toMatchObject({ confidenceBand: 'EXACT' });
    expect(written.sponsorHistory.upsert.create).toMatchObject({
      registerVersion: 'register-v1',
      matchStatus: 'EXACT',
      organisationName: 'FIXTURE SYSTEMS LIMITED',
    });
  });

  it('persists a completed NONE, which is a real finding rather than an absence', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());
    matchSponsorCompaniesCached.mockResolvedValue(matched('NONE'));

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result.status).toBe('NONE');
    expect(prisma.companyRecord.update.mock.calls[0][0].data).toMatchObject({
      sponsorMatchStatus: 'NONE',
      sponsorRegisterVersion: 'register-v1',
    });
  });

  it('persists an ambiguous result without naming a single organisation', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());
    matchSponsorCompaniesCached.mockResolvedValue(
      new Map([['Fixture Systems Ltd', { status: 'AMBIGUOUS', candidateOrganisationNames: ['A LTD', 'B LTD'] }]]),
    );

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result.status).toBe('AMBIGUOUS');
    const written = prisma.companyRecord.update.mock.calls[0][0].data;
    expect(written.sponsorOrganisationName).toBeNull();
    expect(written.sponsorEvidence.candidateOrganisationNames).toEqual(['A LTD', 'B LTD']);
  });

  it('does not expose an internal fuzzy score in persisted provenance', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());
    matchSponsorCompaniesCached.mockResolvedValue(matched('LIKELY', 'FIXTURE SYSTEMS LIMITED'));

    await ensureCompanySponsorEvidence('company-1');
    const written = JSON.stringify(prisma.companyRecord.update.mock.calls[0][0].data.sponsorEvidence);
    expect(written).not.toMatch(/"score"|"similarity"|0\.\d\d/);
  });
});

describe('failure is never a NONE', () => {
  it('leaves evidence untouched when the register cannot be loaded', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());
    getSponsorRegisterVersion.mockRejectedValue(new Error('register offline'));

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result).toMatchObject({ outcome: 'CHECK_UNAVAILABLE', status: 'NOT_CHECKED' });
    expect(prisma.companyRecord.update).not.toHaveBeenCalled();
  });

  it('leaves evidence untouched when the matcher itself fails', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());
    matchSponsorCompaniesCached.mockRejectedValue(new Error('cache exploded'));

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result.outcome).toBe('CHECK_UNAVAILABLE');
    expect(prisma.companyRecord.update).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing MATCHED with NOT_CHECKED on an outage', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(
      company({ sponsorMatchStatus: 'EXACT', sponsorRegisterVersion: 'register-v0' }),
    );
    getSponsorRegisterVersion.mockRejectedValue(new Error('register offline'));

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result.status).toBe('MATCHED');
    expect(prisma.companyRecord.update).not.toHaveBeenCalled();
  });

  it('records an unusable employer name as NOT_CHECKED with a reason, not NONE', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company({ displayName: '   ' }));
    // The matcher declines the name, so the map has no entry for it at all.
    matchSponsorCompaniesCached.mockResolvedValue(new Map());

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result).toMatchObject({ outcome: 'EMPLOYER_UNIDENTIFIABLE', status: 'NOT_CHECKED' });
    expect(prisma.companyRecord.update.mock.calls[0][0].data.sponsorMatchStatus).toBe('NOT_CHECKED');
    expect(prisma.companyRecord.update.mock.calls[0][0].data.sponsorEvidence.checkState).toBe('EMPLOYER_UNIDENTIFIABLE');
  });
});

describe('register versions', () => {
  it('treats evidence from a superseded register as stale and refreshes it', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(
      company({ sponsorMatchStatus: 'EXACT', sponsorRegisterVersion: 'register-v0', sponsorCheckedAt: new Date('2020-01-01') }),
    );
    matchSponsorCompaniesCached.mockResolvedValue(matched('NONE'));

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result.outcome).toBe('REFRESHED_STALE');
    expect(prisma.companyRecord.update.mock.calls[0][0].data.sponsorRegisterVersion).toBe('register-v1');
  });

  it('does no work when evidence already belongs to the current register', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(
      company({ sponsorMatchStatus: 'EXACT', sponsorRegisterVersion: 'register-v1' }),
    );

    const result = await ensureCompanySponsorEvidence('company-1');
    expect(result.outcome).toBe('ALREADY_CURRENT');
    expect(matchSponsorCompaniesCached).not.toHaveBeenCalled();
    expect(prisma.companyRecord.update).not.toHaveBeenCalled();
  });

  it('classifies staleness conservatively', () => {
    expect(isSponsorEvidenceStale({ sponsorMatchStatus: 'NOT_CHECKED' }, 'v1')).toBe(true);
    expect(isSponsorEvidenceStale({ sponsorMatchStatus: 'EXACT' }, 'v1')).toBe(true);
    expect(isSponsorEvidenceStale({ sponsorMatchStatus: 'EXACT', sponsorRegisterVersion: 'v0' }, 'v1')).toBe(true);
    expect(isSponsorEvidenceStale({ sponsorMatchStatus: 'EXACT', sponsorRegisterVersion: 'v1' }, 'v1')).toBe(false);
    // No current version is knowable: claiming staleness would be a guess.
    expect(isSponsorEvidenceStale({ sponsorMatchStatus: 'EXACT', sponsorRegisterVersion: 'v0' }, undefined)).toBe(false);
  });
});

describe('view model', () => {
  it('always carries the disclaimer, in every state', () => {
    for (const status of ['EXACT', 'LIKELY', 'AMBIGUOUS', 'NONE', 'NOT_CHECKED']) {
      expect(toSponsorEvidenceViewModel(company({ sponsorMatchStatus: status })).disclaimer).toMatch(
        /does not confirm sponsorship for a particular vacancy or candidate/,
      );
    }
    expect(toSponsorEvidenceViewModel(null).disclaimer).toBeTruthy();
  });

  it('exposes the checked timestamp and register version', () => {
    const view = toSponsorEvidenceViewModel(
      company({ sponsorMatchStatus: 'EXACT', sponsorOrganisationName: 'FIXTURE SYSTEMS LIMITED', sponsorRegisterVersion: 'register-v1', sponsorCheckedAt: new Date('2026-07-01T00:00:00.000Z') }),
      { currentRegisterVersion: 'register-v1' },
    );
    expect(view).toMatchObject({
      status: 'MATCHED',
      matchedOrganisationName: 'FIXTURE SYSTEMS LIMITED',
      registerVersion: 'register-v1',
      checkedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(view.stale).toBeUndefined();
  });

  it('flags stale evidence rather than presenting it as current', () => {
    const view = toSponsorEvidenceViewModel(
      company({ sponsorMatchStatus: 'EXACT', sponsorRegisterVersion: 'register-v0' }),
      { currentRegisterVersion: 'register-v1' },
    );
    expect(view.stale).toBe(true);
  });

  it('distinguishes an unresolved company from an outstanding check', () => {
    expect(toSponsorEvidenceViewModel(null).checkState).toBe('COMPANY_UNRESOLVED');
    expect(toSponsorEvidenceViewModel(company()).checkState).toBe('NEVER_CHECKED');
    expect(
      toSponsorEvidenceViewModel(company({ sponsorEvidence: { checkState: 'EMPLOYER_UNIDENTIFIABLE' } })).checkState,
    ).toBe('EMPLOYER_UNIDENTIFIABLE');
  });

  it('never emits a checkState alongside a completed outcome', () => {
    expect(toSponsorEvidenceViewModel(company({ sponsorMatchStatus: 'NONE', sponsorRegisterVersion: 'v1' })).checkState).toBeUndefined();
  });
});
