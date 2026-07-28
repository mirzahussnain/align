import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore } from '../memory-cache-store';
import { resilientCache, type CacheStore } from '../cache-store';

/** A clock the test drives, so TTL behaviour is proven rather than slept on. */
function clockedStore() {
  let now = 1_000_000;
  const store = new MemoryCacheStore(() => now);
  return { store, advance: (seconds: number) => { now += seconds * 1000; } };
}

describe('MemoryCacheStore', () => {
  it('returns a stored value and then loses it at the TTL boundary', async () => {
    const { store, advance } = clockedStore();
    await store.set('search:a', { jobs: 3 }, 60);

    expect(await store.get('search:a')).toEqual({ jobs: 3 });
    advance(59);
    expect(await store.get('search:a')).toEqual({ jobs: 3 });
    advance(1);
    expect(await store.get('search:a')).toBeNull();
  });

  it('reports a miss for an unknown key rather than throwing', async () => {
    const { store } = clockedStore();
    expect(await store.get('never-written')).toBeNull();
  });

  it('isolates callers from each other by cloning on write and on read', async () => {
    const { store } = clockedStore();
    const written = { providers: ['REED'] };
    await store.set('search:b', written, 60);

    // Mutating the object that was written must not reach the cache…
    written.providers.push('ADZUNA');
    expect(await store.get<typeof written>('search:b')).toEqual({ providers: ['REED'] });

    // …and mutating a value that was read must not reach it either.
    const read = await store.get<typeof written>('search:b');
    read!.providers.push('JOOBLE');
    expect(await store.get<typeof written>('search:b')).toEqual({ providers: ['REED'] });
  });

  it('treats a non-positive TTL as "do not cache" and leaves no tombstone', async () => {
    const { store } = clockedStore();
    await store.set('search:c', { jobs: 1 }, 60);
    await store.set('search:c', { jobs: 2 }, 0);

    expect(await store.get('search:c')).toBeNull();
    expect(store.size).toBe(0);
  });

  it('deletes a key', async () => {
    const { store } = clockedStore();
    await store.set('search:d', 1, 60);
    await store.delete('search:d');
    expect(await store.get('search:d')).toBeNull();
  });

  describe('setIfAbsent (the refresh lock)', () => {
    it('grants the key to exactly one caller', async () => {
      const { store } = clockedStore();
      const results = await Promise.all([
        store.setIfAbsent('lock:search:x', 'holder-1', 30),
        store.setIfAbsent('lock:search:x', 'holder-2', 30),
        store.setIfAbsent('lock:search:x', 'holder-3', 30),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('does not overwrite the holder', async () => {
      const { store } = clockedStore();
      await store.setIfAbsent('lock:search:y', 'first', 30);
      await store.setIfAbsent('lock:search:y', 'second', 30);
      expect(await store.get('lock:search:y')).toBe('first');
    });

    it('releases the lock once it expires, so a crashed holder cannot wedge refresh', async () => {
      const { store, advance } = clockedStore();
      expect(await store.setIfAbsent('lock:search:z', 'crashed', 30)).toBe(true);
      expect(await store.setIfAbsent('lock:search:z', 'next', 30)).toBe(false);

      advance(30);
      expect(await store.setIfAbsent('lock:search:z', 'next', 30)).toBe(true);
    });
  });
});

describe('resilientCache', () => {
  /** A backend that is down: every operation rejects. */
  const brokenStore = (): CacheStore => ({
    get: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
    set: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
    delete: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
    setIfAbsent: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
  });

  it('degrades an unreachable backend to a permanent miss instead of failing the request', async () => {
    const onError = vi.fn();
    const cache = resilientCache(brokenStore(), onError);

    await expect(cache.get('search:a')).resolves.toBeNull();
    await expect(cache.set('search:a', 1, 60)).resolves.toBeUndefined();
    await expect(cache.delete('search:a')).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('refuses to hand out a lock it could not actually take', async () => {
    const cache = resilientCache(brokenStore());
    // False, not true: an unreachable backend proves nothing about exclusivity,
    // so every caller must fall back to its uncoordinated path.
    await expect(cache.setIfAbsent('lock:search:a', 'me', 30)).resolves.toBe(false);
  });

  it('passes healthy operations straight through', async () => {
    const cache = resilientCache(new MemoryCacheStore());
    await cache.set('search:ok', { jobs: 5 }, 60);
    expect(await cache.get('search:ok')).toEqual({ jobs: 5 });
    expect(await cache.setIfAbsent('lock:ok', 'me', 30)).toBe(true);
  });
});
