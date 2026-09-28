import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  jobSnapshot: { findMany: vi.fn() },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

import {
  filterAtsJobsForSearch,
  getAtsSnapshotProviderResults,
  mergeCanonicalJobs,
} from '@/shared/services/job-discovery';
import { normaliseProviderJob } from '@/shared/services/job-normalisation';

const job = (source: 'adzuna' | 'greenhouse', id: string, description: string, url: string) => normaliseProviderJob({
  id: `${source}-${id}`, source, identityStability: 'STABLE', title: 'Software Engineer', company: 'Acme Ltd', location: 'London',
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

beforeEach(() => {
  vi.resetAllMocks();
  prisma.jobSnapshot.findMany.mockResolvedValue([]);
});

describe('ATS search eligibility', () => {
  const direct = () => ({
    ...job(
      'greenhouse',
      'search',
      'Operate Kubernetes clusters and improve service reliability.',
      'https://boards.greenhouse.io/acme/jobs/search',
    ),
    title: 'Platform Engineer',
    company: 'Acme Payments',
    locationText: 'London, United Kingdom',
    city: 'London',
    region: 'Greater London',
    country: 'United Kingdom',
    departments: ['Infrastructure'],
    offices: ['London HQ'],
  });

  it.each([
    ['title', 'senior platform architect'],
    ['employer', 'payments analyst'],
    ['department', 'infrastructure manager'],
    ['office', 'hq coordinator'],
    ['description', 'kubernetes developer'],
  ])('admits a multi-word query when a meaningful %s token overlaps', (_field, query) => {
    expect(filterAtsJobsForSearch([direct()], { query, location: '' })).toHaveLength(1);
  });

  it('excludes a query with no meaningful overlap', () => {
    expect(filterAtsJobsForSearch([direct()], {
      query: 'paediatric nurse',
      location: '',
    })).toEqual([]);
  });

  it('matches normalized location evidence and admits explicit remote work', () => {
    expect(filterAtsJobsForSearch([direct()], {
      query: 'platform',
      location: 'greater london',
    })).toHaveLength(1);
    expect(filterAtsJobsForSearch([{ ...direct(), remoteType: 'REMOTE' }], {
      query: 'platform',
      location: 'Edinburgh',
    })).toHaveLength(1);
    expect(filterAtsJobsForSearch([direct()], {
      query: 'platform',
      location: 'Edinburgh',
    })).toEqual([]);
  });

  it('queries only active, enabled, verified ATS rows at the inclusive seven-day boundary', async () => {
    const now = new Date('2026-09-27T12:00:00.000Z');

    await getAtsSnapshotProviderResults(now);

    expect(prisma.jobSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'ACTIVE',
        lastSeenAt: { gte: new Date('2026-09-20T12:00:00.000Z') },
        employerSource: {
          is: expect.objectContaining({
            enabled: true,
            verificationStatus: 'VERIFIED',
            provider: { in: ['GREENHOUSE', 'LEVER', 'ASHBY'] },
          }),
        },
      }),
      select: expect.objectContaining({ providerDescription: true }),
    }));
  });
});
