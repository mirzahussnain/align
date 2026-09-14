/**
 * Bounded, best-effort distributed refresh lock.
 *
 * WHAT THIS IS FOR: when N instances simultaneously find the same search stale,
 * only one of them should spend a provider round trip refreshing it. That is an
 * efficiency goal, not a correctness one — the value being protected is a cache
 * entry, and two refreshes produce the same entry twice.
 *
 * FOUR PROPERTIES THIS FILE EXISTS TO GUARANTEE:
 *
 *  1. Bounded. The lock is written with a TTL, so a holder that is frozen,
 *     killed mid-refresh or redeployed away cannot deadlock the query forever.
 *     There is no unlock path that a crash can skip.
 *  2. Owned. Each acquisition mints a unique token. Release compares before
 *     deleting, so a holder whose lock has ALREADY EXPIRED — and been re-acquired
 *     by somebody else — cannot delete the new holder's lock. Where the store
 *     cannot compare-and-delete, release does nothing and the TTL is relied on;
 *     that is strictly safer than an unconditional delete.
 *  3. Fail-closed. A cache error is reported as NOT acquired. Reporting a lock
 *     that does not exist is the one genuinely harmful outcome: every instance
 *     would believe some other instance is refreshing, and nothing would.
 *  4. Non-blocking. Losing the lock is never a reason to wait. The caller serves
 *     whatever stale data it has, which is the entire point of SWR.
 */

import { randomUUID } from 'node:crypto';

import type { CacheStore } from './cache-store';

export interface RefreshLock {
  /** True only for the single caller that won the key. */
  readonly acquired: boolean;
  /** Owner token. Empty when the lock was not acquired. */
  readonly token: string;
  /** Owner-checked release. Safe (and a no-op) when `acquired` is false. */
  release(): Promise<void>;
}

const LOST: RefreshLock = {
  acquired: false,
  token: '',
  async release() {},
};

/**
 * Try to claim `key` for `ttlSeconds`. Never throws and never waits on another
 * holder: it returns immediately with whether this caller won.
 */
export async function acquireRefreshLock(
  store: CacheStore,
  key: string,
  ttlSeconds: number
): Promise<RefreshLock> {
  const token = randomUUID();

  // `resilientCache` already converts a backend error into `false`. The catch is
  // a second belt for a store composed without it — in both cases the answer is
  // "not acquired", per property 3.
  const won = await store.setIfAbsent(key, token, ttlSeconds).catch(() => false);
  if (!won) return LOST;

  return {
    acquired: true,
    token,
    async release() {
      await releaseRefreshLock(store, key, token);
    },
  };
}

/**
 * Release only if `token` is still the stored value.
 *
 * Compare-and-delete is an OPTIONAL member of {@link CacheStore}, so this
 * feature-detects rather than testing for a concrete class: the live store is
 * always a `resilientCache` wrapper, and an `instanceof RedisCacheStore` check
 * would silently never match, quietly disabling early release everywhere.
 *
 * On a store that cannot compare-and-delete, this does nothing and the lock is
 * left to expire. Early release is an optimisation; letting a short TTL lapse
 * costs at most `ttlSeconds` of suppressed refresh, whereas an unconditional
 * delete could free a lock this caller no longer owns.
 */
export async function releaseRefreshLock(store: CacheStore, key: string, token: string): Promise<void> {
  if (!token || !store.deleteIfValueMatches) return;
  await store.deleteIfValueMatches(key, token).catch(() => false);
}
