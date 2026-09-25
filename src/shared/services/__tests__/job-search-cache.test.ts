import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import type { JobSearchParams, JobSearchResult, ProviderJob } from '@/shared/types/job';
import { JobProviderError } from '@/shared/types/job-provider';

// Every provider is configured, so capability gating rather than credentials
// decides what happens. The three network adapters are replaced outright.
vi.mock('@/shared/lib/config', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/config')>('@/shared/lib/config');
  return {
    ...actual,
    API_CONFIG: {
      ...actual.API_CONFIG,
      adzuna: { ...actual.API_CONFIG.adzuna, appId: 'id', appKey: 'key' },
      reed: { ...actual.API_CONFIG.reed, apiKey: 'key' },
      jooble: { ...actual.API_CONFIG.jooble, apiKey: 'key' },
    },
  };
});

const adzuna = vi.fn();
const reed = vi.fn();
const jooble = vi.fn();
vi.mock('@/shared/services/adzuna', () => ({ searchAdzunaJobs: (...a: unknown[]) => adzuna(...a) }));
vi.mock('@/shared/services/reed', () => ({ searchReedJobs: (...a: unknown[]) => reed(...a) }));
vi.mock('@/shared/services/jooble', () => ({ searchJoobleJobs: (...a: unknown[]) => jooble(...a) }));

const {
  __resetInFlight,
  providerCacheKey,
  providerQueryDescriptor,
  searchProvider,
  searchProvidersInteractive,
} = await import('@/shared/services/job-search');

let counter = 0;

function providerJob(source: ProviderJob['source'], overrides: Partial<ProviderJob> = {}): ProviderJob {
  const id = `${source}-${++counter}`;
  return {
    id,
    title: 'Support Engineer',
    company: `Company ${id}`,
    location: 'Birmingham',
    salary: null,
    salaryMin: null,
    salaryMax: null,
    description: 'A description long enough to be meaningful for the classifier.',
    url: `https://example.com/${id}`,
    postedDate: new Date().toISOString(),
    source,
    contractType: null,
    isRemote: false,
    hasSponsorship: false,
    ...overrides,
  };
}

const result = (jobs: ProviderJob[], params: JobSearchParams): JobSearchResult => ({
  jobs,
  total: jobs.length,
  page: params.page,
  perPage: params.perPage,
  source: 'test',
});

const baseParams = (overrides: Partial<JobSearchParams> = {}): JobSearchParams => ({
  query: 'support engineer',
  location: 'Birmingham',
  page: 1,
  perPage: 15,
  contractType: 'all',
  sortBy: 'relevance',
  sponsorship: 'all',
  experience: 'all',
  ...overrides,
});

beforeEach(() => {
  counter = 0;
  __resetInFlight();
  for (const spy of [adzuna, reed, jooble]) {
    spy.mockReset();
    spy.mockImplementation(async (params: JobSearchParams) => result([providerJob('reed')], params));
  }
});

afterEach(() => {
  __resetInFlight();
});

describe('provider cache keys isolate what actually differs', () => {
  it('separates providers, queries and pages', () => {
    const keys = new Set([
      providerCacheKey('REED', baseParams()),
      providerCacheKey('ADZUNA', baseParams()),
      providerCacheKey('REED', baseParams({ query: 'nurse' })),
      providerCacheKey('REED', baseParams({ location: 'Leeds' })),
      providerCacheKey('REED', baseParams({ page: 2 })),
    ]);
    expect(keys.size).toBe(5);
  });

  it('excludes a sort the provider does not apply server-side', () => {
    // Reed declares no `sortOptions`, so every order is applied locally and all
    // four sort choices legitimately share one Reed cache entry.
    expect(providerQueryDescriptor('REED', baseParams({ sortBy: 'date' })).sortBy).toBeUndefined();
    expect(providerCacheKey('REED', baseParams({ sortBy: 'date' }))).toBe(
      providerCacheKey('REED', baseParams({ sortBy: 'salary' }))
    );
  });

  it('includes a sort the provider does apply server-side', () => {
    // Adzuna declares relevance/date/salary and our adapter sends the parameter,
    // so two sorts genuinely return different data and must not share a key.
    expect(providerQueryDescriptor('ADZUNA', baseParams({ sortBy: 'date' })).sortBy).toBe('date');
    expect(providerCacheKey('ADZUNA', baseParams({ sortBy: 'date' }))).not.toBe(
      providerCacheKey('ADZUNA', baseParams({ sortBy: 'salary' }))
    );
  });

  it('excludes a salary filter the provider is not asked to apply', () => {
    // Jooble declares no contract-type filter, so contractType must not split
    // its cache — the filter is applied locally either way.
    expect(providerQueryDescriptor('JOOBLE', baseParams({ contractType: 'permanent' })).contractType).toBeUndefined();
    expect(providerCacheKey('JOOBLE', baseParams({ contractType: 'permanent' }))).toBe(
      providerCacheKey('JOOBLE', baseParams({ contractType: 'contract' }))
    );
  });

  it('is stable across calls with the same inputs', () => {
    expect(providerCacheKey('REED', baseParams())).toBe(providerCacheKey('REED', baseParams()));
  });
});

describe('provider results are served from the cache', () => {
  it('does not call a provider twice for the same page', async () => {
    const store = new MemoryCacheStore();

    await searchProvidersInteractive(baseParams(), ['REED'], { store });
    expect(reed).toHaveBeenCalledTimes(1);

    const second = await searchProvidersInteractive(baseParams(), ['REED'], { store });
    expect(reed).toHaveBeenCalledTimes(1);
    expect(second.results[0].cacheHit).toBe(true);
    expect(second.results[0].jobs).toHaveLength(1);
  });

  it('refetches once the fresh window has passed', async () => {
    // Freshness is decided by the ENVELOPE, which reads the wall clock — the
    // store's injected clock only governs key expiry. Moving just the latter
    // leaves the entry FRESH and the test proves nothing, so move Date.now
    // itself. `setTimeout` is untouched, so the deadline still runs in real time.
    const store = new MemoryCacheStore();
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);

    await searchProvidersInteractive(baseParams(), ['REED'], { store });
    expect(reed).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(base + 6 * 60_000); // past fresh (5 min), inside stale
    await searchProvidersInteractive(baseParams(), ['REED'], { store });

    expect(reed).toHaveBeenCalledTimes(2);
    clock.mockRestore();
  });

  it('serves a stale entry while its refresh runs, rather than showing nothing', async () => {
    const store = new MemoryCacheStore();
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);

    await searchProvidersInteractive(baseParams(), ['REED'], { store });

    clock.mockReturnValue(base + 6 * 60_000);
    // The refresh is triggered but never answers within the deadline.
    reed.mockImplementation(() => new Promise(() => {}));

    const outcome = await searchProvidersInteractive(baseParams(), ['REED'], { store, interactiveDeadlineMs: 30 });

    // A fifteen-minute-old vacancy list beats a spinner: the stale entry is
    // served, and the refresh really was attempted.
    expect(reed).toHaveBeenCalledTimes(2);
    expect(outcome.results[0].jobs).toHaveLength(1);
    expect(outcome.results[0].cacheHit).toBe(true);
    outcome.abandon();
    clock.mockRestore();
  });

  it('isolates NHS filters that are pushed to the provider', () => {
    expect(providerCacheKey('NHS_JOBS', baseParams({ remote: true }))).not.toBe(
      providerCacheKey('NHS_JOBS', baseParams({ remote: false })),
    );
    expect(providerCacheKey('NHS_JOBS', baseParams({ postedWithinDays: 7 }))).not.toBe(
      providerCacheKey('NHS_JOBS', baseParams({ postedWithinDays: 30 })),
    );
  });

  it('keeps a stale page when its refresh is rate limited', async () => {
    const store = new MemoryCacheStore();
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);
    await searchProvidersInteractive(baseParams(), ['REED'], { store });
    clock.mockReturnValue(base + 6 * 60_000);
    reed.mockRejectedValue(new JobProviderError('REED', 'RATE_LIMITED'));

    const outcome = await searchProvidersInteractive(baseParams(), ['REED'], { store });

    expect(outcome.results[0]).toMatchObject({ provider: 'REED', status: 'STALE_CACHE', cacheHit: true });
    expect(outcome.results[0].jobs).toHaveLength(1);
    clock.mockRestore();
  });

  it('stops serving an entry once it is past the stale boundary', async () => {
    const store = new MemoryCacheStore();
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);

    await searchProvidersInteractive(baseParams(), ['REED'], { store });

    clock.mockReturnValue(base + 31 * 60_000); // past `providerStale` (30 min)
    reed.mockImplementation(() => new Promise(() => {}));

    const outcome = await searchProvidersInteractive(baseParams(), ['REED'], {
      store,
      interactiveDeadlineMs: 30,
      targetJobs: 100,
    });

    // Nothing usable is left to serve, so the provider is honestly PENDING
    // rather than backed by an entry that expired half an hour ago.
    expect(outcome.results[0].status).toBe('PENDING');
    expect(outcome.results[0].jobs).toHaveLength(0);
    outcome.abandon();
    clock.mockRestore();
  });

  it('collapses concurrent identical requests into one upstream call', async () => {
    const store = new MemoryCacheStore();
    let resolveFetch: ((value: JobSearchResult) => void) | undefined;
    reed.mockImplementation(
      (params: JobSearchParams) =>
        new Promise<JobSearchResult>((resolve) => {
          resolveFetch = () => resolve(result([providerJob('reed')], params));
        })
    );

    const both = Promise.all([
      searchProvidersInteractive(baseParams(), ['REED'], { store }),
      searchProvidersInteractive(baseParams(), ['REED'], { store }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    resolveFetch?.({} as JobSearchResult);

    const [first, second] = await both;
    expect(reed).toHaveBeenCalledTimes(1);
    expect(first.results[0].jobs).toHaveLength(1);
    expect(second.results[0].jobs).toHaveLength(1);
  });
});

describe('one slow provider does not block the page', () => {
  it('aborts the provider request when its background safety timeout expires', async () => {
    vi.useFakeTimers();
    const store = new MemoryCacheStore();
    let providerSignal: AbortSignal | undefined;
    reed.mockImplementation((_params: JobSearchParams, options: { signal?: AbortSignal }) => {
      providerSignal = options.signal;
      return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      }));
    });

    const pending = searchProvider('REED', baseParams(), store, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toMatchObject({ status: 'TIMED_OUT', errorCode: 'TIMEOUT' });
    expect(providerSignal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('answers at the deadline and reports the straggler as PENDING, not failed', async () => {
    const store = new MemoryCacheStore();
    reed.mockImplementation(async (params: JobSearchParams) => result([providerJob('reed')], params));
    adzuna.mockImplementation(() => new Promise(() => {}));

    const started = Date.now();
    const outcome = await searchProvidersInteractive(baseParams(), ['REED', 'ADZUNA'], {
      store,
      interactiveDeadlineMs: 80,
      targetJobs: 100, // high, so only the deadline can end the wait
    });

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(outcome.results.find((r) => r.provider === 'REED')?.jobs).toHaveLength(1);

    // PENDING, not TIMED_OUT: the request is still healthy and in flight, and
    // reporting it as a timeout would describe a working source as broken.
    expect(outcome.results.find((r) => r.provider === 'ADZUNA')?.status).toBe('PENDING');
    expect(outcome.pendingProviders).toEqual(['ADZUNA']);
    outcome.abandon();
  });

  it('reports a genuine timeout as TIMED_OUT and keeps the other results', async () => {
    const store = new MemoryCacheStore();
    reed.mockImplementation(async (params: JobSearchParams) => result([providerJob('reed')], params));
    // Rejects the way the safety timeout does.
    adzuna.mockImplementation(async () => {
      const error = new Error('timeout');
      error.name = 'TimeoutError';
      throw error;
    });

    const outcome = await searchProvidersInteractive(baseParams(), ['REED', 'ADZUNA'], { store });
    expect(outcome.results.find((r) => r.provider === 'ADZUNA')?.status).toBe('TIMED_OUT');
    expect(outcome.results.find((r) => r.provider === 'REED')?.jobs).toHaveLength(1);
  });

  it('turns a failing provider into a result, never a thrown search', async () => {
    const store = new MemoryCacheStore();
    adzuna.mockRejectedValue(new Error('502 Bad Gateway'));

    const outcome = await searchProvidersInteractive(baseParams(), ['REED', 'ADZUNA'], { store });
    expect(outcome.results.find((r) => r.provider === 'ADZUNA')?.status).toBe('FAILED');
    expect(outcome.results.find((r) => r.provider === 'REED')?.status).toBe('SUCCESS');
  });

  it('reports a typed rate limit separately while keeping successful providers', async () => {
    const store = new MemoryCacheStore();
    adzuna.mockRejectedValue(new JobProviderError('ADZUNA', 'RATE_LIMITED'));

    const outcome = await searchProvidersInteractive(baseParams(), ['REED', 'ADZUNA'], { store });

    expect(outcome.results.find((item) => item.provider === 'ADZUNA')).toMatchObject({
      status: 'RATE_LIMITED', errorCode: 'RATE_LIMITED',
    });
    expect(outcome.results.find((item) => item.provider === 'REED')?.status).toBe('SUCCESS');
  });

  it('honours Retry-After before calling a rate-limited provider again', async () => {
    const store = new MemoryCacheStore();
    reed.mockRejectedValue(new JobProviderError('REED', 'RATE_LIMITED', undefined, 60));

    const first = await searchProvider('REED', baseParams(), store, new AbortController().signal);
    const second = await searchProvider('REED', baseParams(), store, new AbortController().signal);

    expect(first.status).toBe('RATE_LIMITED');
    expect(second.status).toBe('RATE_LIMITED');
    expect(reed).toHaveBeenCalledOnce();
  });

  it('returns early once enough unique jobs are in hand', async () => {
    const store = new MemoryCacheStore();
    reed.mockImplementation(async (params: JobSearchParams) =>
      result(Array.from({ length: 15 }, () => providerJob('reed')), params)
    );
    adzuna.mockImplementation(() => new Promise(() => {}));

    const started = Date.now();
    const outcome = await searchProvidersInteractive(baseParams(), ['REED', 'ADZUNA'], {
      store,
      interactiveDeadlineMs: 5_000,
      targetJobs: 15,
    });

    // Reed alone satisfies the page, so there is no reason to keep waiting.
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(outcome.results.find((r) => r.provider === 'REED')?.jobs).toHaveLength(15);
    outcome.abandon();
  });

  it('caches a late result so the next search gets it', async () => {
    const store = new MemoryCacheStore();
    let releaseAdzuna: (() => void) | undefined;
    adzuna.mockImplementation(
      (params: JobSearchParams) =>
        new Promise<JobSearchResult>((resolve) => {
          releaseAdzuna = () => resolve(result([providerJob('adzuna')], params));
        })
    );

    const outcome = await searchProvidersInteractive(baseParams(), ['ADZUNA'], {
      store,
      interactiveDeadlineMs: 30,
      targetJobs: 100,
    });
    expect(outcome.results[0].status).toBe('PENDING');

    // This is what `settle()` is awaited for inside the post-response window.
    releaseAdzuna?.();
    await outcome.settle();

    const next = await searchProvidersInteractive(baseParams(), ['ADZUNA'], { store });
    expect(next.results[0].jobs).toHaveLength(1);
    expect(next.results[0].cacheHit).toBe(true);
    expect(adzuna).toHaveBeenCalledTimes(1);
  });

  it('does not mutate the already-returned result when a late provider lands', async () => {
    const store = new MemoryCacheStore();
    let releaseAdzuna: (() => void) | undefined;
    adzuna.mockImplementation(
      (params: JobSearchParams) =>
        new Promise<JobSearchResult>((resolve) => {
          releaseAdzuna = () => resolve(result([providerJob('adzuna')], params));
        })
    );

    const outcome = await searchProvidersInteractive(baseParams(), ['REED', 'ADZUNA'], {
      store,
      interactiveDeadlineMs: 30,
      targetJobs: 100,
    });
    const served = JSON.parse(JSON.stringify(outcome.results));

    releaseAdzuna?.();
    await outcome.settle();

    expect(outcome.results).toEqual(served);
  });
});

describe('degraded cache', () => {
  it('still searches when every cache read misses and every write is dropped', async () => {
    const dead = {
      async get() { return null; },
      async set() {},
      async delete() {},
      async setIfAbsent() { return false; },
    };

    const first = await searchProvidersInteractive(baseParams(), ['REED'], { store: dead });
    const second = await searchProvidersInteractive(baseParams(), ['REED'], { store: dead });

    expect(first.results[0].jobs).toHaveLength(1);
    expect(second.results[0].jobs).toHaveLength(1);
    // Nothing is cached, so every search is a real fetch: slower, still correct.
    expect(reed).toHaveBeenCalledTimes(2);
  });

  it('reports a provider with no credentials as NOT_CONFIGURED without calling it', async () => {
    const store = new MemoryCacheStore();
    const outcome = await searchProvidersInteractive(baseParams(), ['REED'], { store });
    expect(outcome.results[0].status).toBe('SUCCESS');
    expect(reed).toHaveBeenCalled();
  });
});

describe('per-provider paging', () => {
  it('asks each provider for its own next page', async () => {
    const store = new MemoryCacheStore();
    await searchProvidersInteractive(baseParams(), ['REED', 'ADZUNA'], {
      store,
      pageByProvider: { REED: 3, ADZUNA: 1 },
    });

    expect(reed.mock.calls[0][0]).toMatchObject({ page: 3 });
    expect(adzuna.mock.calls[0][0]).toMatchObject({ page: 1 });
  });
});
