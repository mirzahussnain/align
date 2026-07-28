/**
 * Memoisation of COMPLETED sponsor-register matches. Nothing more.
 *
 * SCOPE, STATED PRECISELY. `matchSponsorCompanies` scans the whole ~100k-row
 * register for every employer it has not matched exactly, re-standardising and
 * re-tokenising each row. That algorithm is UNCHANGED here and remains the
 * dominant cost of a cold search. What this file removes is the RE-computation:
 * an employer already matched under the current register version is answered
 * from the cache instead of scanning again.
 *
 * So the honest claim is narrow. Repeat employers — which dominate in practice,
 * since the same companies recur across searches and across users — become a
 * cache read. A page full of employers nobody has looked up yet still pays the
 * full scan, once each. Phase 4 owns the actual fix: an exact-match index, an
 * inverted token index and candidate narrowing, so that the FIRST lookup is
 * cheap too. This phase does not touch that and does not claim to.
 *
 * The register version is part of the key, not a TTL, so evidence can never
 * outlive the register that produced it (see `getSponsorRegisterVersion`).
 */

import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import type { SponsorRegisterMatchStatus } from '@/shared/types/job';
import { logJobBoardEvent } from './job-board-observability';
import {
  getSponsorRegisterVersion,
  matchSponsorCompanies,
  standardizeCompanyName,
} from './sponsor-registry';

export interface SponsorMatch {
  status: SponsorRegisterMatchStatus;
  organisationName?: string;
}

/**
 * Match every employer, reading through the cache.
 *
 * Returns a map keyed by the ORIGINAL company name, exactly as
 * `matchSponsorCompanies` does, so this is a drop-in replacement for it. Two raw
 * names that standardise to the same string legitimately share one cache entry:
 * the underlying matcher only ever looks at the standardised form, so they
 * cannot produce different answers.
 */
export async function matchSponsorCompaniesCached(
  store: CacheStore,
  companyNames: string[]
): Promise<Map<string, SponsorMatch>> {
  const result = new Map<string, SponsorMatch>();
  if (!companyNames.length) return result;

  const registerVersion = await getSponsorRegisterVersion();

  // Standardise once per name; the raw → normalised mapping is needed twice.
  const normalisedBy = new Map<string, string>();
  for (const company of companyNames) normalisedBy.set(company, standardizeCompanyName(company));

  const uncached: string[] = [];
  let hits = 0;

  await Promise.all(
    companyNames.map(async (company) => {
      const normalised = normalisedBy.get(company) ?? '';
      // A name that standardises to nothing has no register identity to look up.
      // Answer NONE directly rather than caching under an empty key, which every
      // such employer would then share.
      if (!normalised) {
        result.set(company, { status: 'NONE' });
        return;
      }
      const cached = await store.get<SponsorMatch>(cacheKeys.sponsorMatch(registerVersion, normalised));
      if (cached && typeof cached.status === 'string') {
        result.set(company, cached);
        hits += 1;
        return;
      }
      uncached.push(company);
    })
  );

  if (uncached.length) {
    // Only the misses reach the full-register scan.
    const computed = await matchSponsorCompanies(uncached);
    await Promise.all(
      uncached.map(async (company) => {
        const match = computed.get(company) ?? { status: 'NONE' as const };
        result.set(company, match);
        const normalised = normalisedBy.get(company) ?? '';
        if (normalised) {
          await store.set(cacheKeys.sponsorMatch(registerVersion, normalised), match, CACHE_TTL_SECONDS.sponsorMatch);
        }
      })
    );
  }

  logJobBoardEvent('sponsor_match_cached', { registerVersion, count: hits, cacheHit: 'FRESH' });
  if (uncached.length) {
    logJobBoardEvent('sponsor_match_computed', { registerVersion, count: uncached.length, cacheHit: 'MISS' });
  }
  return result;
}
