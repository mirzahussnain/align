/**
 * Fresh/stale metadata carried inside the cached value.
 *
 * {@link CacheStore} exposes ONE physical TTL, because that is all Redis gives
 * you per key. Stale-while-revalidate needs two boundaries: a `freshUntil`
 * before which a hit is simply correct, and a `staleUntil` after which the value
 * is gone. Encoding the first in the payload and using the second as the key's
 * TTL gets both from one `SET … EX`, with no second key to keep consistent and
 * no chance of the metadata outliving (or predeceasing) the value it describes.
 *
 * A consequence worth stating: `freshUntil` is a TIMESTAMP COMPARISON, not an
 * expiry. Redis never removes a merely-stale entry — the reader classifies it.
 * That is the whole point, since a stale entry is what SWR serves.
 */

/** A cached value plus the two boundaries that classify it. ISO-8601 throughout. */
export interface CacheEnvelope<T> {
  value: T;
  createdAt: string;
  freshUntil: string;
  staleUntil: string;
}

/** How a reader should treat what came back. */
export type CacheFreshness =
  /** Present and inside its fresh window: serve it, do nothing else. */
  | 'FRESH'
  /** Present but past `freshUntil`: serve it AND try to refresh. */
  | 'STALE'
  /** Absent, expired, or unreadable: there is nothing to serve. */
  | 'MISS';

export type CacheRead<T> =
  | { freshness: 'FRESH' | 'STALE'; value: T; ageMs: number }
  | { freshness: 'MISS'; value: null; ageMs: null };

const MISS = { freshness: 'MISS', value: null, ageMs: null } as const;

export function createEnvelope<T>(
  value: T,
  freshSeconds: number,
  staleSeconds: number,
  now: number = Date.now()
): CacheEnvelope<T> {
  // A stale window shorter than the fresh window would produce an entry that
  // expires while still claiming to be fresh. Clamping here means no caller can
  // configure that contradiction into existence.
  const stale = Math.max(freshSeconds, staleSeconds);
  return {
    value,
    createdAt: new Date(now).toISOString(),
    freshUntil: new Date(now + freshSeconds * 1000).toISOString(),
    staleUntil: new Date(now + stale * 1000).toISOString(),
  };
}

/**
 * A stored envelope's remaining physical lifetime, which is what the key's TTL
 * must be set to. Rounded up so a sub-second remainder is never truncated to a
 * zero TTL, which {@link CacheStore.set} treats as "do not cache".
 */
export function envelopeTtlSeconds(envelope: CacheEnvelope<unknown>, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(envelope.staleUntil) - now) / 1000));
}

/**
 * Classify what `get` returned. Anything that is not a well-formed envelope is a
 * MISS rather than an error: a cache read must never be able to fail a request,
 * and a payload written by an older schema is exactly the case
 * {@link CACHE_SCHEMA_VERSION} exists to retire — but a defensive miss costs one
 * upstream call, where trusting a malformed shape costs a runtime crash.
 */
export function readEnvelope<T>(stored: unknown, now: number = Date.now()): CacheRead<T> {
  if (!isEnvelope<T>(stored)) return MISS;

  const staleUntil = Date.parse(stored.staleUntil);
  const freshUntil = Date.parse(stored.freshUntil);
  const createdAt = Date.parse(stored.createdAt);
  if (Number.isNaN(staleUntil) || Number.isNaN(freshUntil) || Number.isNaN(createdAt)) return MISS;

  if (now >= staleUntil) return MISS;
  return {
    freshness: now < freshUntil ? 'FRESH' : 'STALE',
    value: stored.value,
    ageMs: Math.max(0, now - createdAt),
  };
}

function isEnvelope<T>(stored: unknown): stored is CacheEnvelope<T> {
  if (typeof stored !== 'object' || stored === null) return false;
  const candidate = stored as Partial<CacheEnvelope<T>>;
  return (
    'value' in candidate &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.freshUntil === 'string' &&
    typeof candidate.staleUntil === 'string'
  );
}
