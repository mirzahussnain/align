// Provider-neutral job-board contracts. Provider payloads do not leave services.

/**
 * Providers that answer a free-text keyword/location query across the whole
 * market. These are the three integrations that exist today and their behaviour
 * is unchanged.
 */
export type SearchJobProvider = 'ADZUNA' | 'REED' | 'JOOBLE';

/**
 * Employer-direct applicant-tracking systems. These are NOT market-wide search
 * APIs: each one answers "what is on THIS employer's board", so a query is only
 * meaningful with a verified board identifier (see `EmployerJobSource`). No
 * network integration exists yet — the union is declared here so snapshots,
 * provider references and capability metadata can be modelled ahead of it.
 */
export type EmployerAtsProvider = 'GREENHOUSE' | 'LEVER' | 'SMARTRECRUITERS' | 'ASHBY';

export type JobProvider = SearchJobProvider | EmployerAtsProvider;

export const SEARCH_JOB_PROVIDERS = ['ADZUNA', 'REED', 'JOOBLE'] as const satisfies readonly SearchJobProvider[];
export const EMPLOYER_ATS_PROVIDERS = ['GREENHOUSE', 'LEVER', 'SMARTRECRUITERS', 'ASHBY'] as const satisfies readonly EmployerAtsProvider[];

export function isSearchJobProvider(value: string): value is SearchJobProvider {
  return (SEARCH_JOB_PROVIDERS as readonly string[]).includes(value);
}

export function isEmployerAtsProvider(value: string): value is EmployerAtsProvider {
  return (EMPLOYER_ATS_PROVIDERS as readonly string[]).includes(value);
}
export type JobDescriptionAvailability = 'FULL' | 'PARTIAL' | 'EXTERNAL_ONLY';
export type JobRemoteType = 'ONSITE' | 'HYBRID' | 'REMOTE' | 'UNKNOWN';
export type JobSalaryPeriod = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'UNKNOWN';
export type SponsorRegisterMatchStatus = 'EXACT' | 'LIKELY' | 'AMBIGUOUS' | 'NONE';
export type JobSponsorshipWording = 'EXPLICITLY_AVAILABLE' | 'POSSIBLY_AVAILABLE' | 'EXPLICITLY_UNAVAILABLE' | 'RIGHT_TO_WORK_REQUIRED' | 'NOT_MENTIONED';

export interface EligibilityHint {
  type: 'RIGHT_TO_WORK' | 'NO_SPONSORSHIP' | 'SECURITY_CLEARANCE' | 'RESIDENCY_REQUIREMENT' | 'DBS' | 'DRIVING_LICENCE' | 'PROFESSIONAL_REGISTRATION' | 'ONSITE_REQUIREMENT' | 'TRAVEL_REQUIREMENT' | 'OTHER';
  severity: 'INFO' | 'WARNING' | 'BLOCKING_LANGUAGE';
  label: string;
  sourceExcerpt?: string;
}

export interface SponsorSignal {
  registerMatchStatus: SponsorRegisterMatchStatus;
  matchedOrganisationName?: string;
  confidence?: number;
  jobWording: JobSponsorshipWording;
  sourceExcerpts?: string[];
  explanation: string;
}

export interface ProviderReference {
  provider: JobProvider;
  sourceJobId: string;
  /** The provider-hosted posting page, used for provenance and re-verification. */
  sourceUrl: string;
  /** A separately validated direct application URL, when the provider supplies one. */
  applicationUrl?: string;
}

export interface NormalisedJob {
  source: JobProvider; sourceJobId: string; providerReferences: ProviderReference[];
  canonicalUrl: string; title: string; company: string; companyNormalised?: string;
  locationText: string; city?: string; region?: string; country?: string;
  description?: string; descriptionAvailability: JobDescriptionAvailability;
  salaryMin?: number; salaryMax?: number; salaryPeriod?: JobSalaryPeriod; currency?: 'GBP'; salaryText?: string;
  employmentType?: string; contractType?: string; remoteType: JobRemoteType;
  postedAt?: string; expiresAt?: string; sponsorSignal: SponsorSignal; eligibilityHints: EligibilityHint[];
  dedupeFingerprint: string; canonicalJobId: string; fetchedAt: string;
  employerSourceId?: string; companyRecordId?: string; departments?: string[]; offices?: string[];
}

export interface JobSearchParams {
  query: string; company?: string; location: string; page: number; perPage: number;
  salaryMin?: number; salaryMax?: number; contractType?: 'permanent' | 'contract' | 'temporary' | 'all';
  remote?: boolean; sortBy?: 'relevance' | 'date' | 'salary'; sponsorship?: 'all' | 'offered' | 'required' | 'registered' | 'exclude_no_sponsorship';
  experience?: 'all' | 'junior' | 'mid' | 'senior';
}

/** Internal common shape returned by existing provider adapters. */
export type SponsorStatus = 'confirmed-sponsor' | 'likely-sponsor' | 'sponsorship-unknown' | 'no-sponsorship';

export interface ProviderJob {
  id: string; title: string; company: string; location: string; salary: string | null;
  salaryMin: number | null; salaryMax: number | null; description: string; url: string; postedDate: string;
  source: Lowercase<JobProvider>; contractType: string | null; isRemote: boolean; hasSponsorship: boolean;
  employerSourceId?: string; companyRecordId?: string; departments?: string[]; offices?: string[];
  /** Provider-hosted job detail page, when `url` is the direct application page. */
  hostedUrl?: string;
  /** Strictly validated direct application page, separate from hosted provenance. */
  applicationUrl?: string;
}
export interface JobSearchResult { jobs: ProviderJob[]; total: number; page: number; perPage: number; source: string; }
/**
 * `PENDING` is distinct from `TIMED_OUT` and the difference is user-visible.
 * TIMED_OUT means the provider was given its full budget and did not answer.
 * PENDING means WE stopped waiting at the interactive deadline while the request
 * was still healthy and in flight — its result will populate the cache for the
 * next search. Collapsing the two would report a working source as broken.
 */
export type ProviderSearchStatus = 'SUCCESS' | 'EMPTY' | 'STALE_CACHE' | 'TIMEOUT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'FAILED' | 'TIMED_OUT' | 'NOT_CONFIGURED' | 'PENDING';
export interface ProviderSearchResult { provider: JobProvider; status: ProviderSearchStatus; jobs: NormalisedJob[]; rawReceived: number; validNormalised: number; nextCursor?: string; errorCode?: string; durationMs: number; cacheHit?: boolean; }
export interface ProviderCount { provider: JobProvider; rawReceived: number; validNormalised: number; uniqueContributed: number; status: ProviderSearchStatus; }
export interface Sponsor { organisationName: string; townCity: string; county: string; rating: string; route: string; industry?: string; }