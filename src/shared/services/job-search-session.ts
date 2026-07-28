/**
 * Load-more state for one search, held in the cache.
 *
 * WHAT THIS IS NOT. A search session is not product state. It records where a
 * pagination cursor had got to; losing it costs the user a "Load more" and
 * nothing else. Saved Jobs, analyses and every other durable artefact live in
 * PostgreSQL and are entirely unaffected by a session expiring, by a Redis
 * outage, or by the cache being unconfigured. Nothing may ever be written here
 * that is not reconstructable by searching again.
 *
 * WHY IT LEFT THE MODULE MAP. The previous `Map` was per-lambda-instance, so
 * "Load more" only worked if the follow-up request happened to land on the same
 * instance. On a different one the session was simply missing, the request was
 * treated as a fresh search, and the user was served page one again under a
 * Load-more button. Page repetition was the DEFAULT behaviour at any scale above
 * a single warm instance.
 *
 * OWNERSHIP. A session id is a bearer token for a pagination cursor. It carries
 * no personal data, but a signed-in user's session must not be resumable by
 * anyone else, so the owner is recorded as a HASH of the user id — enough to
 * compare, useless to read. A guest session records no owner and cannot be
 * resumed by a signed-in user (or vice versa): a mismatch is refused rather than
 * silently reassigned.
 */

import { randomUUID } from 'node:crypto';

import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import type { SearchJobProvider } from '@/shared/types/job';
import { hashToken, logJobBoardEvent } from './job-board-observability';

export interface JobSearchSession {
  id: string;
  queryHash: string;

  /** Last page fetched per provider. Absent means "not yet fetched". */
  providerPages: Partial<Record<SearchJobProvider, number>>;
  /** Reserved for cursor-paginating providers; the three live ones use pages. */
  providerCursors?: Partial<Record<SearchJobProvider, string | null>>;

  /** Providers that reported no further pages. Not re-queried on Load more. */
  exhaustedProviders: SearchJobProvider[];
  seenCanonicalJobIds: string[];

  createdAt: string;
  updatedAt: string;

  /**
   * `hashToken(userId)` for a signed-in session, null for a guest. Never a raw
   * user id, an email or a name.
   */
  ownerHash: string | null;
}

/**
 * Upper bound on remembered ids. A long Load-more run would otherwise grow one
 * cache value without limit, and an unbounded value in a shared cache is a
 * memory-exhaustion vector, not just untidy. Oldest ids are dropped first: they
 * are the least likely to reappear in a later page.
 */
const MAX_SEEN_IDS = 500;

export type SessionResolution =
  | { outcome: 'CREATED'; session: JobSearchSession }
  | { outcome: 'RESUMED'; session: JobSearchSession }
  /** Expired, evicted, or never existed. The caller should start a fresh search. */
  | { outcome: 'MISSING' }
  /** Belongs to another user, or the filters changed. Refused, never repurposed. */
  | { outcome: 'REJECTED'; reason: 'owner_mismatch' | 'query_mismatch' };

export function newSession(queryHash: string, userId: string | null): JobSearchSession {
  const now = new Date().toISOString();
  return {
    // randomUUID is a CSPRNG, so a guest session id is unguessable — it cannot
    // be derived from a query, a timestamp or a counter.
    id: randomUUID(),
    queryHash,
    providerPages: {},
    exhaustedProviders: [],
    seenCanonicalJobIds: [],
    createdAt: now,
    updatedAt: now,
    ownerHash: userId ? hashToken(userId) : null,
  };
}

export async function loadSession(store: CacheStore, sessionId: string): Promise<JobSearchSession | null> {
  const stored = await store.get<JobSearchSession>(cacheKeys.searchSession(sessionId));
  // A value that is not a well-formed session (older schema, partial write) is
  // treated as absent. The caller then starts a fresh search, which is correct.
  if (!stored || typeof stored.queryHash !== 'string' || !Array.isArray(stored.seenCanonicalJobIds)) return null;
  return stored;
}

export async function saveSession(store: CacheStore, session: JobSearchSession): Promise<void> {
  await store.set(cacheKeys.searchSession(session.id), session, CACHE_TTL_SECONDS.searchSession);
}

/**
 * Resolve the session a request should use.
 *
 * A request with no `sessionId` always starts a new one. A request WITH one must
 * match both the owner and the query — the second check is what stops a Load
 * more from silently paging a different filter set, which would interleave two
 * result sets under one list.
 */
export async function resolveSession(
  store: CacheStore,
  input: { sessionId?: string; queryHash: string; userId: string | null }
): Promise<SessionResolution> {
  if (!input.sessionId) {
    const session = newSession(input.queryHash, input.userId);
    logJobBoardEvent('session_created', { sessionId: session.id, queryHash: input.queryHash, userId: input.userId });
    return { outcome: 'CREATED', session };
  }

  const session = await loadSession(store, input.sessionId);
  if (!session) {
    // Expected and benign: a TTL lapse, an eviction, or a Redis outage. The
    // caller degrades to a fresh first page rather than erroring.
    logJobBoardEvent('session_missing', { sessionId: input.sessionId, queryHash: input.queryHash });
    return { outcome: 'MISSING' };
  }

  const requesterHash = input.userId ? hashToken(input.userId) : null;
  if ((session.ownerHash ?? null) !== requesterHash) {
    logJobBoardEvent('session_rejected', { sessionId: session.id, reason: 'owner_mismatch' });
    return { outcome: 'REJECTED', reason: 'owner_mismatch' };
  }
  if (session.queryHash !== input.queryHash) {
    logJobBoardEvent('session_rejected', { sessionId: session.id, reason: 'query_mismatch' });
    return { outcome: 'REJECTED', reason: 'query_mismatch' };
  }

  logJobBoardEvent('session_resumed', { sessionId: session.id, queryHash: input.queryHash, userId: input.userId });
  return { outcome: 'RESUMED', session };
}

/**
 * The page to request from each provider next.
 *
 * Per-provider rather than one shared counter, because the providers do not
 * exhaust together: when Reed has run out at page 3 and Adzuna still has pages,
 * a shared counter either re-asks Reed for a page it has already said is empty
 * or holds Adzuna back. An exhausted provider is dropped from the fan-out
 * entirely.
 */
export function nextProviderPages(
  session: JobSearchSession,
  providers: readonly SearchJobProvider[]
): Partial<Record<SearchJobProvider, number>> {
  const pages: Partial<Record<SearchJobProvider, number>> = {};
  for (const provider of providers) {
    if (session.exhaustedProviders.includes(provider)) continue;
    pages[provider] = (session.providerPages[provider] ?? 0) + 1;
  }
  return pages;
}

/** Providers still worth asking. Empty means the search is fully exhausted. */
export function activeProviders(
  session: JobSearchSession,
  providers: readonly SearchJobProvider[]
): SearchJobProvider[] {
  return providers.filter((provider) => !session.exhaustedProviders.includes(provider));
}

/** Fold one page's outcome into the session. Pure — the caller persists it. */
export function recordPage(
  session: JobSearchSession,
  outcome: {
    pages: Partial<Record<SearchJobProvider, number>>;
    exhausted: readonly SearchJobProvider[];
    shownCanonicalJobIds: readonly string[];
  }
): JobSearchSession {
  const seen = [...session.seenCanonicalJobIds, ...outcome.shownCanonicalJobIds];
  return {
    ...session,
    providerPages: { ...session.providerPages, ...outcome.pages },
    exhaustedProviders: [...new Set([...session.exhaustedProviders, ...outcome.exhausted])],
    seenCanonicalJobIds: [...new Set(seen)].slice(-MAX_SEEN_IDS),
    updatedAt: new Date().toISOString(),
  };
}

/** How many pages this session has served. 1-based, for response metadata. */
export function servedPageCount(session: JobSearchSession): number {
  return Math.max(1, ...Object.values(session.providerPages).map((page) => page ?? 0));
}
