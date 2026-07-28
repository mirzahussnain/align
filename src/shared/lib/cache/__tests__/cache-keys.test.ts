import { describe, expect, it } from 'vitest';
import { CACHE_SCHEMA_VERSION, CACHE_TTL_SECONDS, cacheKeys } from '../cache-keys';

const allKeys = () => [
  cacheKeys.providerResponse('REED', 'hash', '1'),
  cacheKeys.providerNormalised('REED', 'hash', '1'),
  cacheKeys.mergedSearch('hash', 1),
  cacheKeys.searchFreshness('hash', 1),
  cacheKeys.searchRefreshLock('hash'),
  cacheKeys.sponsorMatch('2026-07', 'acme'),
  cacheKeys.sponsorRefreshLock('2026-07'),
  cacheKeys.providerHealth('ADZUNA'),
  cacheKeys.searchSession('session-1'),
  cacheKeys.employerBoard('GREENHOUSE', 'acme'),
];

describe('cache keys', () => {
  it('namespaces and versions every key, so one bump retires all cached shapes', () => {
    for (const key of allKeys()) {
      expect(key.startsWith(`${CACHE_SCHEMA_VERSION}:jobs:`)).toBe(true);
    }
  });

  it('gives each namespace a distinct key for the same inputs', () => {
    const keys = allKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('separates providers, queries and pages', () => {
    expect(cacheKeys.providerResponse('REED', 'h', '1')).not.toBe(cacheKeys.providerResponse('ADZUNA', 'h', '1'));
    expect(cacheKeys.mergedSearch('h1', 1)).not.toBe(cacheKeys.mergedSearch('h2', 1));
    expect(cacheKeys.mergedSearch('h', 1)).not.toBe(cacheKeys.mergedSearch('h', 2));
  });

  it('encodes components so a value cannot forge a key boundary', () => {
    // Without encoding this employer name would read as extra key segments and
    // could collide with, or impersonate, a different cached entry.
    const hostile = cacheKeys.sponsorMatch('2026-07', 'acme:jobs:v1');
    expect(hostile.split(':')).toHaveLength(5);
    expect(hostile).toContain('acme%3Ajobs%3Av1');
  });

  it('changes the sponsor key when the register version changes', () => {
    // Register evidence must not outlive the register it came from: a new
    // edition changes the key rather than racing a TTL.
    expect(cacheKeys.sponsorMatch('2026-07', 'acme')).not.toBe(cacheKeys.sponsorMatch('2026-08', 'acme'));
  });
});

describe('cache TTL policy', () => {
  it('keeps a stale window strictly longer than the fresh window', () => {
    // Stale-while-revalidate needs a band between the two; equal values would
    // collapse it and every expiry would blank the list instead of refreshing it.
    expect(CACHE_TTL_SECONDS.searchStale).toBeGreaterThan(CACHE_TTL_SECONDS.searchFresh);
  });

  it('keeps refresh locks far shorter than the data they guard', () => {
    // A lock outliving its refresh would block later refreshes for its whole TTL.
    expect(CACHE_TTL_SECONDS.searchRefreshLock).toBeLessThan(CACHE_TTL_SECONDS.searchFresh);
    expect(CACHE_TTL_SECONDS.sponsorRefreshLock).toBeLessThan(CACHE_TTL_SECONDS.sponsorMatch);
  });

  it('uses positive TTLs throughout, since a non-positive TTL means "do not cache"', () => {
    for (const [name, seconds] of Object.entries(CACHE_TTL_SECONDS)) {
      expect(seconds, name).toBeGreaterThan(0);
    }
  });
});
