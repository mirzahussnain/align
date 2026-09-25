import { describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import type { JobSearchParams } from '@/shared/types/job';
import type { SearchJobProviderAdapter } from '@/shared/types/job-provider';

const search = vi.fn<SearchJobProviderAdapter['search']>(
  async () => ({ jobs: [], total: 0, rawReceived: 0 }),
);

const adapter = {
  provider: 'REED',
  label: 'Registry Reed',
  capabilities: {
    kind: 'SEARCH', keywordSearch: true, locationSearch: true, locationRadius: true,
    pagination: 'OFFSET', maxPerPage: 100, salaryFilter: true, contractTypeFilter: true,
    remoteFilter: false, postedWithinFilter: false, sortOptions: [],
    descriptionSemantics: 'PARTIAL', employerDirectUrl: false,
    requiresEmployerIdentifier: false, interactiveTimeoutMs: 1_500, backgroundTimeoutMs: 5_000,
  },
  isConfigured: () => true,
  search,
} satisfies SearchJobProviderAdapter;

vi.mock('@/shared/services/job-providers/registry', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/job-providers/registry')>(
    '@/shared/services/job-providers/registry',
  );
  return {
    ...actual,
    getSearchAdapter: (provider: string) => {
      if (provider !== 'REED') throw new Error(`Unexpected provider ${provider}`);
      return adapter;
    },
  };
});

const { searchProvidersInteractive } = await import('@/shared/services/job-search');

const params: JobSearchParams = {
  query: 'nurse', location: 'Leeds', page: 1, perPage: 15, contractType: 'all',
};

describe('registered provider orchestration', () => {
  it('uses the registered adapter and passes a live abort context', async () => {
    const outcome = await searchProvidersInteractive(params, ['REED'], { store: new MemoryCacheStore() });

    expect(outcome.results[0]?.status).toBe('EMPTY');
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toEqual(params);
    expect(search.mock.calls[0]?.[1]).toMatchObject({ mode: 'background' });
    expect(search.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });
});
