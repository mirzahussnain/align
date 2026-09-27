import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/config', () => ({
  API_CONFIG: {
    adzuna: { appId: 'app', appKey: 'key', baseUrl: 'https://api.adzuna.test/jobs' },
    reed: { apiKey: 'key', baseUrl: 'https://api.reed.test/jobs' },
    jooble: { apiKey: 'key', baseUrl: 'https://api.jooble.test/jobs' },
  },
}));

import { searchAdzunaJobs } from '@/shared/services/adzuna';
import { searchJoobleJobs } from '@/shared/services/jooble';
import { searchReedJobs } from '@/shared/services/reed';
import { parseNhsJobsXml } from '@/shared/services/job-providers/nhs-jobs-adapter';

const params = { query: 'engineer', location: 'London', page: 1, perPage: 10 };

afterEach(() => vi.unstubAllGlobals());

describe('provider identity stability', () => {
  it('classifies Adzuna and Reed provider IDs as stable', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 1, mean: 0, results: [{
        id: 'adzuna-1', title: 'Engineer', company: { display_name: 'Acme' },
        location: { display_name: 'London', area: [] }, salary_min: 0, salary_max: 0,
        description: 'Build systems', redirect_url: 'https://adzuna.test/jobs/1',
        created: '2026-09-27', category: { tag: 'it-jobs', label: 'IT' },
      }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalResults: 1, results: [{
        jobId: 2, employerName: 'Acme', employerId: 1, jobTitle: 'Engineer',
        locationName: 'London', minimumSalary: null, maximumSalary: null, currency: 'GBP',
        expirationDate: '', date: '2026-09-27', jobDescription: 'Build systems', applications: 0,
        jobUrl: 'https://reed.test/jobs/2', isPermanent: true, isContract: false, isTemporary: false,
      }] }), { status: 200 })));

    const adzuna = await searchAdzunaJobs(params);
    const reed = await searchReedJobs(params);

    expect(adzuna.jobs[0].identityStability).toBe('STABLE');
    expect(reed.jobs[0].identityStability).toBe('STABLE');
  });

  it('classifies a Jooble provider ID as stable and its array-index fallback as session-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      totalCount: 2,
      jobs: [
        { id: 'stable-3', title: 'Engineer', company: 'Acme', location: 'London', snippet: 'Build', salary: '', source: 'Acme', type: '', link: 'https://jooble.test/3', updated: '2026-09-27' },
        { id: '', title: 'Analyst', company: 'Acme', location: 'London', snippet: 'Analyse', salary: '', source: 'Acme', type: '', link: 'https://jooble.test/fallback', updated: '2026-09-27' },
      ],
    }), { status: 200 })));

    const result = await searchJoobleJobs(params);

    expect(result.jobs).toMatchObject([
      { id: 'jooble-stable-3', identityStability: 'STABLE' },
      { id: 'jooble-1', identityStability: 'SESSION_ONLY' },
    ]);
  });

  it('classifies NHS Jobs provider IDs as stable', () => {
    const result = parseNhsJobsXml(`<?xml version='1.0'?><nhsSearch><totalPages>1</totalPages><totalResults>1</totalResults><vacancyDetails><id>C1234</id><title>Nurse</title><employer>Trust</employer><location><location>Leeds</location></location><description>Care</description><postDate>2026-09-27</postDate><url>https://www.jobs.nhs.uk/candidate/jobadvert/C1234</url></vacancyDetails></nhsSearch>`);

    expect(result.jobs[0].identityStability).toBe('STABLE');
  });
});
