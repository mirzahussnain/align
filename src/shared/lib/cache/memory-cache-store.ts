/**
 * In-process {@link CacheStore}. This is the TEST and single-process fallback
 * implementation — it is per-instance and therefore useless for coordination
 * across serverless invocations, which is exactly why the Redis adapter exists.
 * Keeping it here means the domain services can be tested without a container.
 *
 * Values are structurally cloned on write and on read, so a cached object cannot
 * be mutated through a reference held by an earlier caller — the same isolation
 * a serialising backend gives for free.
 */

import type { CacheStore } from './cache-store';

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): Entry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.live(key);
    return entry ? (structuredClone(entry.value) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // A non-positive TTL means "do not cache". Storing it with a past expiry
    // would leave a tombstone that only clears on the next read of that key.
    if (ttlSeconds <= 0) {
      this.entries.delete(key);
      return;
    }
    this.entries.set(key, { value: structuredClone(value), expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.live(key)) return false;
    if (ttlSeconds <= 0) return false;
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return true;
  }

  /** Test helper: drop everything. Not part of {@link CacheStore}. */
  clear(): void {
    this.entries.clear();
  }

  /** Test helper: live key count, expired entries excluded. */
  get size(): number {
    let count = 0;
    for (const key of [...this.entries.keys()]) if (this.live(key)) count += 1;
    return count;
  }
}
