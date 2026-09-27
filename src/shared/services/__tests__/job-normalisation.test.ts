import { describe, expect, it } from 'vitest';

import { normaliseProviderJob } from '@/shared/services/job-normalisation';
import type { ProviderJob } from '@/shared/types/job';

const providerJob = (identityStability: 'STABLE' | 'SESSION_ONLY'): ProviderJob => ({
  id: 'jooble-123',
  title: 'Platform Engineer',
  company: 'Acme',
  location: 'London, UK',
  salary: null,
  salaryMin: null,
  salaryMax: null,
  description: 'Build reliable systems.',
  url: 'https://example.test/jobs/123',
  postedDate: '2026-09-27',
  source: 'jooble',
  contractType: null,
  isRemote: false,
  hasSponsorship: false,
  identityStability,
});

describe('normaliseProviderJob identity', () => {
  it.each(['STABLE', 'SESSION_ONLY'] as const)(
    'preserves an explicitly classified %s provider reference',
    (identityStability) => {
      const job = normaliseProviderJob(providerJob(identityStability));

      expect(job.providerReferences).toEqual([
        expect.objectContaining({
          provider: 'JOOBLE',
          sourceJobId: '123',
          identityStability,
        }),
      ]);
    },
  );
});
