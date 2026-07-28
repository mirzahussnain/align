/**
 * Provider fan-out, caching and deduplication for the Job Board.
 *
 * WHAT CHANGED IN THIS PHASE. The provider cache was a module-level `Map`. On a
 * serverless platform that Map is per-lambda-instance: invisible to every other
 * invocation, emptied by each cold start, and discarded on deploy. It is now a
 * {@link CacheStore}, so a result fetched by one instance is a hit for all of
 * them. `areDuplicates` and `deduplicateJobs` are unchanged.
 *
 * THREE SEPARATE MECHANISMS, OFTEN CONFUSED:
 *
 *   fresh / stale     A cached page inside `providerResponse` seconds is served
 *                     as-is. Between there and `providerStale` it is still
 *                     SERVED — a fifteen-minute-old vacancy list beats a spinner
 *                     — but a refresh is attempted alongside it.
 *   in-flight dedupe  Two concurrent requests for the same provider page inside
 *                     ONE instance share a single promise. This is per-process
 *                     and deliberately so; the cross-instance equivalent is the
 *                     refresh lock, which the route owns.
 *   deadline / timeout The user's wait (`interactiveTimeoutMs`, ~1.5 s) and the
 *                     request's own safety limit (`backgroundTimeoutMs`, ~5 s)
 *                     are different budgets. Reaching the first stops us
 *                     WAITING; only the second stops the request.
 *
 * ABANDONMENT IS EXPLICIT. When the deadline passes, an unfinished provider is
 * not left running unobserved: the caller either awaits `settle()` inside a
 * platform-supported post-response window — where the late result populates the
 * cache for the next search — or calls `abandon()`, which aborts the socket.
 * There is no path where a promise is dropped on the floor.
 */

import { createHash } from 'node:crypto';

import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import { createEnvelope, envelopeTtlSeconds, readEnvelope } from '@/shared/lib/cache/cache-envelope';
import { API_CONFIG } from '@/shared/lib/config';
import { searchAdzunaJobs } from '@/shared/services/adzuna';
import { searchReedJobs } from '@/shared/services/reed';
import { searchJoobleJobs } from '@/shared/services/jooble';
import { normaliseProviderJob } from '@/shared/services/job-normalisation';
import { getProviderCapabilities, pushdownFilters } from '@/shared/services/job-providers/capabilities';
import { logJobBoardEvent, type SearchTimings } from '@/shared/services/job-board-observability';
import { recordProviderOutcome } from '@/shared/services/provider-health';
import type { JobSearchParams, NormalisedJob, ProviderSearchResult, SearchJobProvider } from '@/shared/types/job';

type Adapter = (params: JobSearchParams, options: { signal?: AbortSignal }) => ReturnType<typeof searchAdzunaJobs>;

const providers: Record<SearchJobProvider, { configured: () => boolean; search: Adapter }> = {
  ADZUNA: { configured: () => Boolean(API_CONFIG.adzuna.appId && API_CONFIG.adzuna.appKey), search: searchAdzunaJobs },
  REED: { configured: () => Boolean(API_CONFIG.reed.apiKey), search: searchReedJobs },
  JOOBLE: { configured: () => Boolean(API_CONFIG.jooble.apiKey), search: searchJoobleJobs },
};

/**
 * Everything about a request that CHANGES WHAT THIS PROVIDER RETURNS, and
 * nothing else.
 *
 * This is the cache-key rule that matters: a parameter we do not send must not
 * split the cache, and a parameter we DO send must never be missing from it. So
 * each field is gated on the provider's declared capabilities rather than copied
 * from the request. Sort order is included only when the provider applies it
 * server-side — Reed declares no `sortOptions`, so all four of our sort choices
 * legitimately share one Reed cache entry and are ordered locally.
 *
 * Where the two risks are asymmetric the safe direction is INCLUSION. Adzuna
 * declares `contractTypeFilter`, but only `permanent` and `contract` map to a
 * parameter; `temporary` is keyed anyway. That costs an occasional extra fetch.
 * Omitting a parameter that IS sent would instead serve one filter's results
 * under another's key, which is a wrong answer.
 */
export function providerQueryDescriptor(provider: SearchJobProvider, params: JobSearchParams) {
  const capabilities = getProviderCapabilities(provider);
  const pushdown = pushdownFilters(provider);
  return {
    query: capabilities.keywordSearch ? params.query.trim().toLowerCase() : '',
    location: pushdown.location ? params.location.trim().toLowerCase() : '',
    perPage: Math.min(params.perPage, capabilities.maxPerPage),
    salaryMin: pushdown.salary ? params.salaryMin : undefined,
    salaryMax: pushdown.salary ? params.salaryMax : undefined,
    contractType: pushdown.contractType && params.contractType !== 'all' ? params.contractType : undefined,
    sortBy: params.sortBy && capabilities.sortOptions.includes(params.sortBy) ? params.sortBy : undefined,
  };
}

/** Stable hash of a provider-specific query. Order-independent by construction. */
export function providerQueryHash(provider: SearchJobProvider, params: JobSearchParams): string {
  const descriptor = providerQueryDescriptor(provider, params);
  const canonical = Object.keys(descriptor)
    .sort()
    .map((key) => `${key}=${String((descriptor as Record<string, unknown>)[key] ?? '')}`)
    .join('&');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function providerCacheKey(provider: SearchJobProvider, params: JobSearchParams): string {
  return cacheKeys.providerResponse(provider, providerQueryHash(provider, params), String(params.page));
}

/**
 * What is cached per provider page: the normalised jobs and the counts needed to
 * report honestly. `durationMs` and `cacheHit` are properties of a PARTICULAR
 * fetch, not of the data, so they are recomputed per read rather than stored.
 */
type CachedProviderPage = Pick<ProviderSearchResult, 'status' | 'jobs' | 'rawReceived' | 'validNormalised' | 'nextCursor'>;

/**
 * Promises for provider pages currently being fetched BY THIS INSTANCE.
 *
 * Collapses the duplicate-request case the brief calls out: two users (or one
 * user's double submit) hitting the same query in the same lambda make one
 * upstream call, not two. Module-level state is correct here precisely because
 * it is NOT product state — it holds only in-flight promises, is empty at rest,
 * and losing it costs a duplicate fetch.
 */
const inFlight = new Map<string, Promise<ProviderSearchResult>>();

const notConfigured = (provider: SearchJobProvider): ProviderSearchResult => ({
  provider,
  status: 'NOT_CONFIGURED',
  jobs: [],
  rawReceived: 0,
  validNormalised: 0,
  durationMs: 0,
});

/** Defensive copy, so a cached array cannot be mutated through a caller's reference. */
function clone(result: ProviderSearchResult, cacheHit: boolean): ProviderSearchResult {
  return {
    ...result,
    jobs: result.jobs.map((job) => ({ ...job, providerReferences: [...job.providerReferences] })),
    cacheHit,
  };
}

function fromCachedPage(provider: SearchJobProvider, page: CachedProviderPage, durationMs: number): ProviderSearchResult {
  return clone({ provider, ...page, durationMs }, true);
}

/**
 * One provider page: cache read, then a network fetch if needed.
 *
 * Writes the result to the cache and folds the outcome into provider health.
 * A failure is a returned RESULT, never a thrown error — one unavailable source
 * must not fail a federated search.
 */
async function fetchProviderPage(
  provider: SearchJobProvider,
  params: JobSearchParams,
  store: CacheStore,
  signal: AbortSignal
): Promise<ProviderSearchResult> {
  const started = Date.now();
  const definition = providers[provider];
  const capabilities = getProviderCapabilities(provider);
  const key = providerCacheKey(provider, params);

  logJobBoardEvent('provider_fetch_started', { provider, page: params.page });

  try {
    // The safety timeout bounds the REQUEST. It is deliberately larger than the
    // interactive deadline that bounds the WAIT: a provider answering at 3 s is
    // too late for this response but its result is still worth caching.
    const response = await withTimeout(
      definition.search(params, { signal }),
      capabilities.backgroundTimeoutMs,
      signal
    );

    const jobs = response.jobs
      .map(normaliseProviderJob)
      .filter((job) => Boolean(job.title && job.company && job.canonicalUrl));

    const page: CachedProviderPage = {
      status: jobs.length ? 'SUCCESS' : 'EMPTY',
      jobs,
      rawReceived: response.jobs.length,
      validNormalised: jobs.length,
      nextCursor: jobs.length === params.perPage ? String(params.page + 1) : undefined,
    };

    const envelope = createEnvelope(page, CACHE_TTL_SECONDS.providerResponse, CACHE_TTL_SECONDS.providerStale);
    await store.set(key, envelope, envelopeTtlSeconds(envelope));

    const result: ProviderSearchResult = { provider, ...page, durationMs: Date.now() - started };
    await recordProviderOutcome(store, provider, result);
    logJobBoardEvent('provider_fetch_completed', {
      provider,
      providerStatus: result.status,
      durationMs: result.durationMs,
      count: jobs.length,
      cacheHit: 'MISS',
    });
    return clone(result, false);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    const result: ProviderSearchResult = {
      provider,
      status: timedOut ? 'TIMED_OUT' : 'FAILED',
      jobs: [],
      rawReceived: 0,
      validNormalised: 0,
      errorCode: timedOut ? 'TIMEOUT' : 'UNAVAILABLE',
      durationMs: Date.now() - started,
    };
    await recordProviderOutcome(store, provider, result);
    logJobBoardEvent('provider_fetch_completed', {
      provider,
      providerStatus: result.status,
      durationMs: result.durationMs,
      // The error's own message is never logged: it can embed a URL carrying an
      // api key (Adzuna and Jooble both put credentials in the request URL).
      reason: result.errorCode,
    });
    return result;
  }
}

/** Reject with a named TimeoutError after `ms`, without leaking the timer. */
function withTimeout<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('timeout');
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
    const onAbort = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    });
  });
}

/**
 * One provider page, coalescing concurrent identical requests and serving fresh
 * cache without any network call.
 */
export async function searchProvider(
  provider: SearchJobProvider,
  params: JobSearchParams,
  store: CacheStore,
  signal: AbortSignal
): Promise<ProviderSearchResult> {
  if (!providers[provider].configured()) return notConfigured(provider);

  const key = providerCacheKey(provider, params);
  const started = Date.now();
  const cached = readEnvelope<CachedProviderPage>(await store.get(key));

  if (cached.freshness === 'FRESH') {
    logJobBoardEvent('cache_hit', { provider, cacheLayer: 'provider', cacheHit: 'FRESH', ageMs: cached.ageMs });
    return fromCachedPage(provider, cached.value, Date.now() - started);
  }

  const existing = inFlight.get(key);
  if (existing) return existing.then((result) => clone(result, result.cacheHit ?? false));

  const request = fetchProviderPage(provider, params, store, signal).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export interface InteractiveSearchOptions {
  store: CacheStore;
  /** How long the user waits before we answer with whatever we have. */
  interactiveDeadlineMs?: number;
  /** Answer early once this many unique jobs are in hand. */
  targetJobs?: number;
  timings?: SearchTimings;
  /**
   * Per-provider page number, overriding `params.page`. Providers do not exhaust
   * in lockstep, so a session tracks each one's position independently; a
   * provider omitted here falls back to `params.page`.
   */
  pageByProvider?: Partial<Record<SearchJobProvider, number>>;
}

export interface InteractiveSearchOutcome {
  results: ProviderSearchResult[];
  /** Providers still in flight when the response was assembled. */
  pendingProviders: SearchJobProvider[];
  /** Time to the first provider that returned usable jobs. */
  firstUsefulMs?: number;
  /**
   * Await the stragglers so their results reach the cache. MUST be awaited
   * inside a platform-supported post-response window (`after`), never dropped.
   */
  settle: () => Promise<void>;
  /** Abort the stragglers. Use when no post-response window is available. */
  abandon: () => void;
}

/**
 * Fan out across the selected providers, answering at the interactive deadline
 * with whatever is usable by then.
 *
 * The three ways a provider is represented in `results` are distinct and all
 * truthful: a settled fetch (SUCCESS / EMPTY / FAILED / TIMED_OUT), a STALE
 * cache entry served while its refresh continues (its own cached status, with
 * `cacheHit`), and PENDING — still healthily in flight when we stopped waiting.
 */
export async function searchProvidersInteractive(
  params: JobSearchParams,
  selected: SearchJobProvider[],
  options: InteractiveSearchOptions
): Promise<InteractiveSearchOutcome> {
  const { store, timings } = options;
  const startedAt = Date.now();
  const deadlineMs =
    options.interactiveDeadlineMs ??
    Math.max(...selected.map((provider) => getProviderCapabilities(provider).interactiveTimeoutMs), 0);
  const targetJobs = options.targetJobs ?? params.perPage;

  const controller = new AbortController();
  const slots = new Map<SearchJobProvider, ProviderSearchResult>();
  const settled = new Set<SearchJobProvider>();
  let firstUsefulMs: number | undefined;
  let releaseEarly: (() => void) | undefined;

  /** Unique jobs held so far, so "enough to answer" is measured after dedupe. */
  const uniqueSoFar = () => deduplicateJobs([...slots.values()].flatMap((result) => result.jobs)).length;

  const record = (provider: SearchJobProvider, result: ProviderSearchResult) => {
    slots.set(provider, result);
    settled.add(provider);
    if (result.jobs.length && firstUsefulMs === undefined) firstUsefulMs = Date.now() - startedAt;
    if (settled.size === selected.length || uniqueSoFar() >= targetJobs) releaseEarly?.();
  };

  const tasks = selected.map(async (provider) => {
    if (!providers[provider].configured()) {
      record(provider, notConfigured(provider));
      return;
    }

    // Each provider is asked for ITS next page, not a shared counter's.
    const providerParams: JobSearchParams = {
      ...params,
      page: options.pageByProvider?.[provider] ?? params.page,
    };

    // A stale entry is a usable provisional answer AND a reason to refresh. Seed
    // the slot with it first, so if the refresh misses the deadline the user
    // still sees jobs rather than a PENDING chip over an empty list.
    const key = providerCacheKey(provider, providerParams);
    const cached = readEnvelope<CachedProviderPage>(await store.get(key));
    if (cached.freshness === 'STALE') {
      slots.set(provider, fromCachedPage(provider, cached.value, 0));
      logJobBoardEvent('cache_stale_served', {
        provider,
        cacheLayer: 'provider',
        cacheHit: 'STALE',
        ageMs: cached.ageMs,
      });
      if (firstUsefulMs === undefined && cached.value.jobs.length) firstUsefulMs = Date.now() - startedAt;
    } else if (cached.freshness === 'FRESH') {
      record(provider, fromCachedPage(provider, cached.value, Date.now() - startedAt));
      logJobBoardEvent('cache_hit', { provider, cacheLayer: 'provider', cacheHit: 'FRESH', ageMs: cached.ageMs });
      return;
    } else {
      logJobBoardEvent('cache_miss', { provider, cacheLayer: 'provider', cacheHit: 'MISS' });
    }

    record(provider, await searchProvider(provider, providerParams, store, controller.signal));
  });

  // Settles when every provider has answered; never rejects, because each task
  // converts its own failure into a result.
  const all = Promise.allSettled(tasks).then(() => undefined);

  const earlyExit = new Promise<void>((resolve) => {
    releaseEarly = resolve;
  });
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    deadlineTimer = setTimeout(resolve, Math.max(0, deadlineMs));
  });

  await Promise.race([all, earlyExit, deadline]);
  clearTimeout(deadlineTimer);

  const pendingProviders = selected.filter((provider) => !settled.has(provider));
  if (pendingProviders.length) {
    logJobBoardEvent('provider_deadline_reached', {
      count: pendingProviders.length,
      durationMs: Date.now() - startedAt,
    });
  }

  const results = selected.map(
    (provider) =>
      slots.get(provider) ?? {
        provider,
        // Still in flight and healthy — NOT a timeout. Its result will land in
        // the cache and serve the next request.
        status: 'PENDING' as const,
        jobs: [],
        rawReceived: 0,
        validNormalised: 0,
        durationMs: Date.now() - startedAt,
      }
  );

  timings?.add('providerMs', Date.now() - startedAt);

  return {
    results,
    pendingProviders,
    firstUsefulMs,
    settle: async () => {
      await all;
    },
    abandon: () => {
      // Only abort what is genuinely unfinished. Aborting unconditionally would
      // cancel a fetch that is already writing its result to the cache.
      if (settled.size < selected.length) controller.abort();
    },
  };
}

const similarity = (a: string, b: string) => a === b ? 1 : !a || !b ? 0 : (a.split(' ').filter((word) => b.split(' ').includes(word)).length / Math.max(a.split(' ').length, b.split(' ').length));
export function areDuplicates(a: NormalisedJob, b: NormalisedJob) {
  if (a.canonicalUrl === b.canonicalUrl) return true;
  const title = similarity(a.title.toLowerCase(), b.title.toLowerCase()); const company = similarity(a.companyNormalised ?? '', b.companyNormalised ?? ''); const location = similarity(a.locationText.toLowerCase(), b.locationText.toLowerCase());
  const postedDistance = a.postedAt && b.postedAt ? Math.abs(Date.parse(a.postedAt) - Date.parse(b.postedAt)) / 86_400_000 : undefined;
  return title >= .8 && company >= .8 && location >= .6 && (postedDistance === undefined || postedDistance <= 14);
}
function richer(a: NormalisedJob, b: NormalisedJob) { return (a.description?.length ?? 0) >= (b.description?.length ?? 0) ? a : b; }
export function deduplicateJobs(jobs: NormalisedJob[]) {
  const merged: NormalisedJob[] = [];
  for (const job of jobs) {
    const index = merged.findIndex((existing) => areDuplicates(existing, job));
    if (index < 0) { merged.push(job); continue; }
    const existing = merged[index]; const primary = richer(existing, job); const secondary = primary === existing ? job : existing;
    merged[index] = { ...primary, providerReferences: [...primary.providerReferences, ...secondary.providerReferences], salaryMin: primary.salaryMin ?? secondary.salaryMin, salaryMax: primary.salaryMax ?? secondary.salaryMax, sponsorSignal: primary.sponsorSignal.jobWording !== 'NOT_MENTIONED' ? primary.sponsorSignal : secondary.sponsorSignal };
  }
  const ids = new Set<string>();
  return merged.map((job) => {
    let canonicalJobId = job.canonicalJobId; let suffix = 2;
    while (ids.has(canonicalJobId)) canonicalJobId = `${job.canonicalJobId}-${suffix++}`;
    ids.add(canonicalJobId); return { ...job, canonicalJobId };
  });
}

/** Test-only: drop coalesced in-flight promises between cases. */
export function __resetInFlight(): void {
  inFlight.clear();
}
