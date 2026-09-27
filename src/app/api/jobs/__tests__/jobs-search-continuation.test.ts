import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  NormalisedJob,
  ProviderSearchResult,
  SearchJobProvider,
} from "@/shared/types/job";
import { blankSponsorSignal } from "@/shared/services/job-normalisation";

/**
 * Continuation performance and correctness.
 *
 * THE DEFECT THIS COVERS. A search session used to hold only provider cursors
 * and the ids already shown, so "Load more" re-ran the ENTIRE pipeline — every
 * provider fan-out, the whole employer-ATS catalogue query, dedupe over the lot,
 * sponsor matching, filtering and sorting — and then discarded the first page's
 * worth to return the next slice. Page two therefore cost strictly MORE than
 * page one.
 *
 * One search pass now buffers several pages of ordered results. A continuation
 * inside that buffer contacts no provider at all.
 */

const getSession = vi.fn(async () => null as { user: { id: string } } | null);
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: () => getSession() } },
}));
vi.mock("@/shared/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  jobsLimiter: {},
}));
vi.mock("@/shared/services/sponsor-registry", () => ({
  matchSponsorCompanies: vi.fn(async () => new Map()),
  getSponsorRegisterVersion: vi.fn(async () => "test-register"),
  standardizeCompanyName: (name: string) => name.toLowerCase().trim(),
}));
const materialiseSearchJobCards = vi.fn(async (jobs: NormalisedJob[]) =>
  jobs.map((item) => ({ ...item, id: `snapshot-${item.canonicalJobId}` })),
);
const projectPublicSearchJobCards = vi.fn((jobs: readonly NormalisedJob[]) =>
  jobs.map((item) => ({ ...item, id: item.canonicalJobId })),
);
vi.mock("@/shared/services/job-search-view", () => ({
  materialiseSearchJobCards: (jobs: NormalisedJob[]) => materialiseSearchJobCards(jobs),
  projectPublicSearchJobCards: (jobs: readonly NormalisedJob[]) => projectPublicSearchJobCards(jobs),
}));

const atsSnapshots = vi.fn(async () => [] as unknown[]);
vi.mock("@/shared/services/job-discovery", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/services/job-discovery")
  >("@/shared/services/job-discovery");
  return { ...actual, getAtsSnapshotProviderResults: () => atsSnapshots() };
});

const searchProvidersInteractive = vi.fn();
vi.mock("@/shared/services/job-search", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/services/job-search")
  >("@/shared/services/job-search");
  return {
    ...actual,
    searchProvidersInteractive: (...args: unknown[]) =>
      searchProvidersInteractive(...args),
  };
});

const { MemoryCacheStore } = await import(
  "@/shared/lib/cache/memory-cache-store"
);
const { __setCacheStore } = await import("@/shared/lib/cache/cache-provider");
const { GET } = await import("../route");

let counter = 0;
let cache: InstanceType<typeof MemoryCacheStore>;
let restoreCache: () => void;

function job(title: string): NormalisedJob {
  const id = `job-${++counter}`;
  return {
    source: "REED",
    sourceJobId: id,
    providerReferences: [
      {
        provider: "REED",
        sourceJobId: id,
        sourceUrl: `https://example.com/${id}`,
      },
    ],
    canonicalUrl: `https://example.com/${id}`,
    title,
    company: `Company ${id}`,
    companyNormalised: `company ${id}`,
    // A confirmed-UK location, so the geography gate is not what is under test.
    locationText: "Leeds, United Kingdom",
    descriptionAvailability: "PARTIAL",
    remoteType: "ONSITE",
    sponsorSignal: blankSponsorSignal(),
    eligibilityHints: [],
    dedupeFingerprint: `fingerprint-${id}`,
    canonicalJobId: `canonical-${id}`,
    fetchedAt: new Date().toISOString(),
  };
}

const providerResult = (
  jobs: NormalisedJob[],
  overrides: Partial<ProviderSearchResult> = {},
): ProviderSearchResult => ({
  provider: "REED",
  status: jobs.length ? "SUCCESS" : "EMPTY",
  jobs,
  rawReceived: jobs.length,
  validNormalised: jobs.length,
  nextCursor: "2",
  durationMs: 10,
  ...overrides,
});

const fanOut = (
  results: ProviderSearchResult[],
  pendingProviders: SearchJobProvider[] = [],
) => ({
  results,
  pendingProviders,
  firstUsefulMs: 5,
  settle: vi.fn(async () => {}),
  abandon: vi.fn(),
});

/**
 * A fan-out in which EVERY selected provider has answered and reported no
 * further page.
 *
 * `hasMore` is false only when no provider remains unexhausted, so a fixture
 * that returns a single provider's result leaves the other two unaccounted for
 * and legitimately keeps `hasMore` true. That is the correct product rule — a
 * source that has said nothing must not be dropped from later pages — so
 * exhaustion has to be stated for all three.
 */
const exhaustedFanOut = (jobs: NormalisedJob[]) =>
  fanOut([
    providerResult(jobs, { provider: "REED", nextCursor: undefined }),
    providerResult([], { provider: "ADZUNA", nextCursor: undefined }),
    providerResult([], { provider: "JOOBLE", nextCursor: undefined }),
    providerResult([], { provider: "NHS_JOBS", nextCursor: undefined }),
  ]);

const call = async (query: string) => {
  const response = await GET(
    new Request(`https://align.test/api/jobs?${query}`) as never,
  );
  return { status: response.status, body: await response.json() };
};

beforeEach(() => {
  counter = 0;
  searchProvidersInteractive.mockReset();
  atsSnapshots.mockReset();
  atsSnapshots.mockResolvedValue([]);
  getSession.mockReset();
  getSession.mockResolvedValue(null);
  materialiseSearchJobCards.mockClear();
  projectPublicSearchJobCards.mockClear();
  cache = new MemoryCacheStore();
  restoreCache = __setCacheStore(cache);
});

afterEach(() => {
  restoreCache();
  vi.restoreAllMocks();
});

describe("page two is served from the session buffer", () => {
  it("answers a continuation without calling any provider again", async () => {
    // One pass yields five jobs. With perPage=2 the buffer holds four, so page
    // two is entirely inside it.
    searchProvidersInteractive.mockResolvedValue(
      fanOut([
        providerResult([
          job("One"),
          job("Two"),
          job("Three"),
          job("Four"),
          job("Five"),
        ]),
      ]),
    );

    const first = await call("query=buffer&location=Leeds&perPage=2");
    expect(first.body.jobs).toHaveLength(2);
    expect(first.body.meta.hasMore).toBe(true);
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);

    const second = await call(
      `query=buffer&location=Leeds&perPage=2&sessionId=${first.body.sessionId}`,
    );

    expect(second.body.jobs).toHaveLength(2);
    expect(second.body.meta.currentPage).toBe(2);
    // THE ASSERTION THAT MATTERS. Still one provider call in total: the
    // continuation did not re-run the search.
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);
    // And no employer-ATS catalogue query either.
    expect(atsSnapshots).toHaveBeenCalledTimes(1);
    expect(materialiseSearchJobCards).not.toHaveBeenCalled();
    expect(projectPublicSearchJobCards).toHaveBeenCalledTimes(2);
  });

  it("returns no duplicate jobs across the two pages", async () => {
    searchProvidersInteractive.mockResolvedValue(
      fanOut([
        providerResult([job("One"), job("Two"), job("Three"), job("Four")]),
      ]),
    );

    const first = await call("query=dupes&location=Leeds&perPage=2");
    const second = await call(
      `query=dupes&location=Leeds&perPage=2&sessionId=${first.body.sessionId}`,
    );

    const ids = [...first.body.jobs, ...second.body.jobs].map(
      (item: { id: string }) => item.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports the served page number, not the highest provider page requested", async () => {
    // A buffered page requests nothing, so deriving the page number from
    // provider cursors reported every buffered page as page one.
    searchProvidersInteractive.mockResolvedValue(
      fanOut([
        providerResult([job("One"), job("Two"), job("Three"), job("Four")]),
      ]),
    );
    const first = await call("query=pages&location=Leeds&perPage=2");
    expect(first.body.meta.currentPage).toBe(1);
    const second = await call(
      `query=pages&location=Leeds&perPage=2&sessionId=${first.body.sessionId}`,
    );
    expect(second.body.meta.currentPage).toBe(2);
  });
});

describe("provider continuation when the buffer is spent", () => {
  it("asks each provider for its NEXT page, never page one again", async () => {
    searchProvidersInteractive.mockResolvedValue(
      fanOut([providerResult([job("One"), job("Two")])]),
    );
    const first = await call("query=cursor&location=Leeds&perPage=2");
    // The buffer holds exactly the page that was served, so a continuation must
    // go back to the providers.
    expect(first.body.jobs).toHaveLength(2);

    searchProvidersInteractive.mockClear();
    searchProvidersInteractive.mockResolvedValue(
      fanOut([providerResult([job("Three"), job("Four")])]),
    );
    await call(
      `query=cursor&location=Leeds&perPage=2&sessionId=${first.body.sessionId}`,
    );

    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);
    const options = searchProvidersInteractive.mock.calls[0][2] as {
      pageByProvider: Record<string, number>;
    };
    expect(options.pageByProvider.REED).toBe(2);
  });

  it("does not serve an empty continuation page", async () => {
    searchProvidersInteractive.mockResolvedValue(
      fanOut([providerResult([job("One"), job("Two")])]),
    );
    const first = await call("query=empty&location=Leeds&perPage=2");

    searchProvidersInteractive.mockResolvedValue(exhaustedFanOut([]));
    const second = await call(
      `query=empty&location=Leeds&perPage=2&sessionId=${first.body.sessionId}`,
    );

    expect(second.body.jobs).toHaveLength(0);
    // Exhausted, and it says so rather than offering another Next.
    expect(second.body.meta.hasMore).toBe(false);
  });

  it("does not infer more pages from a full page", async () => {
    // A merged page can be full while every provider behind it has said it has
    // nothing left. `hasMore` is authoritative, never a page-size heuristic.
    searchProvidersInteractive.mockResolvedValue(
      exhaustedFanOut([job("One"), job("Two")]),
    );
    const result = await call("query=full&location=Leeds&perPage=2");
    expect(result.body.jobs).toHaveLength(2);
    expect(result.body.meta.hasMore).toBe(false);
  });
});

describe("a cached page one seeds its own continuation", () => {
  it("lets a cache hit serve page two from the buffer too", async () => {
    searchProvidersInteractive.mockResolvedValue(
      fanOut([
        providerResult([job("One"), job("Two"), job("Three"), job("Four")]),
      ]),
    );
    await call("query=warmbuffer&location=Leeds&perPage=2");
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);

    // A different visitor, same query: served from the merged-search cache.
    const cached = await call("query=warmbuffer&location=Leeds&perPage=2");
    expect(cached.body.meta.cacheState).toBe("FRESH");
    expect(cached.body.meta.hasMore).toBe(true);

    const second = await call(
      `query=warmbuffer&location=Leeds&perPage=2&sessionId=${cached.body.sessionId}`,
    );
    expect(second.body.jobs).toHaveLength(2);
    // Without a buffer on the cached entry, this session would have had to run a
    // full search — a fast page one followed by a slow Load more.
    expect(searchProvidersInteractive).toHaveBeenCalledTimes(1);
  });
});

describe("degraded operation", () => {
  it("refuses a continuation whose session cannot be resolved", async () => {
    searchProvidersInteractive.mockResolvedValue(
      fanOut([providerResult([job("One")])]),
    );
    const result = await call(
      "query=lost&location=Leeds&perPage=2&sessionId=00000000-0000-4000-8000-000000000000",
    );
    // Answering with page one under a Load-more button is the duplicate-result
    // confusion this must avoid, so it is a typed status instead.
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("SEARCH_SESSION_EXPIRED");
  });
});
