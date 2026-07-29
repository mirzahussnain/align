/**
 * Completed sponsor-match memoisation.
 *
 * SponsorIndex is in-process, parsed read-only register acceleration. This
 * CacheStore layer is different: it persists completed employer lookups so
 * repeated matches reuse Redis-level latency. Register version is in the key,
 * so a new dataset automatically uses a new cache namespace.
 *
 * PRIVACY. Everything cached here is COMPANY-level factual data — an employer
 * name and what the public Home Office register says about it. No candidate
 * fact ever enters this namespace; practical compatibility is user-specific and
 * is never shared-cached.
 *
 * A NAME THAT COULD NOT BE CHECKED IS NOT A "NO MATCH". This function used to
 * answer `{ status: 'NONE' }` for an empty or malformed employer name, which
 * downstream code then presented as "checked against the register, nothing
 * found". Those names are now simply ABSENT from the returned map, so a caller
 * can tell "the register says no" from "there was nothing to ask the register".
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
  /** Populated for AMBIGUOUS so the UI can say why without exposing scores. */
  candidateOrganisationNames?: string[];
  /** Matcher reasons, safe to show: prose, never a fuzzy score. */
  reasons?: string[];
}

function canCacheEmployerName(company: string, normalised: string): boolean {
  return Boolean(normalised)
    && company.length <= 256
    && !/[\u0000-\u001F\u007F-\u009F]/.test(company)
    && !/^(?:https?:\/\/|www\.)/i.test(company.trim());
}

/**
 * @returns a map keyed by the ORIGINAL employer string. An employer whose name
 * could not be checked at all is absent from the map — never present as NONE.
 */
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
    // Unusable name: leave it out of the map entirely. Caching it would also
    // collapse every such employer onto one empty key.
    if (!canCacheEmployerName(company, normalised)) return;
    const cached = await store.get<SponsorMatch>(cacheKeys.sponsorMatch(registerVersion, normalised));
    if (cached && typeof cached.status === 'string') {
      result.set(company, cached);
      hits += 1;
      return;
    }
    uncached.push(company);
  }));

  if (uncached.length) {
    // A register failure propagates. Converting a thrown loader error into NONE
    // here would publish "this employer is not a sponsor" on the strength of a
    // network outage.
    const computed = await matchSponsorCompanies(uncached);
    await Promise.all(uncached.map(async (company) => {
      const indexed = computed.get(company);
      if (!indexed) return;
      const match: SponsorMatch = {
        status: indexed.status,
        ...(indexed.matchedOrganisationName ? { organisationName: indexed.matchedOrganisationName } : {}),
        ...(indexed.candidateOrganisationNames?.length
          ? { candidateOrganisationNames: indexed.candidateOrganisationNames }
          : {}),
        ...(indexed.confidenceReasons?.length ? { reasons: indexed.confidenceReasons } : {}),
      };
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
