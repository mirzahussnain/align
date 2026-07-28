// Provider-neutral job-board contracts. Provider payloads do not leave services.

export type JobProvider = 'ADZUNA' | 'REED' | 'JOOBLE';
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

export interface ProviderReference { provider: JobProvider; sourceJobId: string; sourceUrl: string; }

export interface NormalisedJob {
  source: JobProvider; sourceJobId: string; providerReferences: ProviderReference[];
  canonicalUrl: string; title: string; company: string; companyNormalised?: string;
  locationText: string; city?: string; region?: string; country?: string;
  description?: string; descriptionAvailability: JobDescriptionAvailability;
  salaryMin?: number; salaryMax?: number; salaryPeriod?: JobSalaryPeriod; currency?: 'GBP'; salaryText?: string;
  employmentType?: string; contractType?: string; remoteType: JobRemoteType;
  postedAt?: string; expiresAt?: string; sponsorSignal: SponsorSignal; eligibilityHints: EligibilityHint[];
  dedupeFingerprint: string; canonicalJobId: string; fetchedAt: string;
  /** Ephemeral server-owned reference for details/match handoff. */
  jobReference?: string;
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
  source: 'adzuna' | 'reed' | 'jooble'; contractType: string | null; isRemote: boolean; hasSponsorship: boolean;
}
export interface JobSearchResult { jobs: ProviderJob[]; total: number; page: number; perPage: number; source: string; }
export type ProviderSearchStatus = 'SUCCESS' | 'EMPTY' | 'FAILED' | 'TIMED_OUT' | 'NOT_CONFIGURED';
export interface ProviderSearchResult { provider: JobProvider; status: ProviderSearchStatus; jobs: NormalisedJob[]; rawReceived: number; validNormalised: number; nextCursor?: string; errorCode?: string; durationMs: number; cacheHit?: boolean; }
export interface ProviderCount { provider: JobProvider; rawReceived: number; validNormalised: number; uniqueContributed: number; status: ProviderSearchStatus; }
export interface Sponsor { organisationName: string; townCity: string; county: string; rating: string; route: string; industry?: string; }