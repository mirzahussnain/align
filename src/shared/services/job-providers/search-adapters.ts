/**
 * The three live market-wide integrations, expressed as {@link SearchJobProviderAdapter}s.
 *
 * These are thin wrappers: every network call, query parameter and payload
 * mapping still lives in `adzuna.ts`, `reed.ts` and `jooble.ts` exactly as
 * before. Nothing about provider behaviour changes here — the adapters give the
 * existing services a declared shape so the orchestrator can treat all sources
 * uniformly, and so future employer-ATS adapters plug into the same contract.
 *
 * `job-search.ts` deliberately still calls the underlying functions directly.
 * Migrating the fan-out onto this registry belongs with the caching rework, so
 * that a change of call path and a change of caching behaviour are not landed
 * together and cannot be confused for one another.
 */

import { searchAdzunaJobs } from '@/shared/services/adzuna';
import { searchReedJobs } from '@/shared/services/reed';
import { searchJoobleJobs } from '@/shared/services/jooble';
import { API_CONFIG } from '@/shared/lib/config';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities';
import type { JobSearchParams, JobSearchResult, SearchJobProvider } from '@/shared/types/job';
import type {
  JobProviderCapabilities,
  JobProviderFetchResult,
  SearchJobProviderAdapter,
} from '@/shared/types/job-provider';

/** Narrow the shared capability record to the search-provider variant. */
const searchCapabilities = (provider: SearchJobProvider) =>
  JOB_PROVIDER_CAPABILITIES[provider] as JobProviderCapabilities & {
    kind: 'SEARCH';
    requiresEmployerIdentifier: false;
  };

/**
 * A full page implies there is probably another one. This mirrors the cursor
 * rule `job-search.ts` already applies, rather than introducing a second,
 * subtly different notion of "there is more".
 */
function toFetchResult(response: JobSearchResult, params: JobSearchParams): JobProviderFetchResult {
  return {
    jobs: response.jobs,
    total: response.total,
    nextCursor: response.jobs.length === params.perPage ? String(params.page + 1) : undefined,
    rawReceived: response.jobs.length,
  };
}

function defineSearchAdapter(
  provider: SearchJobProvider,
  label: string,
  isConfigured: () => boolean,
  search: (params: JobSearchParams) => Promise<JobSearchResult>
): SearchJobProviderAdapter {
  return {
    provider,
    label,
    capabilities: searchCapabilities(provider),
    isConfigured,
    // The contract passes a JobProviderFetchContext (budget + abort signal) as a
    // second argument. These wrappers deliberately ignore it: threading the
    // signal into the underlying `fetch` calls would change how the live
    // integrations behave, which belongs with the caching rework rather than
    // with declaring the contract. The parameter is omitted rather than named
    // and unused, so nothing here reads as wired up when it is not.
    async search(params: JobSearchParams) {
      return toFetchResult(await search(params), params);
    },
  };
}

export const adzunaAdapter = defineSearchAdapter(
  'ADZUNA',
  'Adzuna',
  () => Boolean(API_CONFIG.adzuna.appId && API_CONFIG.adzuna.appKey),
  searchAdzunaJobs
);

export const reedAdapter = defineSearchAdapter(
  'REED',
  'Reed',
  () => Boolean(API_CONFIG.reed.apiKey),
  searchReedJobs
);

export const joobleAdapter = defineSearchAdapter(
  'JOOBLE',
  'Jooble',
  () => Boolean(API_CONFIG.jooble.apiKey),
  searchJoobleJobs
);

export const SEARCH_PROVIDER_ADAPTERS: Record<SearchJobProvider, SearchJobProviderAdapter> = {
  ADZUNA: adzunaAdapter,
  REED: reedAdapter,
  JOOBLE: joobleAdapter,
};
