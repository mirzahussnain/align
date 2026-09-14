/**
 * Redis implementation of {@link CacheStore}.
 *
 * THIS IS THE ONLY FILE IN THE APPLICATION THAT KNOWS REDIS EXISTS. Provider
 * adapters, route handlers, React components, the sponsor services and the
 * normalisation services all depend on the four-method interface, so the backing
 * store can move to Upstash — or to memory in a test — without any of them
 * changing. Everything Redis-shaped is owned here: serialisation, TTL
 * translation, the connection lifecycle, command errors and logging.
 *
 * CONNECTION POSTURE. The deployment target is serverless, so a lambda may be
 * frozen mid-connection and thawed minutes later. Two properties matter, and
 * they pull against each other:
 *
 *   lazyConnect            no socket until the first command, so importing this
 *                          module in a route that never touches the cache (or in
 *                          a test) opens nothing.
 *   bounded failure        an unreachable Redis must cost milliseconds, never a
 *                          hung request.
 *
 * The tempting way to get the second is `enableOfflineQueue: false`, so a
 * command issued while disconnected rejects instead of buffering. COMBINED WITH
 * `lazyConnect` THAT IS BROKEN: nothing has connected yet when the first command
 * arrives, there is no queue to hold it, and every first command fails with
 * "Stream isn't writeable". The cache would then miss 100% of the time on a
 * healthy server — silently, since `resilientCache` turns the rejection into a
 * miss. The integration tests catch exactly this.
 *
 * So the offline queue stays ENABLED — it is what lets a lazily-connected client
 * accept commands during its initial handshake — and the latency bound is
 * enforced here instead, by {@link withDeadline} around every command. That
 * makes the bound explicit and independent of ioredis's internal queueing rules,
 * rather than an emergent property of three interacting options.
 *
 * Every rejection here is expected to be caught by `resilientCache`, which turns
 * it into a miss. This class deliberately does NOT swallow errors itself — a
 * store that silently returns null is impossible to test for failure, and the
 * resilience decision belongs to the composition root, not the adapter.
 */

import Redis, { type RedisOptions } from 'ioredis';

import type { CacheStore } from './cache-store';

/**
 * Physical key prefix. The Phase 1 vocabulary in `cache-keys.ts` builds LOGICAL
 * keys (`v1:jobs:…`); this prepends the application namespace so one Redis can
 * be shared with another service, and so `--scan --pattern "align:*"` finds
 * exactly this application's keys and nothing else.
 */
export const REDIS_KEY_PREFIX = 'align:';

/** Emitted on connection and command failure. Never carries a key's VALUE. */
export type RedisCacheLogger = (
  event: 'connection_failed' | 'command_failed' | 'connection_closed',
  detail: { operation?: string; reason: string }
) => void;

export interface RedisCacheStoreOptions {
  url: string;
  keyPrefix?: string;
  logger?: RedisCacheLogger;
  /** Hard ceiling on any single command, connection time included. */
  commandTimeoutMs?: number;
  /** Injected in tests to assert lifecycle without a container. */
  client?: Redis;
}

/** Bounded so a cache read can never become the slowest part of a request. */
const DEFAULT_COMMAND_TIMEOUT_MS = 1_000;

/**
 * Reject with a named `TimeoutError` after `ms`, whatever the underlying client
 * is doing. This is the latency bound: it holds whether the command is on the
 * wire, waiting on a handshake, or sitting in the offline queue.
 */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('redis command timed out');
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * A connection error reaches us as an `Error` whose message can embed the URL,
 * and the URL can embed a password (`redis://:secret@host`). Reduce every error
 * to a short, credential-free reason before it is ever logged.
 */
export function safeReason(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown_error';
  const code = (error as NodeJS.ErrnoException).code;
  if (code) return code;
  // Strip anything resembling `scheme://user:pass@` from the message.
  return error.message.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]*/gi, '[redacted-url]').slice(0, 120);
}

/** TLS, host and credentials all come from the URL, so these are URL-independent. */
export function redisOptions(): RedisOptions {
  return {
    // No socket until the first command: a route that never touches the cache,
    // and every unit test, opens no connection at all.
    lazyConnect: true,
    // MUST stay true. See the note at the top of this file: with `lazyConnect`,
    // disabling it makes the first command of every connection fail.
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    // Give up quickly and let the NEXT request retry from a clean slate. An
    // unbounded reconnect loop in a frozen lambda is wasted wall-clock at best
    // and a connection leak at worst.
    retryStrategy: (attempt) => (attempt > 3 ? null : Math.min(attempt * 100, 500)),
    // TLS for rediss:// URLs is derived from the URL by ioredis.
  };
}

export class RedisCacheStore implements CacheStore {
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private readonly logger?: RedisCacheLogger;
  private readonly commandTimeoutMs: number;

  constructor(options: RedisCacheStoreOptions) {
    this.keyPrefix = options.keyPrefix ?? REDIS_KEY_PREFIX;
    this.logger = options.logger;
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    this.client = options.client ?? new Redis(options.url, redisOptions());

    // ioredis emits `error` on every failed connection attempt. Without a
    // listener Node treats it as an unhandled 'error' event and crashes the
    // process — so an unreachable Redis would take the whole server down, which
    // is the exact opposite of the degradation this phase promises.
    this.client.on('error', (error) => {
      this.logger?.('connection_failed', { reason: safeReason(error) });
    });
    this.client.on('end', () => {
      this.logger?.('connection_closed', { reason: 'client_end' });
    });
  }

  private physical(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /** Run one command under the latency bound, logging (but not hiding) failure. */
  private async run<T>(operation: string, work: () => Promise<T>): Promise<T> {
    try {
      return await withDeadline(work(), this.commandTimeoutMs);
    } catch (error) {
      this.logger?.('command_failed', { operation, reason: safeReason(error) });
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.run('get', () => this.client.get(this.physical(key)));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A value we cannot parse is a value from an incompatible schema. Treat it
      // as absent and drop it, rather than throwing on every future read of a
      // key that will not expire for hours.
      void this.client.del(this.physical(key)).catch(() => undefined);
      this.logger?.('command_failed', { operation: 'get', reason: 'unparseable_value' });
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // Matches MemoryCacheStore: a non-positive TTL means "do not cache", never
    // "cache forever" (which is what Redis does with EX 0 rejected / omitted).
    if (ttlSeconds <= 0) return;
    await this.run('set', () =>
      this.client.set(this.physical(key), JSON.stringify(value), 'EX', Math.ceil(ttlSeconds))
    );
  }

  async delete(key: string): Promise<void> {
    await this.run('delete', () => this.client.del(this.physical(key)));
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (ttlSeconds <= 0) return false;
    // JSON-encoded like every other value. THE INVARIANT IS "everything in Redis
    // under this prefix is JSON": storing a lock token raw made `get` on that key
    // throw on parse, which this class treats as a corrupt value — so reading a
    // lock deleted it, and the owner check in `refresh-lock` compared against a
    // key that no longer existed.
    //
    // SET key value EX ttl NX — one atomic round trip. `null` means the key
    // already existed, i.e. somebody else holds the lock.
    const outcome = await this.run('setIfAbsent', () =>
      this.client.set(this.physical(key), JSON.stringify(value), 'EX', Math.ceil(ttlSeconds), 'NX')
    );
    return outcome === 'OK';
  }

  /**
   * Release a lock ONLY if this caller still owns it, as one atomic script.
   * A plain `DEL` would let a slow holder whose lock had already expired delete
   * the lock a different request has since acquired.
   *
   * Not part of {@link CacheStore}: it is meaningful only where a compare-and-
   * delete exists, and callers reach it through `refresh-lock.ts`, which
   * degrades to "let it expire" on stores that cannot do this.
   */
  async deleteIfValueMatches(key: string, expected: string): Promise<boolean> {
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    // Compared in its STORED form, so this matches what `setIfAbsent` wrote.
    const removed = await this.run('deleteIfValueMatches', () =>
      this.client.eval(script, 1, this.physical(key), JSON.stringify(expected))
    );
    return removed === 1;
  }

  /** Close the connection. Used by tests and by any long-lived process shutdown. */
  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
