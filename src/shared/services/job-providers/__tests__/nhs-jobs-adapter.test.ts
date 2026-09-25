import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import { deduplicateJobs, searchProvider } from '@/shared/services/job-search';
import { normaliseProviderJob } from '@/shared/services/job-normalisation';
import { JobProviderError } from '@/shared/types/job-provider';
import { buildNhsJobsSearchUrl, nhsJobsAdapter, parseNhsJobsXml } from '../nhs-jobs-adapter';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nhsSearch>
  <totalPages>2</totalPages><totalResults>6</totalResults>
  <vacancyDetails>
    <closeDate>2026-10-10</closeDate><description><![CDATA[Provide patient care &amp; support.]]></description>
    <employer>North NHS Trust</employer><id>C1234</id>
    <location><location>Leeds, LS1 1AA</location><location>Bradford, BD1 1AA</location></location>
    <postDate>2026-09-24</postDate><reference>ABC-123</reference>
    <salary>£29,970 to £36,483 a year</salary><title>Registered Nurse</title><type>Permanent</type>
    <url>https://www.jobs.nhs.uk/candidate/jobadvert/C1234</url>
  </vacancyDetails>
</nhsSearch>`;

afterEach(() => vi.unstubAllGlobals());

describe('NHS Jobs XML adapter', () => {
  it('parses documented XML fields without leaking the transport shape', () => {
    const parsed = parseNhsJobsXml(xml, 1);
    expect(parsed).toMatchObject({ total: 6, totalPages: 2 });
    expect(parsed.jobs[0]).toMatchObject({
      id: 'nhs_jobs-C1234', title: 'Registered Nurse', company: 'North NHS Trust',
      location: 'Leeds, LS1 1AA; Bradford, BD1 1AA', contractType: 'Permanent',
      postedDate: '2026-09-24', closingDate: '2026-10-10', source: 'nhs_jobs',
      url: 'https://www.jobs.nhs.uk/candidate/jobadvert/C1234',
    });
  });

  it('accepts a documented empty result and rejects malformed XML', () => {
    expect(parseNhsJobsXml('<nhsSearch><totalPages>0</totalPages><totalResults>0</totalResults></nhsSearch>', 1).jobs).toEqual([]);
    expect(() => parseNhsJobsXml('<html>upstream error</html>', 1)).toThrowError(JobProviderError);
  });

  it('maps documented query, location-distance, filters, sorting and pagination parameters', () => {
    const url = new URL(buildNhsJobsSearchUrl({
      query: 'registered nurse', location: 'Leeds', page: 2, perPage: 50,
      salaryMin: 30_000, salaryMax: 50_000, contractType: 'permanent', remote: true,
      postedWithinDays: 14, sortBy: 'date',
    }, new Date('2026-09-25T12:00:00.000Z')));
    expect(url.origin + url.pathname).toBe('https://www.jobs.nhs.uk/api/v1/search_xml');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      keyword: 'registered nurse', location: 'Leeds', distance: '25', page: '2',
      salaryFrom: '30000', salaryTo: '50000', contractType: 'Permanent',
      workingPattern: 'remoteWorking', publishedFrom: '2026-09-11', sort: 'publicationDateDesc',
    });
  });

  it('normalizes and preserves official NHS provenance and closing date', () => {
    const normalized = normaliseProviderJob(parseNhsJobsXml(xml, 1).jobs[0]);
    expect(normalized).toMatchObject({
      source: 'NHS_JOBS', sourceJobId: 'C1234', canonicalUrl: 'https://www.jobs.nhs.uk/candidate/jobadvert/C1234',
      expiresAt: '2026-10-10T00:00:00.000Z', descriptionAvailability: 'PARTIAL',
    });
    expect(normalized.providerReferences[0]).toMatchObject({ provider: 'NHS_JOBS', sourceUrl: normalized.canonicalUrl });
  });

  it('classifies provider failures and caches a successful provider page', async () => {
    const fetchMock = vi.fn(async () => new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } }));
    vi.stubGlobal('fetch', fetchMock);
    const params = { query: 'nurse', location: 'Leeds', page: 1, perPage: 5, contractType: 'all' as const };
    const store = new MemoryCacheStore();
    const signal = new AbortController().signal;
    await searchProvider('NHS_JOBS', params, store, signal);
    await searchProvider('NHS_JOBS', params, store, signal);
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '60' } })));
    await expect(nhsJobsAdapter.search({ ...params, page: 2 }, { mode: 'background', signal })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 60 });
  });

  it('merges the same vacancy across NHS Jobs and another provider', () => {
    const nhs = normaliseProviderJob(parseNhsJobsXml(xml, 1).jobs[0]);
    const other = normaliseProviderJob({ ...parseNhsJobsXml(xml, 1).jobs[0], id: 'adzuna-99', source: 'adzuna', url: 'https://adzuna.test/jobs/99', hostedUrl: 'https://adzuna.test/jobs/99' });
    const merged = deduplicateJobs([nhs, other]);
    expect(merged).toHaveLength(1);
    expect(merged[0].providerReferences.map((reference) => reference.provider)).toEqual(expect.arrayContaining(['NHS_JOBS', 'ADZUNA']));
  });
});
