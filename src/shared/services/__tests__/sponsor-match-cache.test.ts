import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';

// The underlying matcher is NOT redesigned in this phase; it is mocked so the
// tests can count how often the full-register scan is entered.
const matchSponsorCompanies = vi.fn();
const getSponsorRegisterVersion = vi.fn(async () => 'register-v1');

vi.mock('@/shared/services/sponsor-registry', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/sponsor-registry')>(
    '@/shared/services/sponsor-registry'
  );
  return {
    ...actual,
    matchSponsorCompanies: (...args: unknown[]) => matchSponsorCompanies(...args),
    getSponsorRegisterVersion: () => getSponsorRegisterVersion(),
  };
});

const { matchSponsorCompaniesCached } = await import('@/shared/services/sponsor-match-cache');

beforeEach(() => {
  matchSponsorCompanies.mockReset();
  getSponsorRegisterVersion.mockClear();
  getSponsorRegisterVersion.mockResolvedValue('register-v1');
});

const exact = (names: string[]) =>
  new Map(names.map((name) => [name, { status: 'EXACT' as const, organisationName: name.toUpperCase() }]));

describe('memoising completed matches', () => {
  it('scans the register once per employer, then serves from the cache', async () => {
    const store = new MemoryCacheStore();
    matchSponsorCompanies.mockImplementation(async (names: string[]) => exact(names));

    const first = await matchSponsorCompaniesCached(store, ['Acme Ltd']);
    expect(first.get('Acme Ltd')).toEqual({ status: 'EXACT', organisationName: 'ACME LTD' });
    expect(matchSponsorCompanies).toHaveBeenCalledTimes(1);

    // The employer recurs — across searches, and across users.
    const second = await matchSponsorCompaniesCached(store, ['Acme Ltd']);
    expect(second.get('Acme Ltd')).toEqual({ status: 'EXACT', organisationName: 'ACME LTD' });
    expect(matchSponsorCompanies).toHaveBeenCalledTimes(1);
  });

  it('sends only the uncached employers to the scan', async () => {
    const store = new MemoryCacheStore();
    matchSponsorCompanies.mockImplementation(async (names: string[]) => exact(names));

    await matchSponsorCompaniesCached(store, ['Acme Ltd', 'Beta Ltd']);
    matchSponsorCompanies.mockClear();

    await matchSponsorCompaniesCached(store, ['Acme Ltd', 'Beta Ltd', 'Gamma Ltd']);
    expect(matchSponsorCompanies).toHaveBeenCalledTimes(1);
    expect(matchSponsorCompanies).toHaveBeenCalledWith(['Gamma Ltd']);
  });

  it('does not call the scan at all when every employer is cached', async () => {
    const store = new MemoryCacheStore();
    matchSponsorCompanies.mockImplementation(async (names: string[]) => exact(names));

    await matchSponsorCompaniesCached(store, ['Acme Ltd']);
    matchSponsorCompanies.mockClear();

    await matchSponsorCompaniesCached(store, ['Acme Ltd']);
    expect(matchSponsorCompanies).not.toHaveBeenCalled();
  });

  it('shares one entry between raw names that standardise identically', async () => {
    const store = new MemoryCacheStore();
    matchSponsorCompanies.mockImplementation(async (names: string[]) => exact(names));

    await matchSponsorCompaniesCached(store, ['Acme Limited']);
    matchSponsorCompanies.mockClear();

    // The matcher only ever looks at the standardised form, so these cannot
    // produce different answers and may legitimately share a cache entry.
    const result = await matchSponsorCompaniesCached(store, ['Acme  Ltd']);
    expect(matchSponsorCompanies).not.toHaveBeenCalled();
    expect(result.get('Acme  Ltd')?.status).toBe('EXACT');
  });

  it('caches a negative result too, so an unmatched employer is not rescanned', async () => {
    const store = new MemoryCacheStore();
    matchSponsorCompanies.mockImplementation(async (names: string[]) =>
      new Map(names.map((name) => [name, { status: 'NONE' as const }]))
    );

    await matchSponsorCompaniesCached(store, ['Unknown Trading Co']);
    matchSponsorCompanies.mockClear();

    const result = await matchSponsorCompaniesCached(store, ['Unknown Trading Co']);
    expect(matchSponsorCompanies).not.toHaveBeenCalled();
    expect(result.get('Unknown Trading Co')).toEqual({ status: 'NONE' });
  });
});

describe('register version is part of the key', () => {
  it('does not serve evidence from a superseded register', async () => {
    const store = new MemoryCacheStore();
    matchSponsorCompanies.mockResolvedValueOnce(new Map([['Acme Ltd', { status: 'EXACT' as const, organisationName: 'ACME LTD' }]]));
    await matchSponsorCompaniesCached(store, ['Acme Ltd']);

    // A new CSV lands. Cached evidence must not outlive the register that
    // produced it — and a TTL cannot promise that, because a new register can
    // land at any point inside the window.
    getSponsorRegisterVersion.mockResolvedValue('register-v2');
    matchSponsorCompanies.mockResolvedValueOnce(new Map([['Acme Ltd', { status: 'NONE' as const }]]));

    const result = await matchSponsorCompaniesCached(store, ['Acme Ltd']);
    expect(matchSponsorCompanies).toHaveBeenCalledTimes(2);
    expect(result.get('Acme Ltd')).toEqual({ status: 'NONE' });
  });

  it('keeps each register version\'s entries addressable independently', async () => {
    const store = new MemoryCacheStore();
    matchSponsorCompanies.mockImplementation(async (names: string[]) => exact(names));

    await matchSponsorCompaniesCached(store, ['Acme Ltd']);
    getSponsorRegisterVersion.mockResolvedValue('register-v2');
    await matchSponsorCompaniesCached(store, ['Acme Ltd']);

    // Two generations coexist; the old one simply ages out unread.
    expect(store.size).toBe(2);
  });
});

describe('edge cases', () => {
  it('answers NONE for a name with no register identity, without caching an empty key', async () => {
    const store = new MemoryCacheStore();
    const result = await matchSponsorCompaniesCached(store, ['', '   ', '---']);

    expect(result.get('')).toEqual({ status: 'NONE' });
    expect(result.get('   ')).toEqual({ status: 'NONE' });
    expect(matchSponsorCompanies).not.toHaveBeenCalled();
    // Every such employer would otherwise share one entry under an empty key.
    expect(store.size).toBe(0);
  });

  it('returns an empty map without touching the register for an empty list', async () => {
    const store = new MemoryCacheStore();
    expect((await matchSponsorCompaniesCached(store, [])).size).toBe(0);
    expect(getSponsorRegisterVersion).not.toHaveBeenCalled();
  });

  it('still answers every employer when the cache is dead', async () => {
    // A cache outage must cost latency, never correctness.
    const dead = {
      async get() { return null; },
      async set() {},
      async delete() {},
      async setIfAbsent() { return false; },
    };
    matchSponsorCompanies.mockImplementation(async (names: string[]) => exact(names));

    const result = await matchSponsorCompaniesCached(dead, ['Acme Ltd', 'Beta Ltd']);
    expect(result.get('Acme Ltd')?.status).toBe('EXACT');
    expect(result.get('Beta Ltd')?.status).toBe('EXACT');
  });
});
