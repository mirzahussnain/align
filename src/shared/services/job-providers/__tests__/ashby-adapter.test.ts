import { describe, expect, it } from 'vitest';
import { createAshbyAdapter } from '@/shared/services/job-providers/ashby-adapter';

const source = { id: 'source-1', companyRecordId: 'company-1', provider: 'ASHBY' as const, providerIdentifier: 'acme', enabled: true, verificationStatus: 'VERIFIED' as const, companyRecord: { id: 'company-1', displayName: 'Acme Holdings', websiteUrl: 'https://acme.example', careersUrl: 'https://careers.acme.example' } };
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const posting = { id: 'one', title: 'Platform Engineer', location: 'London, United Kingdom', secondaryLocations: [{ location: 'Manchester, United Kingdom' }], department: 'Engineering', team: 'Platform', isListed: true, workplaceType: 'Hybrid', descriptionHtml: '<p>Build systems.</p><ul><li>Own reliability</li></ul><script>alert(1)</script>', publishedAt: '2026-07-28T10:00:00.000Z', employmentType: 'FullTime', jobUrl: 'https://jobs.ashbyhq.com/acme/one', applyUrl: 'https://careers.acme.example/jobs/one', compensation: { scrapeableCompensationSalarySummary: '?80K - ?100K', summaryComponents: [{ compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'GBP', minValue: 80000, maxValue: 100000 }] } };

describe('Ashby employer adapter', () => {
  it('normalises listed public jobs, structured compensation, locations and safe HTML', async () => {
    const adapter = createAshbyAdapter({ fetch: async () => response(200, { name: 'Acme Holdings', jobs: [posting] }) });
    const result = await adapter.fetchBoard(source);
    expect(result).toMatchObject({ rawReceived: 1, invalidUrls: 0, jobs: [{ source: 'ASHBY', sourceJobId: 'one', remoteType: 'HYBRID', salaryMin: 80000, salaryMax: 100000, salaryPeriod: 'YEAR', departments: ['Engineering', 'Platform'], offices: ['Manchester, United Kingdom'] }] });
    expect(result.jobs[0].providerReferences[0]).toMatchObject({ sourceUrl: posting.jobUrl, applicationUrl: posting.applyUrl });
    expect(result.jobs[0].description).toContain('Own reliability');
    expect(result.jobs[0].description).not.toContain('alert');
  });

  it('accepts a valid empty board and uses the public compensation endpoint', async () => {
    let requestUrl = '';
    const adapter = createAshbyAdapter({ fetch: async (url) => { requestUrl = url; return response(200, { jobs: [] }); } });
    await expect(adapter.fetchBoard(source)).resolves.toMatchObject({ jobs: [], rawReceived: 0 });
    expect(requestUrl).toBe('https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true');
  });

  it('rejects malformed and disabled sources, drops unlisted jobs, and retains a safe hosted job if an optional application URL is unsafe', async () => {
    const adapter = createAshbyAdapter({ fetch: async () => response(200, { jobs: [{ ...posting, applyUrl: 'https://tracker.invalid/redirect' }, { ...posting, id: 'hidden', isListed: false }] }) });
    const result = await adapter.fetchBoard(source);
    expect(result.jobs).toHaveLength(1);
    expect(result).toMatchObject({ invalidApplicationUrls: 1, urlRejections: { EMPLOYER_HOST_MISMATCH: 1 } });
    expect(result.jobs[0].providerReferences[0].applicationUrl).toBeUndefined();
    await expect(adapter.fetchBoard({ ...source, enabled: false })).rejects.toThrow('verified and enabled');
    await expect(createAshbyAdapter({ fetch: async () => response(200, {}) }).fetchBoard(source)).rejects.toThrow('ASHBY_MALFORMED_RESPONSE');
  });

  it('handles hourly and absent-currency compensation without inventing a currency', async () => {
    const hourly = { ...posting, compensation: { summaryComponents: [{ compensationType: 'Salary', interval: '1 HOUR', currencyCode: 'GBP', minValue: 30, maxValue: 40 }] } };
    const unknownCurrency = { ...posting, id: 'two', compensation: { summaryComponents: [{ compensationType: 'Salary', interval: '1 YEAR', minValue: 80000, maxValue: 100000 }] } };
    const result = await createAshbyAdapter({ fetch: async () => response(200, { jobs: [hourly, unknownCurrency] }) }).fetchBoard(source);
    expect(result.jobs[0]).toMatchObject({ salaryMin: 30, salaryMax: 40, salaryPeriod: 'HOUR', currency: 'GBP' });
    expect(result.jobs[1].salaryMin).toBeUndefined();
    expect(result.jobs[1].currency).toBeUndefined();
  });
});
