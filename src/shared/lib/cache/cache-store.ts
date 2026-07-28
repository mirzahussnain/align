/**
 * Provider-neutral cache contract.
 *
 * THE RULE THIS ENCODES: a cache holds fast, disposable, reconstructable state.
 * PostgreSQL holds durable product state. Nothing whose loss would lose user
 * work — a saved job, a pasted description, a snapshot an analysis references —
 * may live only here. Losing every key in this store must degrade latency and
 * nothing else.
 *
 * Job-domain services depend on this interface, never on a Redis client, so the
 * backing store can move from local Docker Redis to Upstash (or to memory in
 * tests) without a domain change. It is deliberately four methods: enough for
 * read-through caching, TTL expiry and a refresh lock, and no more.
 */

export interface CacheStore {
  /** The cached value, or null when absent or expired. */
  get<T>(key: string): Promise<T | null>;

  /** Store a value under a TTL. A non-positive TTL is a no-op, never a leak. */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;

  delete(key: string): Promise<void>;

  /**
   * Atomically claim a key only if it is currently unset (Redis `SET NX EX`).
   * Returns true to the single caller that won.
   *
   * This is the refresh lock: it stops N concurrent identical searches from each
   * firing the same provider request. It is a best-effort coordination hint, not
   * a correctness lock — a lost lock costs a duplicate upstream call, never a
   * wrong result, so no caller may depend on it for exclusivity.
   */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

/**
 * A cache is an optimisation, so a backend failure must never fail the request
 * that used it. Wrapping a store makes every read return null and every write a
 * no-op when the backend is unreachable, which degrades to "always a miss".
 */
export function resilientCache(store: CacheStore, onError?: (operation: string, error: unknown) => void): CacheStore {
  const swallow = (operation: string) => (error: unknown) => {
    onError?.(operation, error);
    return undefined;
  };
  return {
    async get<T>(key: string) {
      return (await store.get<T>(key).catch(swallow('get'))) ?? null;
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      await store.set(key, value, ttlSeconds).catch(swallow('set'));
    },
    async delete(key: string) {
      await store.delete(key).catch(swallow('delete'));
    },
    async setIfAbsent(key: string, value: string, ttlSeconds: number) {
      // An unreachable backend must not hand out the lock — treat it as lost, so
      // callers fall back to their uncoordinated (but correct) path.
      return (await store.setIfAbsent(key, value, ttlSeconds).catch(swallow('setIfAbsent'))) ?? false;
    },
  };
}
