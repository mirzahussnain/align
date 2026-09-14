import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '../memory-cache-store';
import {
  disabledCacheStore,
  __resetCacheStore,
  __setCacheStore,
  getCacheBackend,
  getCacheStore,
} from '../cache-provider';

const originalUrl = process.env.REDIS_URL;

beforeEach(() => {
  __resetCacheStore();
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalUrl;
  __resetCacheStore();
  vi.restoreAllMocks();
});

describe('resolution order', () => {
  it('prefers an explicitly injected store', () => {
    const injected = new MemoryCacheStore();
    const restore = __setCacheStore(injected);

    expect(getCacheBackend()).toBe('injected');
    restore();
  });

  it('uses Redis when REDIS_URL is configured', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    // lazyConnect means resolving the store opens no socket.
    expect(getCacheBackend()).toBe('redis');
  });

  it('falls back to a disabled store when nothing is configured', () => {
    delete process.env.REDIS_URL;
    expect(getCacheBackend()).toBe('disabled');
  });

  it('ignores a blank REDIS_URL rather than constructing a client for it', () => {
    process.env.REDIS_URL = '   ';
    expect(getCacheBackend()).toBe('disabled');
  });

  it('memoises the store so a client is not built per request', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(getCacheStore()).toBe(getCacheStore());
  });

  it('restores the previous resolution when an injected store is removed', () => {
    delete process.env.REDIS_URL;
    const restore = __setCacheStore(new MemoryCacheStore());
    expect(getCacheBackend()).toBe('injected');

    restore();
    expect(getCacheBackend()).toBe('disabled');
  });
});

describe('the unconfigured fallback is honest, not a hidden memory cache', () => {
  it('misses every read and drops every write', async () => {
    const store = disabledCacheStore;
    await store.set('key', { cached: true }, 60);

    // A per-instance Map here would make a missing configuration look like a
    // working cache in development and a mystery in production.
    expect(await store.get('key')).toBeNull();
  });

  it('never grants a lock', async () => {
    // Granting one would convince a caller that a refresh is coordinated when
    // no other instance can even see the lock.
    expect(await disabledCacheStore.setIfAbsent('lock', 'token', 30)).toBe(false);
  });

  it('resolves to a store that behaves as a permanent miss', async () => {
    delete process.env.REDIS_URL;
    const store = getCacheStore();
    await store.set('key', { cached: true }, 60);
    expect(await store.get('key')).toBeNull();
  });
});

describe('resilience', () => {
  it('turns a backend failure into a miss instead of an exception', async () => {
    const restore = __setCacheStore({
      async get() { throw new Error('ECONNREFUSED'); },
      async set() { throw new Error('ECONNREFUSED'); },
      async delete() { throw new Error('ECONNREFUSED'); },
      async setIfAbsent() { throw new Error('ECONNREFUSED'); },
    });

    const store = getCacheStore();
    await expect(store.get('key')).resolves.toBeNull();
    await expect(store.set('key', 1, 60)).resolves.toBeUndefined();
    await expect(store.delete('key')).resolves.toBeUndefined();
    await expect(store.setIfAbsent('key', 'token', 30)).resolves.toBe(false);

    restore();
  });

  it('exposes compare-and-delete only when the wrapped store provides it', () => {
    const withCas = __setCacheStore(new MemoryCacheStore());
    expect(getCacheStore().deleteIfValueMatches).toBeTypeOf('function');
    withCas();

    __resetCacheStore();
    const withoutCas = __setCacheStore({
      async get() { return null; },
      async set() {},
      async delete() {},
      async setIfAbsent() { return false; },
    });
    // A wrapper that always advertised the method would make every store look
    // CAS-capable, and the refresh lock would silently take the wrong branch.
    expect(getCacheStore().deleteIfValueMatches).toBeUndefined();
    withoutCas();
  });
});
