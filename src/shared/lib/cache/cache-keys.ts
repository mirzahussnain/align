/**
 * The single vocabulary of Job Board cache keys.
 *
 * Keys are built here and nowhere else so that a namespace can be reasoned
 * about, invalidated and audited as a set. Two conventions carry weight:
 *
 *  - Every key starts with {@link CACHE_SCHEMA_VERSION}. Bumping it retires every
 *    previously cached value at once, which is the safe response to changing a
 *    cached value's SHAPE — a stale payload deserialised into a new type is a
 *    class of bug that TTLs do not prevent.
 *  - Sponsor keys embed the register version. Register evidence must never
 *    outlive the register it came from, so a new download changes the key rather
 *    than racing an expiry.
 *
 * Components are encoded, so a value containing `:` cannot forge a key boundary.
 */

import type { JobProvider } from '@/shared/types/job';

/** Bump when any cached VALUE SHAPE changes. Not for TTL or policy changes. */
export const CACHE_SCHEMA_VERSION = 'v1';

const NAMESPACE = 'jobs';

/** Encode one component so it cannot introduce a separator. */
const part = (value: string | number): string => encodeURIComponent(String(value));

const key = (...segments: (string | number)[]): string =>
  [CACHE_SCHEMA_VERSION, NAMESPACE, ...segments.map(part)].join(':');

export const cacheKeys = {
  /** Raw provider response for one query page, before normalisation. */
  providerResponse: (provider: JobProvider, queryHash: string, cursor: string) =>
    key('provider', provider, queryHash, cursor),

  /** Normalised jobs for one provider query page. */
  providerNormalised: (provider: JobProvider, queryHash: string, cursor: string) =>
    key('provider-normalised', provider, queryHash, cursor),

  /** Fully merged, deduplicated search response for one page. */
  mergedSearch: (queryHash: string, page: number) => key('search', queryHash, page),

  /** Metadata driving stale-while-revalidate for a merged search page. */
  searchFreshness: (queryHash: string, page: number) => key('search-meta', queryHash, page),

  /** Refresh lock: held by whichever request is repopulating a query. */
  searchRefreshLock: (queryHash: string) => key('lock', 'search', queryHash),

  /** Sponsor-register match for one normalised employer, per register version. */
  sponsorMatch: (registerVersion: string, normalisedEmployer: string) =>
    key('sponsor', registerVersion, normalisedEmployer),

  /** Lock guarding a sponsor-register download so N instances fetch once. */
  sponsorRefreshLock: (registerVersion: string) => key('lock', 'sponsor', registerVersion),

  /** Rolling provider health (recent failures/timeouts) for status display. */
  providerHealth: (provider: JobProvider) => key('provider-health', provider),

  /** Short-lived Load-more cursor state for one search session. */
  searchSession: (sessionId: string) => key('session', sessionId),

  /** Cached vacancy listing for one employer-ATS board. */
  employerBoard: (provider: JobProvider, providerIdentifier: string) =>
    key('employer-board', provider, providerIdentifier),
} as const;

/**
 * TTLs in seconds, in one place so the fresh/stale policy is legible.
 *
 * `searchFresh` vs `searchStale` is the stale-while-revalidate window: inside
 * `searchFresh` a hit is served straight back; between the two a hit is still
 * served immediately but triggers a background refresh; past `searchStale` the
 * value is gone. `searchStale` is therefore the KEY's TTL and `searchFresh` is a
 * timestamp comparison against the stored metadata, not a second expiry.
 */
export const CACHE_TTL_SECONDS = {
  /** Fresh window for a provider page: served straight back, no refresh. */
  providerResponse: 5 * 60,
  /**
   * Stale window for a provider page, and therefore the KEY's actual TTL.
   * Between `providerResponse` and here a cached page is still usable — a
   * fifteen-minute-old vacancy list is a far better answer than a spinner or an
   * empty page when the provider is slow or down.
   */
  providerStale: 30 * 60,
  providerNormalised: 5 * 60,
  searchFresh: 5 * 60,
  searchStale: 45 * 60,
  searchRefreshLock: 30,
  /** Employer matches change only when the register does; the key is versioned. */
  sponsorMatch: 24 * 60 * 60,
  sponsorRefreshLock: 5 * 60,
  providerHealth: 10 * 60,
  searchSession: 15 * 60,
  employerBoard: 60 * 60,
} as const;
