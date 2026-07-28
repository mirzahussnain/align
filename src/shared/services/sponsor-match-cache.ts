/**
 * Completed sponsor-match memoisation.
 *
 * SponsorIndex is in-process, parsed read-only register acceleration. This
 * CacheStore layer is different: it persists completed employer lookups so
 * repeated matches reuse Redis-level latency. Register version is in the key,
 * so a new dataset automatically uses a new cache namespace.
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

function canCacheEmployerName(company: string, normalised: string): boolean {
  return Boolean(normalised)
    && company.length <= 256
    && !/[\u0000-\u001F\u007F-\u009F]/.test(company)
    && !/^(?:https?:\/\/|www\.)/i.test(company.trim());
}

export async function matchSponsorCompaniesCached(
  store: CacheStore,
  companyNames: string[]
): Promise<Map<string, SponsorMatch>> {
  const result = new Map<string, SponsorMatch>();
  if (!companyNames.length) return result;

  const registerVersion = await getSponsorRegisterVersion();
  const normalisedBy = new Map<string, string>();
  for (const company of companyNames) normalisedBy.set(company, standardizeCompanyName(company));

  const uncached: string[] = [];
  let hits = 0;
  await Promise.all(companyNames.map(async (company) => {
    const normalised = normalisedBy.get(company) ?? '';
    if (!canCacheEmployerName(company, normalised)) {
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
  }));

  if (uncached.length) {
    const computed = await matchSponsorCompanies(uncached);
    await Promise.all(uncached.map(async (company) => {
      const indexed = computed.get(company);
      const match: SponsorMatch = indexed
        ? { status: indexed.status, organisationName: indexed.matchedOrganisationName ?? (indexed as { organisationName?: string }).organisationName }
        : { status: 'NONE' };
      result.set(company, match);
      const normalised = normalisedBy.get(company) ?? '';
      if (canCacheEmployerName(company, normalised)) {
        await store.set(cacheKeys.sponsorMatch(registerVersion, normalised), match, CACHE_TTL_SECONDS.sponsorMatch);
      }
    }));
  }

  logJobBoardEvent('sponsor_match_cached', { registerVersion, count: hits, cacheHit: 'FRESH' });
  if (uncached.length) logJobBoardEvent('sponsor_match_computed', { registerVersion, count: uncached.length, cacheHit: 'MISS' });
  return result;
}
