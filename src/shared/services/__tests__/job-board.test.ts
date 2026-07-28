import { describe, expect, it } from 'vitest';
import { extractEligibilityHints, normaliseCompanyName, normaliseLocation, normaliseProviderJob, parseSalary } from '@/shared/services/job-normalisation';
import { areDuplicates, deduplicateJobs } from '@/shared/services/job-search';

describe('job-board normalisation', () => {
  it('keeps careful company and location normalisation', () => {
    expect(normaliseCompanyName('Acme (UK) Limited')).toBe('acme');
    expect(normaliseLocation('Hybrid - Birmingham, West Midlands')).toMatchObject({ city: 'Birmingham', region: 'West Midlands', remoteType: 'HYBRID' });
    expect(normaliseLocation('Coventry/London')).toEqual({ locationText: 'Coventry/London', remoteType: 'UNKNOWN' });
  });

  it('parses only an explicit salary period and preserves the source text', () => {
    expect(parseSalary('£40,000–£50,000 per year', null, null)).toMatchObject({ salaryMin: 40000, salaryMax: 50000, salaryPeriod: 'YEAR', salaryText: '£40,000–£50,000 per year' });
    expect(parseSalary('Competitive', null, null)).toMatchObject({ salaryText: 'Competitive' });
  });

  it('separates sponsor wording from preliminary eligibility language', () => {
    const job = normaliseProviderJob({ id: 'reed-1', source: 'reed', title: 'Engineer', company: 'Acme Ltd', location: 'London', salary: null, salaryMin: null, salaryMax: null, description: 'We cannot offer visa sponsorship. Applicants must already have the right to work and hold SC clearance.', url: 'https://example.com/job', postedDate: '2026-07-28', contractType: null, isRemote: false, hasSponsorship: false });
    expect(job.sponsorSignal.jobWording).toBe('EXPLICITLY_UNAVAILABLE');
    expect(job.eligibilityHints.map((hint) => hint.type)).toEqual(expect.arrayContaining(['NO_SPONSORSHIP', 'RIGHT_TO_WORK', 'SECURITY_CLEARANCE']));
    expect(extractEligibilityHints('Enhanced DBS check required.', 'UNKNOWN')[0]?.type).toBe('DBS');
  });

  it('merges true cross-provider duplicates but leaves distinct vacancies separate', () => {
    const first = normaliseProviderJob({ id: 'adzuna-1', source: 'adzuna', title: 'Software Engineer', company: 'Acme Ltd', location: 'London', salary: '£50,000 per year', salaryMin: 50000, salaryMax: 50000, description: 'A sufficiently complete job description for a software engineer.', url: 'https://example.com/jobs/1', postedDate: '2026-07-28', contractType: 'Permanent', isRemote: false, hasSponsorship: false });
    const duplicate = { ...normaliseProviderJob({ id: 'reed-7', source: 'reed', title: 'Software Engineer', company: 'ACME Limited', location: 'London', salary: null, salaryMin: null, salaryMax: null, description: 'Short description', url: 'https://reed.example/job/7', postedDate: '2026-07-27', contractType: 'Permanent', isRemote: false, hasSponsorship: false }), companyNormalised: first.companyNormalised };
    const distinct = { ...first, sourceJobId: '2', canonicalUrl: 'https://example.com/jobs/2', postedAt: '2026-05-01' };
    expect(areDuplicates(first, duplicate)).toBe(true);
    expect(deduplicateJobs([first, duplicate])).toHaveLength(1);
    expect(areDuplicates(first, distinct)).toBe(false);
  });
});