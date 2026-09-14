/**
 * Federated job search.
 *
 * PHASE 3 REPLACED ALL THREE MODULE-LEVEL MAPS here — the merged-response cache,
 * the search-session map and (in `job-search.ts`) the provider cache — with a
 * shared {@link CacheStore}. The correctness fixes Phase 2 made are preserved
 * exactly, and are now expressed in the cache KEY rather than in a local
 * convention:
 *
 *   - Provider counts are still computed AFTER filtering, the seen-id drop and
 *     the page slice, so a chip never claims more than the list shows.
 *   - Only page 1 is cached, and the key says `page`. Page 2+ is meaningful only
 *     alongside a session's seen-ids, which the cache does not hold, so caching
 *     it could only ever serve somebody else's continuation.
 *   - The display sort is part of the response hash, so a salary-ascending
 *     request can never be served the descending page.
 *
 * DEGRADED OPERATION. Every cache call goes through `resilientCache`, so a Redis
 * outage produces misses and no-ops rather than exceptions. A search still
 * queries providers and still returns a merged response; what is lost is shared
 * caching, shared sessions and the shared refresh lock. "Load more" is the one
 * thing that CANNOT degrade silently — without its session it would serve page
 * one again under a Load-more button — so a missing session is reported as a
 * typed 409 and the client starts a fresh search.
 */

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/shared/lib/auth";
import { scheduleAfterResponse } from "@/shared/lib/after-response";
import { cacheKeys, CACHE_TTL_SECONDS } from "@/shared/lib/cache/cache-keys";
import {
  getCacheBackend,
  getCacheStore,
} from "@/shared/lib/cache/cache-provider";
import {
  createEnvelope,
  envelopeTtlSeconds,
  readEnvelope,
} from "@/shared/lib/cache/cache-envelope";
import type { CacheStore } from "@/shared/lib/cache/cache-store";
import { acquireRefreshLock } from "@/shared/lib/cache/refresh-lock";
import { applyRateLimit, jobsLimiter } from "@/shared/lib/rate-limit";
import {
  deduplicateJobs,
  searchProvidersInteractive,
} from "@/shared/services/job-search";
import { getAtsSnapshotProviderResults } from "@/shared/services/job-discovery";
import { materialiseSearchJobCards } from "@/shared/services/job-search-view";
import {
  logJobBoardEvent,
  SearchTimings,
} from "@/shared/services/job-board-observability";
import { loadProfileTarget } from "@/features/dashboard/data/load-profile";
import {
  activeProviders,
  bufferedRemainder,
  loadSessionBuffer,
  nextProviderPages,
  recordPage,
  resolveSession,
  saveSession,
  saveSessionBuffer,
  servedPageCount,
  type JobSearchSession,
} from "@/shared/services/job-search-session";
import {
  assessUkLocation,
  isUkDiscoverable,
} from "@/shared/services/uk-location";
import { readProviderHealthMap } from "@/shared/services/provider-health";
import { matchSponsorCompaniesCached } from "@/shared/services/sponsor-match-cache";
import type {
  JobSearchParams,
  NormalisedJob,
  ProviderCount,
  ProviderSearchResult,
  SearchJobProvider,
} from "@/shared/types/job";
import { withErrorHandler, APIError } from "@/shared/utils/api-error";
import { JobsQuerySchema } from "./schema";

type Query = ReturnType<typeof JobsQuerySchema.parse>;

const canonicalHash = (input: object) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

const PARTIAL_MESSAGE =
  "Some job sources are temporarily unavailable. Showing results from the available sources.";

/**
 * Whether a further page can genuinely be served.
 *
 * Two conditions, and both are load-bearing. A provider must remain unexhausted,
 * and the session that holds the cursor must be storable at all: with the cache
 * disabled every `saveSession` is dropped, so the next request presents a
 * session id nobody can resolve and is answered with a 409. Advertising "more"
 * in that state offers a control that cannot work, which is exactly how the
 * page-size heuristic the client used to apply went wrong — a merged page can be
 * full while every provider behind it has already said it has nothing left.
 */
function canServeMorePages(
  session: JobSearchSession,
  providers: readonly SearchJobProvider[],
) {
  return (
    getCacheBackend() !== "disabled" &&
    activeProviders(session, providers).length > 0
  );
}

// Only the market-wide search providers are fanned out per request. Employer-ATS
// providers answer per-board, never per-query, so they are orchestrated separately.
const selectedProviders = (source: string): SearchJobProvider[] =>
  source === "all"
    ? ["ADZUNA", "REED", "JOOBLE"]
    : [source.toUpperCase() as SearchJobProvider];

function relevance(job: NormalisedJob, query: string) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return (
    tokens.filter((token) => job.title.toLowerCase().includes(token)).length *
      100 +
    (job.descriptionAvailability === "FULL" ? 10 : 0)
  );
}

function applyFilters(
  jobs: NormalisedJob[],
  data: {
    sponsorship: string;
    experience: string;
    remoteType: string;
    postedWithinDays?: number;
  },
) {
  const after = data.postedWithinDays
    ? Date.now() - data.postedWithinDays * 86_400_000
    : 0;
  return jobs.filter((job) => {
    if (
      data.sponsorship === "registered" &&
      job.sponsorSignal.registerMatchStatus === "NONE"
    )
      return false;
    if (
      data.sponsorship === "offered" &&
      !["EXPLICITLY_AVAILABLE", "POSSIBLY_AVAILABLE"].includes(
        job.sponsorSignal.jobWording,
      )
    )
      return false;
    if (
      data.sponsorship === "required" &&
      job.sponsorSignal.jobWording !== "RIGHT_TO_WORK_REQUIRED"
    )
      return false;
    if (
      data.sponsorship === "exclude_no_sponsorship" &&
      job.sponsorSignal.jobWording === "EXPLICITLY_UNAVAILABLE"
    )
      return false;
    if (data.remoteType !== "all" && job.remoteType !== data.remoteType)
      return false;
    if (after && (!job.postedAt || Date.parse(job.postedAt) < after))
      return false;
    const title = job.title.toLowerCase();
    const junior = /\b(junior|graduate|associate|trainee|intern)\b/.test(title);
    const senior = /\b(senior|lead|principal|head|director|manager)\b/.test(
      title,
    );
    return (
      data.experience === "all" ||
      (data.experience === "junior" && junior) ||
      (data.experience === "senior" && senior) ||
      (data.experience === "mid" && !junior && !senior)
    );
  });
}

function sortJobs(jobs: NormalisedJob[], sortBy: string, query: string) {
  return jobs.sort((a, b) => {
    if (sortBy === "date")
      return (
        (Date.parse(b.postedAt ?? "") || 0) -
        (Date.parse(a.postedAt ?? "") || 0)
      );
    if (sortBy === "salary_desc" || sortBy === "salary_asc") {
      // Only compare annual salaries; mixed periods and unknown salary remain consistently last.
      const amount = (job: NormalisedJob) =>
        job.salaryPeriod === "YEAR"
          ? (job.salaryMax ?? job.salaryMin)
          : undefined;
      const av = amount(a);
      const bv = amount(b);
      if (av === undefined && bv === undefined)
        return a.canonicalJobId.localeCompare(b.canonicalJobId);
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return sortBy === "salary_desc" ? bv - av : av - bv;
    }
    return (
      relevance(b, query) - relevance(a, query) ||
      a.canonicalJobId.localeCompare(b.canonicalJobId)
    );
  });
}

/**
 * How many UI pages one search pass buffers.
 *
 * Two, not "as many as we can get". The providers are asked for one page each
 * either way; the buffer is simply the tail of what that already produced after
 * merging the employer-ATS catalogue in, so a second page costs a Redis read
 * rather than a full re-search. Going wider would mean asking providers for
 * pages a user may never look at, which trades their rate limit for a page most
 * sessions never reach.
 */
const BUFFER_PAGES = 2;

/** What one execution of the search pipeline produced. Free of any user identity. */
interface SearchOutcome {
  jobs: NormalisedJob[];
  /** `jobs` plus the ordered tail held back for the next page. */
  buffer: NormalisedJob[];
  counts: ProviderCount[];
  partialMessage?: string;
  exhausted: SearchJobProvider[];
  pagesRequested: Partial<Record<SearchJobProvider, number>>;
  pendingProviders: SearchJobProvider[];
  firstUsefulMs?: number;
}

/** Exactly what is stored per cached page. Deliberately no session state, no user. */
type CachedSearchPage = Pick<
  SearchOutcome,
  "jobs" | "buffer" | "counts" | "partialMessage" | "exhausted" | "pagesRequested"
>;

/**
 * One full pass: fan out, deduplicate, attach sponsor evidence, filter, sort,
 * drop already-seen results, slice to a page, then count.
 *
 * Shared verbatim by the interactive path and the post-response refresh, so a
 * refreshed cache entry cannot drift from what a live search would have
 * produced. It remains free of user state and is safe for the shared cache.
 */
async function runSearch(
  data: Query,
  params: JobSearchParams,
  input: {
    store: CacheStore;
    providers: SearchJobProvider[];
    pageByProvider: Partial<Record<SearchJobProvider, number>>;
    seenJobIds: ReadonlySet<string>;
    timings: SearchTimings;
    /** Interactive requests answer at the deadline; a refresh waits properly. */
    interactive: boolean;
  },
): Promise<{
  outcome: SearchOutcome;
  settle: () => Promise<void>;
  abandon: () => void;
}> {
  const { store, timings } = input;

  const fanOut = await searchProvidersInteractive(params, input.providers, {
    store,
    timings,
    pageByProvider: input.pageByProvider,
    targetJobs: data.perPage,
    // A refresh has no user waiting on it, so it is given the providers' full
    // background budget instead of the ~1.5 s interactive deadline.
    ...(input.interactive
      ? {}
      : { interactiveDeadlineMs: Number.MAX_SAFE_INTEGER }),
  });

  // ATS is deliberately a single durable-snapshot query. No Greenhouse, Lever
  // or Ashby board endpoint is ever called on this interactive search path.
  // The query is public and identical for every user, so it is served from the
  // shared cache; per-user card state is merged much later, in `respond`.
  const atsResults = await timings.measure("atsSnapshotMs", () =>
    getAtsSnapshotProviderResults(new Date(), { store }),
  );
  const providerResults: ProviderSearchResult[] = [
    ...fanOut.results,
    ...atsResults,
  ];

  let jobs = timings.measureSync("dedupeMs", () =>
    deduplicateJobs(providerResults.flatMap((result) => result.jobs)),
  );

  // ── United Kingdom scope ─────────────────────────────────────────────────
  // Applied centrally, AFTER the merge, so a vacancy carried by several sources
  // is judged once on its merged location evidence rather than differently per
  // provider. The employer-ATS path is already scoped inside its own query; this
  // is what stops the aggregators contributing non-UK rows, which they did
  // whenever a user's location text was empty or broad. Typed location text is
  // never treated as sufficient on its own.
  jobs = timings.measureSync("ukScopeMs", () =>
    jobs.flatMap((job) => {
      if (job.ukEligibility) return isUkDiscoverable(job.ukEligibility) ? [job] : [];
      const scope = assessUkLocation({
        locationText: job.locationText,
        city: job.city,
        region: job.region,
        country: job.country,
        remote: job.remoteType === "REMOTE",
      });
      return isUkDiscoverable(scope.eligibility)
        ? [
            {
              ...job,
              ukEligibility: scope.eligibility,
              ...(scope.countryCode ? { countryCode: scope.countryCode } : {}),
            },
          ]
        : [];
    }),
  );

  await timings.measure("sponsorMs", async () => {
    try {
      const matches = await matchSponsorCompaniesCached(store, [
        ...new Set(jobs.map((job) => job.company)),
      ]);
      jobs = jobs.map((job) => {
        const match = matches.get(job.company) ?? { status: "NONE" as const };
        return {
          ...job,
          sponsorSignal: {
            ...job.sponsorSignal,
            registerMatchStatus: match.status,
            matchedOrganisationName: match.organisationName,
            explanation:
              match.status === "EXACT"
                ? "This employer appears on the UK register of licensed sponsors. This does not confirm sponsorship for this vacancy."
                : match.status === "LIKELY" || match.status === "AMBIGUOUS"
                  ? "A similar organisation name appears on the sponsor register. Verify the employer’s legal entity."
                  : job.sponsorSignal.explanation,
          },
        };
      });
    } catch {
      /* the register is supplementary evidence, never a search blocker */
    }
  });

  const filtered = timings.measureSync("filterMs", () =>
    applyFilters(jobs, data),
  );
  const sorted = timings.measureSync("sortMs", () =>
    sortJobs(filtered, data.sortBy, params.query),
  );
  // ── Buffer, then page ────────────────────────────────────────────────────
  // One pass produces enough ordered results for several UI pages. The extra
  // results cost nothing to compute — they have already been fetched, merged,
  // filtered and sorted — and storing them is what lets the next page be a slice
  // instead of a second identical search. The buffer is bounded, so this is not
  // an unbounded over-fetch: BUFFER_PAGES pages, and no provider is asked for
  // more than its own next page.
  const available = sorted.filter(
    (job) => !input.seenJobIds.has(job.canonicalJobId),
  );
  const buffer = available.slice(0, data.perPage * BUFFER_PAGES);
  const page = buffer.slice(0, data.perPage);

  // Counted AFTER filtering, the seen-id drop and the page slice, so
  // `uniqueContributed` describes the jobs the user is actually shown.
  // `rawReceived` and `validNormalised` stay provider-level truths about the
  // fetch itself — deliberately a different figure, not the same one.
  const counts: ProviderCount[] = providerResults.map((result) => ({
    provider: result.provider,
    status: result.status,
    rawReceived: result.rawReceived,
    validNormalised: result.validNormalised,
    uniqueContributed: page.filter((job) =>
      job.providerReferences.some(
        (reference) => reference.provider === result.provider,
      ),
    ).length,
  }));

  const unavailable = providerResults.filter((result) =>
    ["FAILED", "TIMED_OUT", "TIMEOUT", "RATE_LIMITED", "UNAVAILABLE"].includes(
      result.status,
    ),
  );

  return {
    outcome: {
      jobs: page,
      buffer,
      counts,
      partialMessage:
        unavailable.length || fanOut.pendingProviders.length
          ? PARTIAL_MESSAGE
          : undefined,
      // A provider is exhausted only when it SUCCEEDED and reported no further
      // page, or when it is not configured at all and so can never report one.
      // A failed or still-pending source has said nothing about whether more
      // results exist, and must not be dropped from later pages.
      exhausted: providerResults
        .filter(
          (result) =>
            (result.status === "SUCCESS" ||
              result.status === "EMPTY" ||
              result.status === "NOT_CONFIGURED") &&
            !result.nextCursor,
        )
        .map((result) => result.provider as SearchJobProvider),
      pagesRequested: input.pageByProvider,
      pendingProviders: fanOut.pendingProviders,
      firstUsefulMs: fanOut.firstUsefulMs,
    },
    settle: fanOut.settle,
    abandon: fanOut.abandon,
  };
}

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const timings = new SearchTimings();
    const store = getCacheStore();

    const rateLimitResponse = await timings.measure("rateLimitMs", async () =>
      applyRateLimit(
        jobsLimiter,
        request.headers.get("x-forwarded-for") ?? "anonymous",
      ),
    );
    if (rateLimitResponse) return rateLimitResponse;

    const authenticated = await timings.measure("authMs", () =>
      auth.api.getSession({ headers: request.headers }),
    );
    const userId = authenticated?.user.id ?? null;

    const parsed = JobsQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const data = parsed.data;
    const careerTrack = data.careerTrackId
      ? userId
        ? await loadProfileTarget(userId, data.careerTrackId)
        : null
      : undefined;
    if (data.careerTrackId && !careerTrack) {
      throw new APIError(
        "Career Track not found.",
        400,
        { field: "careerTrackId" },
        "INVALID_CAREER_TRACK",
      );
    }
    const careerTrackInput = careerTrack
      ? {
          targetRoleTitle: careerTrack.targetRoleTitle,
          occupationFamily: careerTrack.targetOccupation,
          industry: careerTrack.targetIndustry,
          seniority: careerTrack.targetSeniority,
        }
      : undefined;

    const params: JobSearchParams = {
      query: data.query,
      location: data.location,
      page: 1,
      perPage: data.perPage,
      contractType: data.contractType,
      salaryMin: data.salaryMin,
      sortBy:
        data.sortBy === "date"
          ? "date"
          : data.sortBy.startsWith("salary")
            ? "salary"
            : "relevance",
      sponsorship: "all",
      experience: data.experience,
    };

    // Everything that changes WHICH jobs come back or IN WHAT ORDER. `sortBy` is
    // included even though it is applied locally: the cached payload is stored
    // already sorted, so two sort directions must not share a key.
    const queryHash = canonicalHash({
      ...params,
      source: data.source,
      sponsorship: data.sponsorship,
      remoteType: data.remoteType,
      postedWithinDays: data.postedWithinDays,
      sortBy: data.sortBy,
    });

    logJobBoardEvent("search_started", {
      queryHash,
      userId,
      page: 1,
      cacheBackend: getCacheBackend(),
    });

    const resolution = await timings.measure("sessionReadMs", () =>
      resolveSession(store, { sessionId: data.sessionId, queryHash, userId }),
    );

    if (resolution.outcome === "MISSING") {
      // Deliberately NOT a silent fresh search. The client asked to continue a
      // sequence we can no longer place, and answering with page one under a
      // "Load more" button is precisely the duplicate-result confusion this
      // must avoid. A typed status lets the client restart cleanly.
      const message =
        "Your search session has expired. Run the search again to continue.";
      throw new APIError(message, 409, {
        error: message,
        code: "SEARCH_SESSION_EXPIRED",
      });
    }
    if (resolution.outcome === "REJECTED") {
      throw new APIError(
        resolution.reason === "owner_mismatch"
          ? "This search session belongs to a different sign-in. Start a new search."
          : "Search session does not match these filters. Start a new search.",
        400,
      );
    }

    const session = resolution.session;
    const isFirstPage = resolution.outcome === "CREATED";
    const allProviders = selectedProviders(data.source);

    // ── Continuation served from the session buffer ──────────────────────────
    // The whole point of the buffer. A "Load more" that lands here contacts no
    // provider, runs no employer-ATS query, performs no dedupe, no sponsor
    // matching, no filtering and no sorting: the ordering was decided on page
    // one and this is the next slice of it. Providers are only re-entered once
    // the buffer is genuinely spent, further down.
    if (!isFirstPage) {
      const remainder = bufferedRemainder(session);
      if (remainder.length) {
        const buffered = await timings.measure("sessionBufferReadMs", () =>
          loadSessionBuffer<NormalisedJob>(store, session.id),
        );
        const byId = new Map(
          (buffered ?? []).map((job) => [job.canonicalJobId, job]),
        );
        const slice = remainder
          .slice(0, data.perPage)
          .flatMap((id) => byId.get(id) ?? []);
        if (slice.length) {
          const advanced = recordPage(session, {
            pages: {},
            exhausted: [],
            shownCanonicalJobIds: slice.map((job) => job.canonicalJobId),
          });
          await timings.measure("sessionWriteMs", () =>
            saveSession(store, advanced),
          );
          logJobBoardEvent("cache_hit", {
            queryHash,
            cacheLayer: "session-buffer",
            cacheHit: "FRESH",
            page: servedPageCount(advanced),
            count: slice.length,
          });
          return respond({
            jobs: slice,
            sessionId: advanced.id,
            currentPage: servedPageCount(advanced),
            hasMore:
              bufferedRemainder(advanced).length > 0 ||
              canServeMorePages(advanced, allProviders),
            counts: [],
            cacheHit: "FRESH",
            refreshMode: "none",
            store,
            providers: allProviders,
            timings,
            queryHash,
            userId,
            careerTrack: careerTrackInput,
            selectedCareerTrackId: careerTrack?.profileId,
          });
        }
        // The ids survived but their payloads did not (independent TTLs, or an
        // eviction). Fall through to a provider continuation rather than serve
        // a short page.
        logJobBoardEvent("cache_miss", {
          queryHash,
          cacheLayer: "session-buffer",
          cacheHit: "MISS",
        });
      }
    }

    const providers = isFirstPage
      ? allProviders
      : activeProviders(session, allProviders);
    const pageByProvider = isFirstPage
      ? Object.fromEntries(allProviders.map((provider) => [provider, 1]))
      : nextProviderPages(session, allProviders);

    // ── Page 1 only: read-through the merged-response cache ──────────────────
    // Later pages depend on this session's seen-ids, which the shared cache does
    // not (and must not) hold, so they are neither read from nor written to it.
    if (isFirstPage && data.refresh !== "true") {
      const pageKey = cacheKeys.mergedSearch(queryHash, 1);
      const cached = await timings.measure("cacheLookupMs", async () =>
        readEnvelope<CachedSearchPage>(await store.get(pageKey)),
      );

      if (cached.freshness !== "MISS") {
        const stale = cached.freshness === "STALE";
        logJobBoardEvent(stale ? "cache_stale_served" : "cache_hit", {
          queryHash,
          cacheLayer: "search",
          cacheHit: cached.freshness,
          ageMs: cached.ageMs,
          page: 1,
        });

        let refreshMode = "none";
        if (stale)
          refreshMode = await coordinateRefresh(store, {
            data,
            params,
            queryHash,
            allProviders,
            timings,
          });

        // A cached page-one entry carries its buffer, so a cache hit seeds the
        // session's continuation exactly as a live search would. Without this a
        // cache hit would be fast and its "Load more" slow — the worst possible
        // pairing, and precisely the shape of the reported symptom.
        const cachedBuffer = cached.value.buffer ?? cached.value.jobs;
        const seeded = recordPage(session, {
          pages: cached.value.pagesRequested,
          exhausted: cached.value.exhausted,
          shownCanonicalJobIds: cached.value.jobs.map(
            (job) => job.canonicalJobId,
          ),
          orderedCanonicalJobIds: cachedBuffer.map((job) => job.canonicalJobId),
        });
        await timings.measure("sessionWriteMs", () =>
          Promise.all([
            saveSession(store, seeded),
            saveSessionBuffer(store, seeded.id, cachedBuffer),
          ]),
        );

        return respond({
          jobs: cached.value.jobs,
          sessionId: seeded.id,
          currentPage: 1,
          hasMore:
            bufferedRemainder(seeded).length > 0 ||
            canServeMorePages(seeded, allProviders),
          counts: cached.value.counts,
          partialMessage: cached.value.partialMessage,
          cacheHit: cached.freshness,
          refreshMode,
          store,
          providers: allProviders,
          timings,
          queryHash,
          userId,
          careerTrack: careerTrackInput,
          selectedCareerTrackId: careerTrack?.profileId,
        });
      }

      logJobBoardEvent("cache_miss", {
        queryHash,
        cacheLayer: "search",
        cacheHit: "MISS",
        page: 1,
      });
    }

    // ── Cache miss (or a later page): run the search ─────────────────────────
    const seenJobIds = new Set(session.seenCanonicalJobIds);
    const { outcome, settle, abandon } = await runSearch(data, params, {
      store,
      providers,
      pageByProvider,
      seenJobIds,
      timings,
      interactive: true,
    });

    if (isFirstPage) {
      const envelope = createEnvelope<CachedSearchPage>(
        {
          jobs: outcome.jobs,
          buffer: outcome.buffer,
          counts: outcome.counts,
          partialMessage: outcome.partialMessage,
          exhausted: outcome.exhausted,
          pagesRequested: outcome.pagesRequested,
        },
        CACHE_TTL_SECONDS.searchFresh,
        CACHE_TTL_SECONDS.searchStale,
      );
      await timings.measure("cacheWriteMs", () =>
        store.set(
          cacheKeys.mergedSearch(queryHash, 1),
          envelope,
          envelopeTtlSeconds(envelope),
        ),
      );
    }

    const updated = recordPage(session, {
      pages: pageByProvider,
      exhausted: outcome.exhausted,
      shownCanonicalJobIds: outcome.jobs.map((job) => job.canonicalJobId),
      orderedCanonicalJobIds: outcome.buffer.map((job) => job.canonicalJobId),
    });
    // The buffer is what the NEXT page will be sliced from. A provider
    // continuation appends to it rather than replacing it, so ordering already
    // shown to the user is never rewritten underneath them.
    const continuation = isFirstPage
      ? outcome.buffer
      : [
          ...((await loadSessionBuffer<NormalisedJob>(store, session.id)) ?? []),
          ...outcome.buffer,
        ];
    await timings.measure("sessionWriteMs", () =>
      Promise.all([
        saveSession(store, updated),
        saveSessionBuffer(store, updated.id, continuation),
      ]),
    );

    // Providers that missed the interactive deadline are still in flight. Let
    // them finish inside the platform's post-response window so their results
    // reach the cache; if there is no such window, abort them rather than leave
    // a promise nobody is waiting on.
    let refreshMode = "none";
    if (outcome.pendingProviders.length) {
      const scheduled = scheduleAfterResponse(
        () => settle(),
        (error) =>
          logJobBoardEvent("refresh_completed", {
            queryHash,
            reason: error instanceof Error ? error.name : "unknown_error",
          }),
      );
      if (scheduled === "scheduled") {
        refreshMode = "after_settle";
        logJobBoardEvent("refresh_scheduled", {
          queryHash,
          refreshMode,
          count: outcome.pendingProviders.length,
        });
      } else {
        abandon();
        refreshMode = "abandoned";
        logJobBoardEvent("refresh_unavailable", {
          queryHash,
          reason: "no_request_scope",
        });
      }
    }

    return respond({
      jobs: outcome.jobs,
      sessionId: updated.id,
      currentPage: servedPageCount(updated),
      hasMore:
        bufferedRemainder(updated).length > 0 ||
        canServeMorePages(updated, allProviders),
      counts: outcome.counts,
      partialMessage: outcome.partialMessage,
      cacheHit: "MISS",
      refreshMode,
      store,
      providers: allProviders,
      timings,
      queryHash,
      userId,
      careerTrack: careerTrackInput,
      selectedCareerTrackId: careerTrack?.profileId,
      firstUsefulMs: outcome.firstUsefulMs,
    });
  });
}

/**
 * Try to become the one instance that refreshes a stale page.
 *
 * Losing the lock is the NORMAL outcome under load and is not a failure: the
 * stale payload has already been served, and somebody else is refreshing. A
 * cache error also reports "not acquired", so an outage can never convince every
 * instance that some other instance is handling it.
 *
 * The refresh itself runs inside `after`, which on Vercel extends the invocation
 * until it settles. Where no such window exists the lock is released immediately
 * and the entry stays stale until a later request refreshes it — a slightly
 * older page, never a silently-dropped promise.
 */
async function coordinateRefresh(
  store: CacheStore,
  input: {
    data: Query;
    params: JobSearchParams;
    queryHash: string;
    allProviders: SearchJobProvider[];
    timings: SearchTimings;
  },
): Promise<string> {
  const { data, params, queryHash, allProviders } = input;
  const lock = await acquireRefreshLock(
    store,
    cacheKeys.searchRefreshLock(queryHash),
    CACHE_TTL_SECONDS.searchRefreshLock,
  );
  if (!lock.acquired) {
    logJobBoardEvent("refresh_lock_lost", { queryHash });
    return "in_progress_elsewhere";
  }
  logJobBoardEvent("refresh_lock_acquired", { queryHash });

  const scheduled = scheduleAfterResponse(
    async () => {
      try {
        // A fresh page 1 with no seen-ids and its own timing bag — this run is
        // not part of the request that triggered it.
        const refreshTimings = new SearchTimings();
        const { outcome, settle } = await runSearch(data, params, {
          store,
          providers: allProviders,
          pageByProvider: Object.fromEntries(
            allProviders.map((provider) => [provider, 1]),
          ),
          seenJobIds: new Set<string>(),
          timings: refreshTimings,
          interactive: false,
        });
        await settle();

        const envelope = createEnvelope<CachedSearchPage>(
          {
            jobs: outcome.jobs,
            buffer: outcome.buffer,
            counts: outcome.counts,
            partialMessage: outcome.partialMessage,
            exhausted: outcome.exhausted,
            pagesRequested: outcome.pagesRequested,
          },
          CACHE_TTL_SECONDS.searchFresh,
          CACHE_TTL_SECONDS.searchStale,
        );
        await store.set(
          cacheKeys.mergedSearch(queryHash, 1),
          envelope,
          envelopeTtlSeconds(envelope),
        );
        logJobBoardEvent("refresh_completed", {
          queryHash,
          durationMs: refreshTimings.totalMs,
          count: outcome.jobs.length,
        });
      } finally {
        // Always release, even if the refresh threw — otherwise the query is
        // locked out of refreshing until the TTL lapses.
        await lock.release();
      }
    },
    (error) =>
      logJobBoardEvent("refresh_completed", {
        queryHash,
        reason: error instanceof Error ? error.name : "unknown_error",
      }),
  );

  if (scheduled === "unavailable") {
    await lock.release();
    logJobBoardEvent("refresh_unavailable", {
      queryHash,
      reason: "no_request_scope",
    });
    return "unavailable";
  }

  logJobBoardEvent("refresh_scheduled", { queryHash, refreshMode: "after" });
  return "after";
}

/** Assemble the response, its metadata and the single `search_completed` line. */
async function respond(input: {
  jobs: NormalisedJob[];
  sessionId: string;
  currentPage: number;
  hasMore: boolean;
  counts: ProviderCount[];
  partialMessage?: string;
  cacheHit: "FRESH" | "STALE" | "MISS";
  refreshMode: string;
  store: CacheStore;
  providers: SearchJobProvider[];
  timings: SearchTimings;
  queryHash: string;
  userId: string | null;
  careerTrack?: {
    targetRoleTitle?: string;
    occupationFamily?: string;
    industry?: string;
    seniority?: string;
  };
  selectedCareerTrackId?: string;
  firstUsefulMs?: number;
}) {
  const health = await input.timings.measure("providerHealthMs", () =>
    readProviderHealthMap(input.store, input.providers),
  );
  if (input.firstUsefulMs !== undefined)
    input.timings.add("firstUsefulMs", input.firstUsefulMs);

  logJobBoardEvent("search_completed", {
    queryHash: input.queryHash,
    userId: input.userId,
    sessionId: input.sessionId,
    page: input.currentPage,
    cacheHit: input.cacheHit,
    cacheBackend: getCacheBackend(),
    refreshMode: input.refreshMode,
    count: input.jobs.length,
    durationMs: input.timings.totalMs,
    firstUsefulMs: input.firstUsefulMs,
    partial: Boolean(input.partialMessage),
  });

  const jobs = await input.timings.measure("snapshotMs", () =>
    materialiseSearchJobCards(input.jobs, input.userId, input.careerTrack),
  );

  return NextResponse.json({
    jobs,
    sessionId: input.sessionId,
    meta: {
      currentPage: input.currentPage,
      /** Authoritative: the client must not infer "more" from the page size. */
      hasMore: input.hasMore,
      providerCounts: input.counts,
      partialResults: Boolean(input.partialMessage),
      message: input.partialMessage,
      cached: input.cacheHit !== "MISS",
      /**
       * Honest cache state. `STALE` with a `refresh` of `after` means the page
       * shown is older than the fresh window and a refresh is genuinely running;
       * `unavailable` means it is not, and the next request will refresh it.
       */
      cacheState: input.cacheHit,
      refresh: input.refreshMode,
      cacheBackend: getCacheBackend(),
      providerHealth: Object.fromEntries(
        [...health].map(([provider, state]) => [provider, state.status]),
      ),
      timings: input.timings.snapshot(),
      providerResults: input.counts.map(({ provider, status }) => ({
        provider,
        status,
      })),
      ...(input.selectedCareerTrackId
        ? { selectedCareerTrackId: input.selectedCareerTrackId }
        : {}),
    },
  });
}
