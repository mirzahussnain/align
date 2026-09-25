/**
 * Declared capabilities of every vacancy source.
 *
 * These describe what THIS APPLICATION'S INTEGRATION supports, not everything
 * the upstream API is documented to allow. A provider that offers a filter we do
 * not send is declared `false`: the orchestrator uses these flags to decide what
 * it may push down to a provider versus what it must apply locally, so claiming
 * an unsent capability would silently drop the filter instead of applying it.
 *
 * Employer-ATS entries describe integrations that do not exist yet. Their
 * `descriptionSemantics` are provisional, taken from each provider's documented
 * board endpoint, and are confirmed (or corrected) when the adapters land.
 */

import type { JobProvider } from '@/shared/types/job';
import type { JobProviderCapabilities } from '@/shared/types/job-provider';

/** Shared budgets for the market-wide search providers. */
const INTERACTIVE_MS = 1_500;
const BACKGROUND_MS = 5_000;

export const JOB_PROVIDER_CAPABILITIES: Record<JobProvider, JobProviderCapabilities> = {
  ADZUNA: {
    kind: 'SEARCH',
    keywordSearch: true,
    locationSearch: true,
    // Adzuna documents a distance parameter; our adapter does not send one.
    locationRadius: false,
    pagination: 'PAGE',
    maxPerPage: 50,
    salaryFilter: true,
    // Only `permanent` and `contract` map to an Adzuna parameter; `temporary`
    // has no equivalent and is filtered locally.
    contractTypeFilter: true,
    remoteFilter: false,
    postedWithinFilter: false,
    sortOptions: ['relevance', 'date', 'salary'],
    // The search payload carries a truncated advert body, not the full listing.
    descriptionSemantics: 'PARTIAL',
    // `redirect_url` is an Adzuna redirect, not the employer's own page.
    employerDirectUrl: false,
    requiresEmployerIdentifier: false,
    interactiveTimeoutMs: INTERACTIVE_MS,
    backgroundTimeoutMs: BACKGROUND_MS,
  },
  REED: {
    kind: 'SEARCH',
    keywordSearch: true,
    locationSearch: true,
    locationRadius: true,
    pagination: 'OFFSET',
    maxPerPage: 100,
    salaryFilter: true,
    contractTypeFilter: true,
    remoteFilter: false,
    postedWithinFilter: false,
    // Our adapter sends no sort parameter, so every order is applied locally.
    sortOptions: [],
    // Reed's search endpoint returns a shortened body; the full advert needs the
    // per-job details endpoint, which this integration does not call.
    descriptionSemantics: 'PARTIAL',
    employerDirectUrl: false,
    requiresEmployerIdentifier: false,
    interactiveTimeoutMs: INTERACTIVE_MS,
    backgroundTimeoutMs: BACKGROUND_MS,
  },
  JOOBLE: {
    kind: 'SEARCH',
    keywordSearch: true,
    locationSearch: true,
    locationRadius: false,
    pagination: 'PAGE',
    maxPerPage: 50,
    salaryFilter: true,
    contractTypeFilter: false,
    remoteFilter: false,
    postedWithinFilter: false,
    sortOptions: [],
    // The field is literally named `snippet` — a teaser, never the full advert.
    descriptionSemantics: 'SNIPPET',
    employerDirectUrl: false,
    requiresEmployerIdentifier: false,
    interactiveTimeoutMs: INTERACTIVE_MS,
    backgroundTimeoutMs: BACKGROUND_MS,
  },
  NHS_JOBS: {
    kind: 'SEARCH',
    keywordSearch: true,
    locationSearch: true,
    locationRadius: true,
    pagination: 'PAGE',
    maxPerPage: 5,
    salaryFilter: true,
    contractTypeFilter: true,
    remoteFilter: true,
    postedWithinFilter: true,
    sortOptions: ['date', 'salary'],
    descriptionSemantics: 'PARTIAL',
    // Official NHS Jobs vacancy page, but not the employer's own ATS page.
    employerDirectUrl: false,
    requiresEmployerIdentifier: false,
    interactiveTimeoutMs: INTERACTIVE_MS,
    backgroundTimeoutMs: BACKGROUND_MS,
  },

  // ── Employer-direct boards. No network integration yet (Phase 8). ──────────
  // Each returns one employer's whole board, so there is no query, no paging and
  // no interactive budget: they are served from cache or persisted snapshots.
  GREENHOUSE: {
    kind: 'EMPLOYER_ATS',
    keywordSearch: false,
    locationSearch: false,
    locationRadius: false,
    pagination: 'NONE',
    maxPerPage: 0,
    salaryFilter: false,
    contractTypeFilter: false,
    remoteFilter: false,
    postedWithinFilter: false,
    sortOptions: [],
    descriptionSemantics: 'FULL',
    employerDirectUrl: true,
    requiresEmployerIdentifier: true,
    interactiveTimeoutMs: 0,
    backgroundTimeoutMs: 10_000,
  },
  LEVER: {
    kind: 'EMPLOYER_ATS',
    keywordSearch: false,
    locationSearch: false,
    locationRadius: false,
    pagination: 'NONE',
    maxPerPage: 0,
    salaryFilter: false,
    contractTypeFilter: false,
    remoteFilter: false,
    postedWithinFilter: false,
    sortOptions: [],
    descriptionSemantics: 'FULL',
    employerDirectUrl: true,
    requiresEmployerIdentifier: true,
    interactiveTimeoutMs: 0,
    backgroundTimeoutMs: 10_000,
  },
  SMARTRECRUITERS: {
    kind: 'EMPLOYER_ATS',
    keywordSearch: false,
    locationSearch: false,
    locationRadius: false,
    pagination: 'OFFSET',
    maxPerPage: 100,
    salaryFilter: false,
    contractTypeFilter: false,
    remoteFilter: false,
    postedWithinFilter: false,
    sortOptions: [],
    // The postings list carries summaries; full text needs a per-posting fetch.
    descriptionSemantics: 'PARTIAL',
    employerDirectUrl: true,
    requiresEmployerIdentifier: true,
    interactiveTimeoutMs: 0,
    backgroundTimeoutMs: 10_000,
  },
  ASHBY: {
    kind: 'EMPLOYER_ATS',
    keywordSearch: false,
    locationSearch: false,
    locationRadius: false,
    pagination: 'NONE',
    maxPerPage: 0,
    salaryFilter: false,
    contractTypeFilter: false,
    remoteFilter: false,
    postedWithinFilter: false,
    sortOptions: [],
    descriptionSemantics: 'FULL',
    employerDirectUrl: true,
    requiresEmployerIdentifier: true,
    interactiveTimeoutMs: 0,
    backgroundTimeoutMs: 10_000,
  },
};

export function getProviderCapabilities(provider: JobProvider): JobProviderCapabilities {
  return JOB_PROVIDER_CAPABILITIES[provider];
}

/** Whether a provider may be called while the user waits on a response. */
export function isInteractiveProvider(provider: JobProvider): boolean {
  return JOB_PROVIDER_CAPABILITIES[provider].interactiveTimeoutMs > 0;
}

/**
 * Which of a request's filters this provider can apply itself. Everything not
 * listed must be applied locally, and the caller is responsible for doing so.
 */
export function pushdownFilters(provider: JobProvider): {
  salary: boolean;
  contractType: boolean;
  remote: boolean;
  postedWithin: boolean;
  location: boolean;
} {
  const capabilities = JOB_PROVIDER_CAPABILITIES[provider];
  return {
    salary: capabilities.salaryFilter,
    contractType: capabilities.contractTypeFilter,
    remote: capabilities.remoteFilter,
    postedWithin: capabilities.postedWithinFilter,
    location: capabilities.locationSearch,
  };
}
