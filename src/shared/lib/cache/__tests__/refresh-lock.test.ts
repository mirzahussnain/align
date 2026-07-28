import { describe, expect, it, vi } from 'vitest';

import type { CacheStore } from '../cache-store';
import { resilientCache } from '../cache-store';
import { MemoryCacheStore } from '../memory-cache-store';
import { acquireRefreshLock, releaseRefreshLock } from '../refresh-lock';

const KEY = 'v1:jobs:lock:search:abc';

describe('refresh-lock contention', () => {
  it('grants the lock to exactly one of many concurrent callers', async () => {
    const store = new MemoryCacheStore();
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => acquireRefreshLock(store, KEY, 30))
    );
    expect(attempts.filter((lock) => lock.acquired)).toHaveLength(1);
  });

  it('gives every caller a distinct owner token', async () => {
    const store = new MemoryCacheStore();
    const first = await acquireRefreshLock(store, KEY, 30);
    await first.release();
    const second = await acquireRefreshLock(store, KEY, 30);
    expect(first.token).not.toBe(second.token);
  });

  it('re-grants the lock after the holder releases it', async () => {
    const store = new MemoryCacheStore();
    const first = await acquireRefreshLock(store, KEY, 30);
    expect((await acquireRefreshLock(store, KEY, 30)).acquired).toBe(false);
    await first.release();
    expect((await acquireRefreshLock(store, KEY, 30)).acquired).toBe(true);
  });

  it('expires so a holder that dies mid-refresh cannot deadlock the query', async () => {
    let now = 1_000_000;
    const store = new MemoryCacheStore(() => now);
    const abandoned = await acquireRefreshLock(store, KEY, 30);
    expect(abandoned.acquired).toBe(true);

    // The holder never releases — it was frozen, killed or redeployed away.
    now += 31_000;
    expect((await acquireRefreshLock(store, KEY, 30)).acquired).toBe(true);
  });
});

describe('owner-checked release', () => {
  it('does not let an expired holder delete the new holder\'s lock', async () => {
    let now = 1_000_000;
    const store = new MemoryCacheStore(() => now);

    const slow = await acquireRefreshLock(store, KEY, 30);
    now += 31_000; // slow's lock lapses
    const next = await acquireRefreshLock(store, KEY, 30);
    expect(next.acquired).toBe(true);

    // The slow holder finally finishes and releases. An unconditional DEL here
    // would free a lock it no longer owns, letting a third caller start a
    // duplicate refresh while `next` is still working.
    await slow.release();

    expect((await acquireRefreshLock(store, KEY, 30)).acquired).toBe(false);
    expect(await store.get<string>(KEY)).toBe(next.token);
  });

  it('leaves the lock to expire on a store that cannot compare-and-delete', async () => {
    const base = new MemoryCacheStore();
    // A store WITHOUT the optional capability — the fallback path.
    const limited: CacheStore = {
      get: (key) => base.get(key),
      set: (key, value, ttl) => base.set(key, value, ttl),
      delete: (key) => base.delete(key),
      setIfAbsent: (key, value, ttl) => base.setIfAbsent(key, value, ttl),
    };

    const lock = await acquireRefreshLock(limited, KEY, 30);
    await lock.release();

    // Still held: leaving a short TTL to lapse is strictly safer than an
    // unconditional delete that might free somebody else's lock.
    expect((await acquireRefreshLock(limited, KEY, 30)).acquired).toBe(false);
  });

  it('is a no-op when the caller never held the lock', async () => {
    const store = new MemoryCacheStore();
    const holder = await acquireRefreshLock(store, KEY, 30);
    const loser = await acquireRefreshLock(store, KEY, 30);
    expect(loser.acquired).toBe(false);

    await loser.release();
    expect(await store.get<string>(KEY)).toBe(holder.token);
  });
});

describe('fail-closed behaviour', () => {
  it('reports NOT acquired when the cache backend is down', async () => {
    // The genuinely harmful outcome is the opposite: if a broken backend handed
    // out the lock, every instance would believe another one is refreshing and
    // nothing would.
    const broken: CacheStore = {
      async get() { throw new Error('ECONNREFUSED'); },
      async set() { throw new Error('ECONNREFUSED'); },
      async delete() { throw new Error('ECONNREFUSED'); },
      async setIfAbsent() { throw new Error('ECONNREFUSED'); },
    };

    const lock = await acquireRefreshLock(broken, KEY, 30);
    expect(lock.acquired).toBe(false);
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it('reports NOT acquired through a resilient wrapper too', async () => {
    const onError = vi.fn();
    const broken = resilientCache(
      {
        async get() { throw new Error('ECONNREFUSED'); },
        async set() { throw new Error('ECONNREFUSED'); },
        async delete() { throw new Error('ECONNREFUSED'); },
        async setIfAbsent() { throw new Error('ECONNREFUSED'); },
      },
      onError
    );

    expect((await acquireRefreshLock(broken, KEY, 30)).acquired).toBe(false);
    expect(onError).toHaveBeenCalledWith('setIfAbsent', expect.any(Error));
  });

  it('never waits on the current holder', async () => {
    const store = new MemoryCacheStore();
    await acquireRefreshLock(store, KEY, 30);

    const started = Date.now();
    const lost = await acquireRefreshLock(store, KEY, 30);

    // Losing the lock returns immediately so the caller can serve stale data.
    expect(lost.acquired).toBe(false);
    expect(Date.now() - started).toBeLessThan(50);
  });
});

describe('release without a token', () => {
  it('does nothing when the token is empty', async () => {
    const store = new MemoryCacheStore();
    const holder = await acquireRefreshLock(store, KEY, 30);
    await releaseRefreshLock(store, KEY, '');
    expect(await store.get<string>(KEY)).toBe(holder.token);
  });
});
