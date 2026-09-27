/**
 * Live market-wide integrations, expressed as {@link SearchJobProviderAdapter}s.
 *
 * These are thin wrappers: every network call, query parameter and payload
 * mapping still lives in `adzuna.ts`, `reed.ts` and `jooble.ts` exactly as
 * before. Nothing about provider behaviour changes here — the adapters give the
 * existing services a declared shape so the orchestrator can treat all sources
 * uniformly. NHS XML remains contained in its own adapter.
 *
 * `job-search.ts` consumes only these registered adapters. Provider transport,
 * credentials and payload mapping remain contained in the underlying service.
 */

import { searchAdzunaJobs } from '@/shared/services/adzuna';
import { searchReedJobs } from '@/shared/services/reed';
import { searchJoobleJobs } from '@/shared/services/jooble';
import { API_CONFIG } from '@/shared/lib/config';
import { nhsJobsAdapter } from './nhs-jobs-adapter';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities';
import type { JobSearchParams, JobSearchResult, SearchJobProvider } from '@/shared/types/job';
import type {
  JobProviderCapabilities,
  JobProviderFetchContext,
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
  search: (params: JobSearchParams, options: { signal?: AbortSignal }) => Promise<JobSearchResult>
): SearchJobProviderAdapter {
  return {
    provider,
    label,
    capabilities: searchCapabilities(provider),
    isConfigured,
    async search(params: JobSearchParams, context: JobProviderFetchContext) {
      return toFetchResult(await search(params, { signal: context.signal }), params);
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
  NHS_JOBS: nhsJobsAdapter,
};
