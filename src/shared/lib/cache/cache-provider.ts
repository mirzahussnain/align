/**
 * The single place that decides WHICH {@link CacheStore} backs the application.
 *
 * Resolution, in order:
 *
 *   an explicitly injected store   → that store           (tests)
 *   REDIS_URL is set               → RedisCacheStore      (local Docker, prod)
 *   nothing configured             → DisabledCacheStore   (every read a miss)
 *
 * The unconfigured case is deliberately NOT a MemoryCacheStore. A per-instance
 * Map is precisely the production-critical state this phase removes: on a
 * serverless platform it is invisible to every other invocation, so it makes a
 * missing configuration look like a working cache in development and a mystery
 * in production. Failing to a real, honest miss keeps the degradation legible.
 * `MemoryCacheStore` remains available and is used wherever it is EXPLICITLY
 * injected — which is what the test suite does.
 *
 * The resolved store is wrapped in `resilientCache`, so a Redis outage produces
 * misses and no-ops rather than exceptions. Nothing upstream — provider search,
 * authentication, PostgreSQL-backed features, canonical analysis — can be failed
 * by this module.
 */

import type { CacheStore } from './cache-store';
import { resilientCache } from './cache-store';
import { RedisCacheStore } from './redis-cache-store';
import { logJobBoardEvent } from '@/shared/services/job-board-observability';

/** How the live cache is currently backed. Surfaced for diagnostics and tests. */
export type CacheBackend = 'redis' | 'injected' | 'disabled';

/**
 * A store that holds nothing. Every read misses, every write is dropped, and no
 * lock is ever granted — the same shape a totally unreachable Redis presents, so
 * the degraded path is the one already exercised by the failure tests.
 */
// Typed as `CacheStore` rather than declared as a class, so the members need no
// parameter list to stay callable — the declared type supplies the signatures.
export const disabledCacheStore: CacheStore = {
  async get() {
    return null;
  },
  async set() {},
  async delete() {},
  async setIfAbsent() {
    // Never hand out a lock nobody can see. A caller that believed it held one
    // would suppress a refresh that is not actually happening anywhere.
    return false;
  },
};

let resolved: CacheStore | null = null;
let backend: CacheBackend = 'disabled';
let injected: CacheStore | null = null;
/** Emitted once per process, not once per request — an outage is not a log flood. */
let warnedUnconfigured = false;

function build(): { store: CacheStore; backend: CacheBackend } {
  if (injected) return { store: injected, backend: 'injected' };

  const url = process.env.REDIS_URL?.trim();
  if (url) {
    const store = new RedisCacheStore({
      url,
      logger: (event, detail) =>
        logJobBoardEvent('cache_backend_error', {
          cacheBackend: 'redis',
          reason: `${event}:${detail.reason}`,
          operation: detail.operation,
        }),
    });
    return { store, backend: 'redis' };
  }

  if (!warnedUnconfigured) {
    warnedUnconfigured = true;
    logJobBoardEvent('cache_unconfigured', {
      cacheBackend: 'disabled',
      reason: 'REDIS_URL_not_set',
    });
  }
  return { store: disabledCacheStore, backend: 'disabled' };
}

/**
 * The application's cache. Memoised per process: constructing a Redis client per
 * request would open a connection per request, which is the failure mode
 * serverless platforms punish hardest.
 */
export function getCacheStore(): CacheStore {
  if (!resolved) {
    const built = build();
    backend = built.backend;
    resolved = resilientCache(built.store, (operation, error) =>
      logJobBoardEvent('cache_backend_error', {
        cacheBackend: backend,
        operation,
        reason: error instanceof Error ? error.name : 'unknown_error',
      })
    );
  }
  return resolved;
}

/** Which backend {@link getCacheStore} resolved to. Resolves it if it has not yet. */
export function getCacheBackend(): CacheBackend {
  getCacheStore();
  return backend;
}

/**
 * Install a store for the duration of a test. Returns a restore function, so a
 * suite cannot leak its store into the next one.
 */
export function __setCacheStore(store: CacheStore | null): () => void {
  const previousInjected = injected;
  injected = store;
  resolved = null;
  return () => {
    injected = previousInjected;
    resolved = null;
  };
}

/** Drop the memoised store so the next call re-reads the environment. */
export function __resetCacheStore(): void {
  resolved = null;
  warnedUnconfigured = false;
}
