import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NormalisedJob, ProviderSearchResult, SearchJobProvider } from '@/shared/types/job';
import { blankSponsorSignal } from '@/shared/services/job-normalisation';

// Drives the search route's own bookkeeping — provider counting, response
// caching and session paging. Providers, the sponsor register, auth and rate
// limiting are all mocked, so what is exercised here is the route's arithmetic
// rather than any upstream integration.
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
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

/**
 * Phase 3 replaced the route's module-level Maps with an injected CacheStore.
 * A fresh MemoryCacheStore per test gives each case a genuinely cold cache, so
 * cases no longer have to use a distinct query string to avoid inheriting the
 * previous test's cached page — and the caching behaviour itself is now
 * directly assertable rather than something to work around.
 */
let cache: InstanceType<typeof MemoryCacheStore>;
let restoreCache: () => void;

let counter = 0;

/** A minimal normalised vacancy. `remoteType` and title drive the route's filters. */
function job(overrides: Partial<NormalisedJob> & { provider: SearchJobProvider }): NormalisedJob {
  const { provider, ...rest } = overrides;
  const id = `job-${++counter}`;
  return {
    source: provider,
    sourceJobId: id,
    providerReferences: [{ provider, sourceJobId: id, sourceUrl: `https://example.com/${id}` }],
    canonicalUrl: `https://example.com/${id}`,
    title: 'Support Engineer',
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
    ...rest,
  };
}

function providerResult(provider: SearchJobProvider, jobs: NormalisedJob[]): ProviderSearchResult {
  // `nextCursor` present means "there is probably another page", which keeps the
  // provider out of the session's exhausted list so Load more still asks it.
  return { provider, status: jobs.length ? 'SUCCESS' : 'EMPTY', jobs, rawReceived: jobs.length, validNormalised: jobs.length, nextCursor: '2', durationMs: 10 };
}

/** The shape the route now consumes: results plus explicit lifecycle handles. */
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
  cache = new MemoryCacheStore();
  restoreCache = __setCacheStore(cache);
});

afterEach(() => {
  restoreCache();
});

describe('provider counts describe the jobs actually shown', () => {
  it('excludes results that filtering removed from the rendered list', async () => {
    // Reed returns three vacancies, only one of which survives the remote filter.
    // Adzuna returns one, which does. Counting before filtering credited Reed
    // with all three, so the chips totalled more jobs than the list held.
    searchProvidersInteractive.mockResolvedValue(fanOut([
      providerResult('REED', [
        job({ provider: 'REED', remoteType: 'REMOTE' }),
        job({ provider: 'REED', remoteType: 'ONSITE' }),
        job({ provider: 'REED', remoteType: 'ONSITE' }),
      ]),
      providerResult('ADZUNA', [job({ provider: 'ADZUNA', remoteType: 'REMOTE' })]),
    ]));

    const { body } = await call('query=countcheck&remoteType=REMOTE');
    const counts = body.meta.providerCounts as { provider: string; uniqueContributed: number; rawReceived: number }[];
    const reed = counts.find((count) => count.provider === 'REED')!;

    expect(body.jobs).toHaveLength(2);
    expect(reed.uniqueContributed).toBe(1);
    // rawReceived stays a fact about the fetch, deliberately a different figure
    // from what survived filtering — the two must not be conflated.
    expect(reed.rawReceived).toBe(3);
    const contributed = counts.reduce((total, count) => total + count.uniqueContributed, 0);
    expect(contributed).toBeLessThanOrEqual(body.jobs.length);
  });

  it('credits no contribution to a provider whose results were all filtered out', async () => {
    searchProvidersInteractive.mockResolvedValue(fanOut([
      providerResult('REED', [job({ provider: 'REED', remoteType: 'ONSITE' })]),
      providerResult('ADZUNA', [job({ provider: 'ADZUNA', remoteType: 'REMOTE' })]),
    ]));

    const { body } = await call('query=zerocheck&remoteType=REMOTE');
    const counts = body.meta.providerCounts as { provider: string; uniqueContributed: number }[];
    expect(counts.find((count) => count.provider === 'REED')!.uniqueContributed).toBe(0);
  });
});

describe('response cache is keyed by the page and the order it holds', () => {
  it('does not let Load more overwrite the first page', async () => {
    const pageOne = [job({ provider: 'REED', title: 'First page role' })];
    const pageTwo = [job({ provider: 'REED', title: 'Second page role' })];
    searchProvidersInteractive.mockResolvedValueOnce(fanOut([providerResult('REED', pageOne)]));

    const first = await call('query=cachecheck&location=Leeds');
    expect(first.body.jobs[0].title).toBe('First page role');

    // Load more, in the same session. This previously wrote page two's slice
    // under the bare query hash, replacing the cached first page.
    searchProvidersInteractive.mockResolvedValueOnce(fanOut([providerResult('REED', pageTwo)]));
    const more = await call(`query=cachecheck&location=Leeds&sessionId=${first.body.sessionId}`);
    expect(more.body.jobs[0].title).toBe('Second page role');

    // A fresh search for the same query must still start at page one. If the
    // cache were poisoned it would serve "Second page role" here.
    const fresh = await call('query=cachecheck&location=Leeds');
    expect(fresh.body.meta.cached).toBe(true);
    expect(fresh.body.jobs[0].title).toBe('First page role');
  });

  it('does not serve a descending page to an ascending request', async () => {
    // Both salary directions map onto one provider request, so they share a
    // query hash — but the cached payload is stored already sorted.
    const jobs = [
      job({ provider: 'REED', title: 'Lower paid', salaryMin: 20000, salaryMax: 20000, salaryPeriod: 'YEAR' }),
      job({ provider: 'REED', title: 'Higher paid', salaryMin: 90000, salaryMax: 90000, salaryPeriod: 'YEAR' }),
    ];
    searchProvidersInteractive.mockResolvedValue(fanOut([providerResult('REED', jobs)]));

    const descending = await call('query=sortcheck&location=Hull&sortBy=salary_desc');
    expect(descending.body.jobs[0].title).toBe('Higher paid');

    const ascending = await call('query=sortcheck&location=Hull&sortBy=salary_asc');
    expect(ascending.body.jobs[0].title).toBe('Lower paid');
  });
});

describe('load more', () => {
  it('does not repeat jobs the session has already shown', async () => {
    const shared = job({ provider: 'REED', title: 'Already seen' });
    searchProvidersInteractive.mockResolvedValueOnce(fanOut([providerResult('REED', [shared])]));
    const first = await call('query=repeatcheck&location=Derby');
    expect(first.body.jobs).toHaveLength(1);

    // The provider hands back the same vacancy on page two, as aggregators do.
    searchProvidersInteractive.mockResolvedValueOnce(fanOut([providerResult('REED', [shared, job({ provider: 'REED', title: 'Genuinely new' })])]));
    const more = await call(`query=repeatcheck&location=Derby&sessionId=${first.body.sessionId}`);

    expect(more.body.jobs.map((entry: NormalisedJob) => entry.title)).toEqual(['Genuinely new']);
  });
});
