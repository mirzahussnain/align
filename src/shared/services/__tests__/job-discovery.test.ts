import { describe, expect, it } from 'vitest';
import { mergeCanonicalJobs } from '@/shared/services/job-discovery';
import { normaliseProviderJob } from '@/shared/services/job-normalisation';

const job = (source: 'adzuna' | 'greenhouse', id: string, description: string, url: string) => normaliseProviderJob({
  id: `${source}-${id}`, source, title: 'Software Engineer', company: 'Acme Ltd', location: 'London',
  salary: source === 'adzuna' ? '?70,000 per year' : null, salaryMin: source === 'adzuna' ? 70000 : null,
  salaryMax: source === 'adzuna' ? 70000 : null, description, url, hostedUrl: source === 'greenhouse' ? url : undefined,
  applicationUrl: source === 'greenhouse' ? 'https://acme.example/apply/1' : undefined, postedDate: '2026-07-28',
  contractType: 'Permanent', isRemote: false, hasSponsorship: false,
});

describe('canonical discovery merge', () => {
  it('prefers employer-direct description and application URL while retaining populated salary', () => {
    const aggregator = job('adzuna', '1', 'Build reliable platform services with TypeScript and PostgreSQL.', 'https://adzuna.example/1');
    const direct = job('greenhouse', '1', 'Build reliable platform services with TypeScript and PostgreSQL. You will own production quality.', 'https://boards.greenhouse.io/acme/jobs/1');
    const merged = mergeCanonicalJobs([aggregator, direct]);
    expect(merged).toHaveLength(1);
    expect(merged[0].description).toContain('production quality');
    expect(merged[0].canonicalUrl).toBe('https://acme.example/apply/1');
    expect(merged[0].salaryMin).toBe(70000);
    expect(merged[0].providerReferences).toHaveLength(2);
  });

  it('does not merge two distinct employer requisitions with the same title and location', () => {
    const first = job('greenhouse', '1', 'Build reliable platform services with TypeScript and PostgreSQL.', 'https://boards.greenhouse.io/acme/jobs/1');
    const second = job('greenhouse', '2', 'Build reliable platform services with TypeScript and PostgreSQL.', 'https://boards.greenhouse.io/acme/jobs/2');
    expect(mergeCanonicalJobs([first, second])).toHaveLength(2);
  });
});
