// PII-safe structured logging and timing for the Job Board search path.
//
// Modelled directly on `reservation-observability.ts`, which is this
// repository's convention for structured logging: an enumerated event
// vocabulary, an ALLOW-LISTED metadata bag, primitives only, one JSON line per
// event on the console transport.
//
// PRIVACY CONTRACT. A record may only carry the fields on {@link SafeJobLogMeta},
// and `sanitizeJobMeta` drops everything else before emit. There is deliberately
// no field able to hold a job description, a pasted description, CV data, visa
// or profile information, an API key, a raw provider payload, a raw query
// string or a raw employer name. Query and employer identity appear ONLY as
// hashes, which is enough to correlate two requests without recording what the
// user actually searched for.

import { createHash } from 'node:crypto';

import type { JobProvider, ProviderSearchStatus } from '@/shared/types/job';

/** The fixed event vocabulary. A typo is a compile error, not a lost event. */
export type JobBoardEvent =
  | 'search_started'
  | 'search_completed'
  | 'cache_hit'
  | 'cache_miss'
  | 'cache_stale_served'
  | 'cache_backend_error'
  | 'cache_unconfigured'
  | 'provider_fetch_started'
  | 'provider_fetch_completed'
  | 'provider_deadline_reached'
  | 'provider_health_degraded'
  | 'refresh_lock_acquired'
  | 'refresh_lock_lost'
  | 'refresh_scheduled'
  | 'refresh_unavailable'
  | 'refresh_completed'
  | 'session_created'
  | 'session_resumed'
  | 'session_missing'
  | 'session_rejected'
  | 'sponsor_match_cached'
  | 'sponsor_match_computed'
  | 'sponsor_company_enriched'
  | 'sponsor_check_unavailable'
  | 'company_link_resolved'
  | 'practical_comparison_completed'
  | 'vacancy_intelligence_stage'
  | 'vacancy_intelligence_completed';

/** Where a cached value came from, for honest hit-rate accounting. */
export type CacheHitKind = 'FRESH' | 'STALE' | 'MISS';

/**
 * The ONLY metadata a Job Board log line may carry. Every field is an id, a
 * hash, a status, a count, a duration or a boolean — non-sensitive by
 * construction.
 */
export interface SafeJobLogMeta {
  /** Coarse provider label, e.g. "REED". Never a key or credential. */
  provider?: JobProvider | string;
  /** Provider outcome (SUCCESS / TIMED_OUT / PENDING / …). */
  providerStatus?: ProviderSearchStatus | string;
  /** Which backend served the cache: redis / injected / disabled. */
  cacheBackend?: string;
  /** FRESH / STALE / MISS. */
  cacheHit?: CacheHitKind | string;
  /** Which cache the event concerns, e.g. "provider" | "search" | "sponsor". */
  cacheLayer?: string;
  /** Store operation name on a backend error, e.g. "get". */
  operation?: string;
  /** Hash of the canonical query. NEVER the query text itself. */
  queryHash?: string;
  /** Opaque search-session id (a UUID, derived from nothing user-supplied). */
  sessionId?: string;
  /** 1-based result page. */
  page?: number;
  /** Hashed, non-reversible user token. Prefer over a raw user id. */
  userHash?: string;
  /** Wall-clock duration of the step in milliseconds. */
  durationMs?: number;
  /** Time from request start to the first usable provider result. */
  firstUsefulMs?: number;
  /** Counts — of jobs, providers, employers. Never their content. */
  count?: number;
  /**
   * Practical-compatibility outcome counts ONLY. These are tallies of comparison
   * items, deliberately never the fields compared: a log line may say "3 unknown"
   * but can never say which facts, nor any visa status, location or licence value.
   */
  confirmedCount?: number;
  conflictCount?: number;
  unknownCount?: number;
  notApplicableCount?: number;
  /** Age of a served cache entry, for stale-serving visibility. */
  ageMs?: number;
  /** Short, credential-free failure reason code. Never a raw error message. */
  reason?: string;
  /** Whether the response was assembled without every provider answering. */
  partial?: boolean;
  /** Sponsor register version token the evidence was drawn from. */
  registerVersion?: string;
  /** How a post-response refresh was (or was not) scheduled. */
  refreshMode?: string;
}

/** Keys allowed on a sanitized record. Anything else is dropped before emit. */
const ALLOWED_KEYS: ReadonlyArray<keyof SafeJobLogMeta> = [
  'provider',
  'providerStatus',
  'cacheBackend',
  'cacheHit',
  'cacheLayer',
  'operation',
  'queryHash',
  'sessionId',
  'page',
  'userHash',
  'durationMs',
  'firstUsefulMs',
  'count',
  'confirmedCount',
  'conflictCount',
  'unknownCount',
  'notApplicableCount',
  'ageMs',
  'reason',
  'partial',
  'registerVersion',
  'refreshMode',
];

/** Short, stable, non-reversible token. Used for user ids AND query strings. */
export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/**
 * Drop every key not on the allow-list and keep only primitives. This is the
 * privacy backstop: even if a caller passes a description, a provider payload or
 * an error object, it cannot reach the sink.
 */
export function sanitizeJobMeta(meta: Record<string, unknown>): SafeJobLogMeta {
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const value = meta[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return safe as SafeJobLogMeta;
}

export type JobLogSink = (record: Record<string, unknown>) => void;

const defaultSink: JobLogSink = (record) => {
  const level = record.severity === 'error' ? 'error' : record.severity === 'warn' ? 'warn' : 'info';
  console[level](`[job-board] ${JSON.stringify(record)}`);
};

let sink: JobLogSink = defaultSink;

/** Swap the sink (tests). Returns a restore function. */
export function __setJobLogSink(next: JobLogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

/** Events that represent a genuine degradation rather than normal operation. */
const WARN_EVENTS = new Set<JobBoardEvent>([
  'cache_backend_error',
  'cache_unconfigured',
  'provider_deadline_reached',
  'provider_health_degraded',
  'refresh_unavailable',
  'sponsor_check_unavailable',
  'session_missing',
  'session_rejected',
]);

/**
 * Emit one event. A caller may pass `userId` or a raw `query`; both are hashed
 * and dropped in favour of `userHash` / `queryHash`, so neither the identifier
 * nor the search text is ever emitted in the clear.
 */
export function logJobBoardEvent(
  event: JobBoardEvent,
  meta: SafeJobLogMeta & { userId?: string | null; query?: string } = {}
): void {
  const { userId, query, ...rest } = meta;
  const safe = sanitizeJobMeta(rest as Record<string, unknown>);
  if (userId && !safe.userHash) safe.userHash = hashToken(userId);
  if (query && !safe.queryHash) safe.queryHash = hashToken(query);
  sink({
    evt: event,
    severity: WARN_EVENTS.has(event) ? 'warn' : 'info',
    ...safe,
  });
}

/** `const done = startTimer(); …; done()` → elapsed milliseconds. */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/**
 * Per-request timing accumulator for the search path.
 *
 * Every stage the brief asks to be measured records into one bag, which is
 * emitted once with `search_completed` and echoed in the response's `meta` so a
 * slow search can be attributed without re-running it. Durations only — no stage
 * ever records what it was working on.
 */
export class SearchTimings {
  private readonly stages = new Map<string, number>();
  private readonly startedAt = Date.now();

  /** Time an async stage and return its result unchanged. */
  async measure<T>(stage: string, work: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      return await work();
    } finally {
      this.add(stage, Date.now() - started);
    }
  }

  /** Time a synchronous stage and return its result unchanged. */
  measureSync<T>(stage: string, work: () => T): T {
    const started = Date.now();
    try {
      return work();
    } finally {
      this.add(stage, Date.now() - started);
    }
  }

  /** Record a duration measured elsewhere. Repeat calls accumulate. */
  add(stage: string, ms: number): void {
    this.stages.set(stage, (this.stages.get(stage) ?? 0) + ms);
  }

  /** Record a point-in-time mark, measured from the request's start. */
  mark(stage: string): void {
    if (!this.stages.has(stage)) this.stages.set(stage, Date.now() - this.startedAt);
  }

  get totalMs(): number {
    return Date.now() - this.startedAt;
  }

  /** A flat `{ stage: ms }` bag plus the total. Safe to serialise anywhere. */
  snapshot(): Record<string, number> {
    return { ...Object.fromEntries(this.stages), totalMs: this.totalMs };
  }
}
