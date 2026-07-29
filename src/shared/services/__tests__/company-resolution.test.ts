import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: { companyRecord: { findUnique: vi.fn(), findMany: vi.fn() } },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

const {
  comparableHost,
  isResolvableEmployerName,
  resolveCompaniesForEmployers,
  resolveCompanyForEmployer,
} = await import('@/shared/services/company-resolution');

const company = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'company-1',
  displayName: 'Fixture Systems Ltd',
  normalisedName: 'fixture systems',
  websiteUrl: null,
  careersUrl: null,
  sponsorOrganisationName: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.companyRecord.findUnique.mockResolvedValue(null);
  prisma.companyRecord.findMany.mockResolvedValue([]);
});

describe('confident links', () => {
  it('links on an exact normalised identity', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());

    const result = await resolveCompanyForEmployer({ employerName: 'Fixture Systems Limited' });
    expect(result).toMatchObject({
      outcome: 'MATCHED_COMPANY',
      companyRecordId: 'company-1',
      method: 'EXACT_NORMALISED_NAME',
    });
  });

  it('links on a shared distinctive employer domain', async () => {
    prisma.companyRecord.findMany.mockResolvedValue([
      company({ websiteUrl: 'https://www.fixturesystems.co.uk/about' }),
    ]);

    const result = await resolveCompanyForEmployer({
      employerName: 'Fixture Systems Group',
      websiteUrl: 'https://fixturesystems.co.uk/jobs',
    });
    expect(result).toMatchObject({ outcome: 'MATCHED_COMPANY', method: 'WEBSITE_DOMAIN' });
  });

  it('links when every meaningful identity token belongs to exactly one company', async () => {
    prisma.companyRecord.findMany.mockResolvedValue([
      company({ normalisedName: 'fixture systems holdings' }),
    ]);

    const result = await resolveCompanyForEmployer({ employerName: 'Fixture Systems' });
    expect(result).toMatchObject({
      outcome: 'MATCHED_COMPANY',
      method: 'IDENTITY_TOKEN_CONTAINMENT',
    });
  });

  it('recognises a legal organisation name already recorded against a company', async () => {
    prisma.companyRecord.findMany.mockResolvedValue([
      company({
        normalisedName: 'fixture',
        sponsorOrganisationName: 'FIXTURE SYSTEMS LIMITED',
      }),
    ]);

    const result = await resolveCompanyForEmployer({ employerName: 'Fixture Systems Ltd' });
    expect(result).toMatchObject({ outcome: 'MATCHED_COMPANY', method: 'SPONSOR_LEGAL_NAME_ALIAS' });
  });
});

describe('refusals', () => {
  it('does not auto-link an ambiguous employer name', async () => {
    prisma.companyRecord.findMany.mockResolvedValue([
      company({ id: 'company-1', normalisedName: 'fixture systems north' }),
      company({ id: 'company-2', normalisedName: 'fixture systems south' }),
    ]);

    const result = await resolveCompanyForEmployer({ employerName: 'Fixture Systems' });
    expect(result.outcome).toBe('AMBIGUOUS_COMPANY');
    expect(result.companyRecordId).toBeUndefined();
  });

  it('leaves an unmatched employer unresolved rather than creating a company', async () => {
    const result = await resolveCompanyForEmployer({ employerName: 'Entirely Unknown Trading' });
    expect(result.outcome).toBe('NO_COMPANY_MATCH');
    expect(result.companyRecordId).toBeUndefined();
    // The service has no create path at all; this asserts the intent explicitly.
    expect(Object.keys(prisma.companyRecord)).not.toContain('create');
  });

  it('refuses a single vaguely similar name', async () => {
    // Shares only the "fixture" token; "systems" is absent from the candidate.
    prisma.companyRecord.findMany.mockResolvedValue([
      company({ normalisedName: 'fixture catering' }),
    ]);

    const result = await resolveCompanyForEmployer({ employerName: 'Fixture Systems' });
    expect(result.outcome).toBe('NO_COMPANY_MATCH');
  });

  it('refuses a name with fewer than two meaningful identity tokens', async () => {
    const result = await resolveCompanyForEmployer({ employerName: 'UK Group Ltd' });
    expect(result.outcome).toBe('NO_COMPANY_MATCH');
    expect(prisma.companyRecord.findMany).not.toHaveBeenCalled();
  });

  it('refuses provider placeholders that stand in for a withheld employer', async () => {
    for (const placeholder of ['Confidential', 'Our Client', 'Unknown', '  ']) {
      expect(isResolvableEmployerName(placeholder)).toBe(false);
      expect((await resolveCompanyForEmployer({ employerName: placeholder })).outcome).toBe('NO_COMPANY_MATCH');
    }
  });

  it('ignores a shared ATS host, which identifies a vendor and not an employer', async () => {
    await resolveCompanyForEmployer({
      employerName: 'Alpha Beta',
      careersUrl: 'https://boards.greenhouse.io/alphabeta',
    });
    // The domain branch must not even be attempted for a multi-tenant host.
    expect(prisma.companyRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.companyRecord.findMany.mock.calls[0][0].where.OR[0]).not.toHaveProperty('websiteUrl');
  });

  it('rejects a substring domain hit that is not actually the host', async () => {
    prisma.companyRecord.findMany.mockResolvedValueOnce([
      company({ websiteUrl: 'https://notfixturesystems.co.uk.evil.test/' }),
    ]);
    const result = await resolveCompanyForEmployer({
      employerName: 'Fixture Systems',
      websiteUrl: 'https://fixturesystems.co.uk',
    });
    expect(result.outcome).not.toBe('MATCHED_COMPANY');
  });
});

describe('batching', () => {
  it('resolves each distinct employer once and answers for every input', async () => {
    prisma.companyRecord.findUnique.mockResolvedValue(company());

    const results = await resolveCompaniesForEmployers([
      { employerName: 'Fixture Systems Ltd' },
      { employerName: 'Fixture Systems Ltd' },
      { employerName: 'Fixture Systems Limited' },
    ]);

    expect(results.size).toBe(2); // Keyed by the original strings supplied.
    expect(results.get('Fixture Systems Ltd')?.outcome).toBe('MATCHED_COMPANY');
    expect(results.get('Fixture Systems Limited')?.outcome).toBe('MATCHED_COMPANY');
    // All three normalise identically, so exactly one lookup is made.
    expect(prisma.companyRecord.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('host comparison', () => {
  it('normalises a host and refuses anything that is not one', () => {
    expect(comparableHost('https://www.Example.co.uk/jobs')).toBe('example.co.uk');
    expect(comparableHost('example.com')).toBe('example.com');
    expect(comparableHost('localhost')).toBeUndefined();
    expect(comparableHost(null)).toBeUndefined();
  });
});
