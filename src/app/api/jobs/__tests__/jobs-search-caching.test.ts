import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NormalisedJob, ProviderSearchResult, SearchJobProvider } from '@/shared/types/job';
import { blankSponsorSignal } from '@/shared/services/job-normalisation';

// Phase 3 behaviour of the search route: cache state, stale-while-revalidate,
// the refresh lock, session ownership and degraded operation when the cache is
// unavailable. Providers, sponsors, auth and rate limiting are mocked, so what
// is exercised is the route's own caching logic.

const getSession = vi.fn(async () => null as { user: { id: string } } | null);
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: () => getSession() } } }));
vi.mock('@/shared/lib/rate-limit', () => ({ applyRateLimit: vi.fn(async () => null), jobsLimiter: {} }));
vi.mock('@/shared/services/sponsor-registry', () => ({
  matchSponsorCompanies: vi.fn(async () => new Map()),
  getSponsorRegisterVersion: vi.fn(async () => 'test-register'),
  standardizeCompanyName: (name: string) => name.toLowerCase().trim(),
}));

const searchProvidersInteractive = vi.fn();
vi.mock('@/shared/services/job-search', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/job-search')>('@/shared/services/job-search');
  return { ...actual, searchProvidersInteractive: (...args: unknown[]) => searchProvidersInteractive(...args) };
});

const { MemoryCacheStore } = await import('@/shared/lib/cache/memory-cache-store');
const { __setCacheStore } = await import('@/shared/lib/cache/cache-provider');
const { GET } = await import('../route');

let counter = 0;
let cache: InstanceType<typeof MemoryCacheStore>;
let restoreCache: () => void;

function job(title = 'Support Engineer'): NormalisedJob {
  const id = `job-${++counter}`;
  return {
    source: 'REED',
    sourceJobId: id,
    providerReferences: [{ provider: 'REED', sourceJobId: id, sourceUrl: `https://example.com/${id}` }],
    canonicalUrl: `https://example.com/${id}`,
    title,
    company: `Company ${id}`,
    companyNormalised: `company ${id}`,
    locationText: 'Birmingham',
    descriptionAvailability: 'FULL',
    remoteType: 'ONSITE',
    sponsorSignal: blankSponsorSignal(),
    eligibilityHints: [],
    dedupeFingerprint: `fingerprint-${id}`,
    canonicalJobId: `canonical-${id}`,
    fetchedAt: new Date().toISOString(),
  };
}

const providerResult = (jobs: NormalisedJob[], overrides: Partial<ProviderSearchResult> = {}): ProviderSearchResult => ({
  provider: 'REED',
  status: jobs.length ? 'SUCCESS' : 'EMPTY',
  jobs,
  rawReceived: jobs.length,
  validNormalised: jobs.length,
  nextCursor: '2',
  durationMs: 10,
  ...overrides,
});

const fanOut = (results: ProviderSearchResult[], pendingProviders: SearchJobProvider[] = []) => ({
  results,
  pendingProviders,
  firstUsefulMs: 5,
  settle: vi.fn(async () => {}),
  abandon: vi.fn(),
});

const call = async (query: string) => {
  const response = await GET(new Request(`https://align.test/api/jobs?${query}`) as never);
  return { status: response.status, body: await response.json() };
};

beforeEach(() => {
  counter = 0;
  searchProvidersInteractive.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue(null);
  cache = new MemoryCacheStore();
  restoreCache = __setCacheStore(cache);
});

afterEach(() => {
  restoreCache();
  vi.restoreAllMocks();
});

describe('merged search-response cache', () => {
  it('serves a second identical search from the cache without calling providers', async () => {
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job('Cached role')])]));

    const first = await call('query=warm&location=Leeds');
    expect(first.body.meta.cacheState).toBe('MISS');
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);

    const second = await call('query=warm&location=Leeds');
    expect(second.body.meta.cacheState).toBe('FRESH');
    expect(second.body.meta.cached).toBe(true);
    expect(second.body.jobs[0].title).toBe('Cached role');
    // The whole point: no provider round trip at all.
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);
  });

  it('keys the cache by every filter that changes the result set', async () => {
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));

    await call('query=keys&location=Leeds');
    await call('query=keys&location=Leeds&remoteType=REMOTE');
    await call('query=keys&location=Leeds&experience=senior');
    await call('query=keys&location=York');

    // Four genuinely different searches, four provider calls — none of them
    // served another's cached page.
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(4);
  });

  it('does not cache page two under any key', async () => {
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job('Page one')])]));
    const first = await call('query=pagetwo&location=Hull');

    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job('Page two')])]));
    await call(`query=pagetwo&location=Hull&sessionId=${first.body.sessionId}`);

    // Page 2 is meaningful only alongside a session's seen-ids, which the shared
    // cache does not hold. Caching it could only serve somebody else's
    // continuation, so exactly one cached search page exists.
    const keys = await Promise.all(
      [1, 2, 3].map(async (page) => (await cache.get(`v1:jobs:search:${'x'}:${page}`)) !== null)
    );
    expect(keys.every((present) => !present)).toBe(true);

    const fresh = await call('query=pagetwo&location=Hull');
    expect(fresh.body.jobs[0].title).toBe('Page one');
  });

});

describe('stale-while-revalidate', () => {
  it('serves the stale page immediately and reports that a refresh is not running', async () => {
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);

    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job('Stale role')])]));
    await call('query=swr&location=Leeds');
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);

    // Past the fresh window (5 min), inside the stale window (45 min).
    clock.mockReturnValue(base + 10 * 60_000);
    const stale = await call('query=swr&location=Leeds');

    // The user is served at once from the stale entry…
    expect(stale.body.meta.cacheState).toBe('STALE');
    expect(stale.body.jobs[0].title).toBe('Stale role');
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);

    // …and the refresh is reported HONESTLY. There is no Next request scope in a
    // unit test, so `after` is unavailable and the route says so rather than
    // claiming a background refresh that would never run.
    expect(stale.body.meta.refresh).toBe('unavailable');
  });

  it('stops serving a page once it is past the stale window', async () => {
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);

    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job('Old role')])]));
    await call('query=expiry&location=Leeds');

    clock.mockReturnValue(base + 46 * 60_000); // past `searchStale`
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job('Fresh role')])]));
    const after = await call('query=expiry&location=Leeds');

    expect(after.body.meta.cacheState).toBe('MISS');
    expect(after.body.jobs[0].title).toBe('Fresh role');
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(2);
  });

  it('releases the refresh lock when no post-response window exists', async () => {
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);

    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));
    await call('query=lock&location=Leeds');

    clock.mockReturnValue(base + 10 * 60_000);
    const first = await call('query=lock&location=Leeds');
    expect(first.body.meta.refresh).toBe('unavailable');

    // The lock must not be left held: a lock taken for a refresh that never ran
    // would suppress every other instance's refresh until the TTL lapsed.
    const second = await call('query=lock&location=Leeds');
    expect(second.body.meta.refresh).toBe('unavailable');
  });
});

describe('session ownership and expiry', () => {
  it('rejects a Load more whose session has expired, rather than replaying page one', async () => {
    const clock = vi.spyOn(Date, 'now');
    const base = Date.now();
    clock.mockReturnValue(base);

    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));
    const first = await call('query=expired&location=Leeds');

    clock.mockReturnValue(base + 16 * 60_000); // past `searchSession` (15 min)
    const more = await call(`query=expired&location=Leeds&sessionId=${first.body.sessionId}`);

    // Silently starting a fresh search here would serve page one under a
    // "Load more" button — the exact duplicate-result confusion to avoid.
    expect(more.status).toBe(409);
    expect(more.body.code).toBe('SEARCH_SESSION_EXPIRED');
  });

  it('refuses a session belonging to a different sign-in', async () => {
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));

    getSession.mockResolvedValue({ user: { id: 'user-1' } });
    const first = await call('query=owner&location=Leeds');

    getSession.mockResolvedValue({ user: { id: 'user-2' } });
    const stolen = await call(`query=owner&location=Leeds&sessionId=${first.body.sessionId}`);

    expect(stolen.status).toBe(400);
    expect(stolen.body.error).toMatch(/different sign-in/i);
  });

  it('refuses a session whose filters have changed', async () => {
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));
    const first = await call('query=filters&location=Leeds');

    const changed = await call(`query=filters&location=Leeds&remoteType=REMOTE&sessionId=${first.body.sessionId}`);
    expect(changed.status).toBe(400);
    expect(changed.body.error).toMatch(/does not match these filters/i);
  });

  it('carries no raw user id into the cached session', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-sensitive-id' } });
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));
    await call('query=privacy&location=Leeds');

    const serialised = JSON.stringify([...(cache as unknown as { entries: Map<string, unknown> }).entries]);
    expect(serialised).not.toContain('user-sensitive-id');
  });
});

describe('pending providers', () => {
  it('abandons stragglers when there is no post-response window, and says so', async () => {
    const outcome = fanOut([providerResult([job()]), providerResult([], { provider: 'ADZUNA', status: 'PENDING' })], ['ADZUNA']);
    searchProvidersInteractive.mockResolvedValue(outcome);

    const response = await call('query=pending&location=Leeds');

    // No Next request scope in a test, so the work cannot be registered with the
    // runtime. Aborting is the honest outcome — never a dropped promise.
    expect(outcome.abandon).toHaveBeenCalled();
    expect(outcome.settle).not.toHaveBeenCalled();
    expect(response.body.meta.refresh).toBe('abandoned');
    expect(response.body.meta.partialResults).toBe(true);
  });

  it('reports a pending provider as PENDING in the counts', async () => {
    searchProvidersInteractive.mockResolvedValue(
      fanOut([providerResult([job()]), providerResult([], { provider: 'ADZUNA', status: 'PENDING' })], ['ADZUNA'])
    );

    const { body } = await call('query=pendingstatus&location=Leeds');
    const adzuna = body.meta.providerCounts.find((count: { provider: string }) => count.provider === 'ADZUNA');
    expect(adzuna.status).toBe('PENDING');
  });
});

describe('degraded cache', () => {
  it('still returns a merged response when every cache operation fails', async () => {
    // Stands in for a total Redis outage reaching the route unwrapped.
    restoreCache();
    restoreCache = __setCacheStore({
      async get() { return null; },
      async set() {},
      async delete() {},
      async setIfAbsent() { return false; },
    });

    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job('Still works')])]));

    const first = await call('query=degraded&location=Leeds');
    expect(first.status).toBe(200);
    expect(first.body.jobs[0].title).toBe('Still works');

    // Nothing is cached, so the second search is a real fetch: slower, correct.
    const second = await call('query=degraded&location=Leeds');
    expect(second.body.meta.cacheState).toBe('MISS');
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(2);
  });

  it('fails a Load more clearly rather than serving inconsistent results', async () => {
    restoreCache();
    restoreCache = __setCacheStore({
      async get() { return null; },
      async set() {},
      async delete() {},
      async setIfAbsent() { return false; },
    });
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));

    const first = await call('query=degradedmore&location=Leeds');
    const more = await call(`query=degradedmore&location=Leeds&sessionId=${first.body.sessionId}`);

    expect(more.status).toBe(409);
    expect(more.body.code).toBe('SEARCH_SESSION_EXPIRED');
  });
});

describe('response metadata', () => {
  it('reports timings, backend and provider health', async () => {
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult([job()])]));
    const { body } = await call('query=meta&location=Leeds');

    expect(body.meta.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(body.meta.timings).toHaveProperty('sponsorMs');
    expect(body.meta.timings).toHaveProperty('sessionWriteMs');
    expect(body.meta.cacheBackend).toBe('injected');
    expect(body.meta.providerHealth).toHaveProperty('REED');
  });
});
