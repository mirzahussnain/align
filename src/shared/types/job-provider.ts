/**
 * Provider-neutral vacancy-source contracts.
 *
 * The Job Board draws vacancies from two structurally different kinds of source
 * and they must not be modelled as one thing:
 *
 *   SEARCH        — a market-wide keyword/location API (Adzuna, Reed, Jooble).
 *                   One request answers "what matches this query anywhere".
 *   EMPLOYER_ATS  — one employer's own applicant-tracking board (Greenhouse,
 *                   Lever, SmartRecruiters, Ashby). A request is only meaningful
 *                   with a VERIFIED board identifier and answers "what is on
 *                   THIS employer's board". Fanning a user's query across every
 *                   known board synchronously is not a supported access pattern.
 *
 * Nothing here performs I/O. These are the contracts the existing services are
 * expressed through and that future adapters must satisfy; the three live
 * integrations keep their current network code unchanged behind them.
 */

import type {
  EmployerAtsProvider,
  JobProvider,
  JobSearchParams,
  ProviderJob,
  SearchJobProvider,
} from '@/shared/types/job';
import type { EmployerJobSourceRef, EmployerSourceVerificationResult } from '@/shared/types/employer-source';

/** Which of the two access patterns a provider belongs to. */
export type JobProviderKind = 'SEARCH' | 'EMPLOYER_ATS';

/** How a provider expresses "give me the next page". */
export type JobProviderPagination = 'PAGE' | 'OFFSET' | 'CURSOR' | 'NONE';

/** Sort orders a provider can apply server-side. Anything else is sorted locally. */
export type JobProviderSort = 'relevance' | 'date' | 'salary';

/**
 * What a provider's description field contains AT BEST, as a property of the
 * integration contract rather than a guess about one payload. This is an upper
 * bound only: an individual result is still classified per-record by the
 * completeness classifier, so a provider that *can* return full text is not
 * assumed to have done so.
 */
export type JobProviderDescriptionSemantics =
  /** The provider returns the employer's complete advert body. */
  | 'FULL'
  /** The provider returns a substantial but routinely truncated body. */
  | 'PARTIAL'
  /** The provider returns a short teaser only, never the full advert. */
  | 'SNIPPET'
  /** Not established for this provider; treat conservatively. */
  | 'UNKNOWN';

/**
 * Declared, testable capabilities of one integration. The orchestrator reads
 * these instead of hardcoding per-provider branches, and the UI reads them to
 * decide which filters can be pushed down and which must be applied locally.
 */
export interface JobProviderCapabilities {
  kind: JobProviderKind;
  /** Free-text keyword query handled by the provider's own API. */
  keywordSearch: boolean;
  /** Location term handled by the provider's own API. */
  locationSearch: boolean;
  /** A search radius around the location is honoured. */
  locationRadius: boolean;
  pagination: JobProviderPagination;
  /**
   * Largest page size the provider will serve, or 0 when pagination is `NONE`
   * because the provider returns the whole board in a single response.
   */
  maxPerPage: number;
  salaryFilter: boolean;
  contractTypeFilter: boolean;
  remoteFilter: boolean;
  postedWithinFilter: boolean;
  /** Sorts the provider applies server-side; everything else is local. */
  sortOptions: readonly JobProviderSort[];
  descriptionSemantics: JobProviderDescriptionSemantics;
  /**
   * True when `canonicalUrl` is the employer's own application page rather than
   * an aggregator redirect. Employer-direct URLs are preferred as the canonical
   * application link when the same vacancy is seen from several sources.
   */
  employerDirectUrl: boolean;
  /** True when a request needs a verified board identifier, not a query. */
  requiresEmployerIdentifier: boolean;
  /**
   * Budget for the interactive path — the user is waiting on this. **0 means the
   * provider must never be called on the interactive path**, which is the case
   * for every employer-ATS board: those are served from cache or from persisted
   * snapshots, and refreshed in the background.
   */
  interactiveTimeoutMs: number;
  /** Budget for a background refresh, where latency is not user-visible. */
  backgroundTimeoutMs: number;
}

/** Why a provider fetch did not return usable results. */
export type JobProviderFailureCode =
  | 'NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UNAUTHORISED'
  | 'NOT_FOUND'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export class JobProviderError extends Error {
  constructor(
    readonly provider: JobProvider,
    readonly code: JobProviderFailureCode,
    message?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message ?? `${provider} request failed: ${code}`);
    this.name = 'JobProviderError';
  }
}

/** Per-call context. Kept minimal and free of any user content. */
export interface JobProviderFetchContext {
  /** Which budget applies — the interactive user path or a background refresh. */
  mode: 'interactive' | 'background';
  /** Aborts the request when the caller's deadline passes. */
  signal?: AbortSignal;
}

/**
 * The raw, still-provider-shaped result of one fetch. Adapters return
 * {@link ProviderJob}, which normalisation converts into a `NormalisedJob`;
 * provider payload types never leave the adapter.
 */
export interface JobProviderFetchResult {
  jobs: ProviderJob[];
  /** Total the provider claims to hold, when it reports one. */
  total?: number;
  /** Opaque token for the next page; absent when the source is exhausted. */
  nextCursor?: string;
  /** Records received before validation, for honest provider counting. */
  rawReceived: number;
}

/** Fields every adapter carries, regardless of kind. */
interface JobProviderAdapterBase {
  readonly provider: JobProvider;
  /** Short user-facing attribution label, e.g. "Reed". */
  readonly label: string;
  readonly capabilities: JobProviderCapabilities;
  /** Whether credentials/config for this provider are present. No I/O. */
  isConfigured(): boolean;
}

/** A market-wide search integration: query in, vacancies out. */
export interface SearchJobProviderAdapter extends JobProviderAdapterBase {
  readonly provider: SearchJobProvider;
  readonly capabilities: JobProviderCapabilities & { kind: 'SEARCH'; requiresEmployerIdentifier: false };
  search(params: JobSearchParams, context: JobProviderFetchContext): Promise<JobProviderFetchResult>;
}

/**
 * An employer-direct ATS integration. Every entry point takes a verified source
 * reference — there is deliberately no "search all boards" method, because that
 * access pattern is what this contract exists to prevent.
 */
export interface EmployerAtsProviderAdapter extends JobProviderAdapterBase {
  readonly provider: EmployerAtsProvider;
  readonly capabilities: JobProviderCapabilities & { kind: 'EMPLOYER_ATS'; requiresEmployerIdentifier: true };
  /**
   * Public board URL for a source. Pure and synchronous so it can be validated
   * (and SSRF-checked) without a network call.
   */
  boardUrl(source: EmployerJobSourceRef): string;
  /** Every vacancy currently on one employer's board. */
  fetchBoard(source: EmployerJobSourceRef, context: JobProviderFetchContext): Promise<JobProviderFetchResult>;
  /**
   * Confirm the identifier resolves to a real, publicly readable board for the
   * expected organisation. Gates whether a directory entry may be enabled.
   */
  verifySource(source: EmployerJobSourceRef, context: JobProviderFetchContext): Promise<EmployerSourceVerificationResult>;
}

export type JobProviderAdapter = SearchJobProviderAdapter | EmployerAtsProviderAdapter;

export function isSearchAdapter(adapter: JobProviderAdapter): adapter is SearchJobProviderAdapter {
  return adapter.capabilities.kind === 'SEARCH';
}

export function isEmployerAtsAdapter(adapter: JobProviderAdapter): adapter is EmployerAtsProviderAdapter {
  return adapter.capabilities.kind === 'EMPLOYER_ATS';
}
