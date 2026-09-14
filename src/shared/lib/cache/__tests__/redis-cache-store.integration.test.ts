// Real Redis proof of the cache adapter.
//
// The MemoryCacheStore suite proves the SEMANTICS; only a real server proves
// serialisation across a wire, that `EX` actually expires a key, that `SET NX`
// is atomic under genuine concurrency, and that the compare-and-delete script
// runs. SKIPPED unless REDIS_URL points at a local container.
//
// Run it with the local environment:
//   npm run redis:up && npm run test:redis

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const isLocalRedis = /^rediss?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?/.test(redisUrl);

const { RedisCacheStore } = await import('../redis-cache-store');
const { acquireRefreshLock } = await import('../refresh-lock');
const { createEnvelope, envelopeTtlSeconds, readEnvelope } = await import('../cache-envelope');

// A per-run prefix so a developer's real cache is never read or clobbered, and
// so concurrent runs cannot collide.
const prefix = `align-test:${Date.now()}:${Math.random().toString(36).slice(2)}:`;
const store = isLocalRedis ? new RedisCacheStore({ url: redisUrl, keyPrefix: prefix }) : (null as never);

/** A bare client, used to plant payloads the store itself could not write. */
const { default: Redis } = isLocalRedis ? await import('ioredis') : { default: null as never };
const rawClient = isLocalRedis ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }) : (null as never);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterAll(async () => {
  if (!isLocalRedis) return;
  // Leave no test keys behind in a developer's container.
  const keys = await rawClient.keys(`${prefix}*`);
  if (keys.length) await rawClient.del(...keys);
  await store.disconnect();
  await rawClient.quit();
});

describe.skipIf(!isLocalRedis)('RedisCacheStore serialisation', () => {
  beforeEach(async () => {
    await store.delete('key');
  });

  it('round-trips a nested object without identity aliasing', async () => {
    const value = {
      jobs: [{ title: 'Support Engineer', providerReferences: [{ provider: 'REED' }] }],
      counts: [{ provider: 'REED', uniqueContributed: 1 }],
      nested: { deep: { flag: true, n: 42 } },
    };
    await store.set('key', value, 60);
    const read = await store.get<typeof value>('key');

    expect(read).toEqual(value);
    // A serialising backend hands back a distinct object, so a caller cannot
    // mutate the cache through a reference it kept.
    expect(read).not.toBe(value);
  });

  it('preserves the types JSON can carry and reports absence as null', async () => {
    await store.set('key', { n: 0, s: '', b: false, arr: [], nil: null }, 60);
    expect(await store.get('key')).toEqual({ n: 0, s: '', b: false, arr: [], nil: null });
    expect(await store.get('never-written')).toBeNull();
  });

  it('reads a non-JSON value as a miss and drops it instead of throwing', async () => {
    // Write a payload this store could never have produced — what an
    // incompatible writer, or a half-migrated deployment, would leave behind.
    // A throw here would fail every request touching that key until it expired.
    await rawClient.set(`${prefix}corrupt`, 'this is not json{{', 'EX', 60);

    expect(await store.get('corrupt')).toBeNull();
    // …and the poisoned key is removed rather than left to re-fail for hours.
    await sleep(50);
    expect(await rawClient.get(`${prefix}corrupt`)).toBeNull();
  });
});

describe.skipIf(!isLocalRedis)('RedisCacheStore TTL', () => {
  it('expires a key once its TTL elapses', async () => {
    await store.set('ttl-key', { cached: true }, 1);
    expect(await store.get('ttl-key')).toEqual({ cached: true });

    await sleep(1_400);
    expect(await store.get('ttl-key')).toBeNull();
  });

  it('treats a non-positive TTL as "do not cache", never as "cache forever"', async () => {
    await store.set('zero-ttl', { cached: true }, 0);
    expect(await store.get('zero-ttl')).toBeNull();

    await store.set('negative-ttl', { cached: true }, -5);
    expect(await store.get('negative-ttl')).toBeNull();
  });

  it('drives the physical TTL from the envelope\'s stale boundary', async () => {
    const envelope = createEnvelope({ jobs: [] }, 1, 2);
    await store.set('envelope', envelope, envelopeTtlSeconds(envelope));

    expect(readEnvelope(await store.get('envelope')).freshness).toBe('FRESH');
    await sleep(1_200);
    // Past fresh, inside stale: Redis still holds it and the reader serves it.
    expect(readEnvelope(await store.get('envelope')).freshness).toBe('STALE');
    await sleep(1_200);
    // Past stale: the key itself is gone.
    expect(await store.get('envelope')).toBeNull();
  });
});

describe.skipIf(!isLocalRedis)('RedisCacheStore setIfAbsent', () => {
  beforeEach(async () => {
    await store.delete('lock');
  });

  it('is atomic — exactly one of many concurrent callers wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.setIfAbsent('lock', `owner-${index}`, 30))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does not overwrite the incumbent value', async () => {
    expect(await store.setIfAbsent('lock', 'first', 30)).toBe(true);
    expect(await store.setIfAbsent('lock', 'second', 30)).toBe(false);
    expect(await store.get<string>('lock')).toBe('first');
  });

  it('lets the key be reclaimed after its TTL lapses', async () => {
    expect(await store.setIfAbsent('lock', 'first', 1)).toBe(true);
    await sleep(1_400);
    expect(await store.setIfAbsent('lock', 'second', 30)).toBe(true);
  });

  it('writes a lock token readable by get, in the same encoding as set', async () => {
    // Regression: `set` JSON-encoded but `setIfAbsent` stored the token raw, so
    // `get` failed to parse it, treated the key as corrupt and DELETED it. The
    // refresh lock's owner check then compared against a vanished key.
    await store.setIfAbsent('lock', 'owner-token', 30);
    expect(await store.get<string>('lock')).toBe('owner-token');
    // Still present after being read — the read must not be destructive.
    expect(await store.get<string>('lock')).toBe('owner-token');
    expect(await store.setIfAbsent('lock', 'other', 30)).toBe(false);
  });
});

describe.skipIf(!isLocalRedis)('RedisCacheStore compare-and-delete', () => {
  beforeEach(async () => {
    await store.delete('cas');
  });

  it('deletes only when the stored value still matches', async () => {
    await store.setIfAbsent('cas', 'token-a', 30);
    expect(await store.deleteIfValueMatches('cas', 'token-b')).toBe(false);
    expect(await store.get<string>('cas')).toBe('token-a');
    expect(await store.deleteIfValueMatches('cas', 'token-a')).toBe(true);
    expect(await store.get('cas')).toBeNull();
  });

  it('backs a refresh lock that survives an expired holder releasing late', async () => {
    const holder = await acquireRefreshLock(store, 'cas', 1);
    expect(holder.acquired).toBe(true);

    await sleep(1_400); // holder's lock lapses
    const next = await acquireRefreshLock(store, 'cas', 30);
    expect(next.acquired).toBe(true);

    await holder.release(); // late release must not free the new holder's lock
    expect(await store.get<string>('cas')).toBe(next.token);
  });
});

describe.skipIf(!isLocalRedis)('Redis unavailable', () => {
  it('rejects fast rather than queueing commands until some later reconnect', async () => {
    // Port 6399 has nothing on it. With `enableOfflineQueue: false` the command
    // fails immediately instead of buffering, which is what stops a Redis outage
    // from turning into a hung request.
    const unreachable = new RedisCacheStore({ url: 'redis://localhost:6399', keyPrefix: prefix });
    const started = Date.now();

    await expect(unreachable.get('anything')).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);

    await unreachable.disconnect();
  });

  it('does not crash the process when the connection fails', async () => {
    // ioredis emits `error`; without a listener Node treats it as an unhandled
    // 'error' event and takes the whole server down.
    const unreachable = new RedisCacheStore({ url: 'redis://localhost:6399', keyPrefix: prefix });
    await unreachable.get('anything').catch(() => null);
    await sleep(100);
    await unreachable.disconnect();
    expect(true).toBe(true);
  });
});
