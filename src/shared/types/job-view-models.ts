/**
 * Provider-neutral view models — the contract between the Job Board API and its
 * UI. The UI renders these and derives nothing itself; provider payloads,
 * Prisma rows and normalisation internals never reach a component.
 *
 * Four product rules are encoded in the SHAPE of these types, so that violating
 * one is a type error rather than a review comment:
 *
 *  1. **No fabricated fit.** A percentage lives only on {@link JobAnalysisView},
 *     which exists only when a canonical analysis has been persisted. Before
 *     that there is {@link DiscoveryRelevance} — a level and its reasons, with
 *     no number anywhere in the type.
 *  2. **Provider text and user text never merge.** {@link JobDescriptionView}
 *     carries them as separate fields; a pasted description cannot overwrite the
 *     provider's, because there is no single field for them to share.
 *  3. **Company and vacancy sponsorship evidence never merge.**
 *     {@link SponsorEvidenceView} keeps them as two objects with two separate
 *     statements and one disclaimer.
 *  4. **Counts are honest.** {@link JobSearchMetaView} reports provider returns
 *     and unique jobs as distinct figures, so the UI cannot present one as the
 *     other.
 */

import type {
  EligibilityHint,
  JobDescriptionAvailability,
  JobProvider,
  JobRemoteType,
  JobSalaryPeriod,
  JobSponsorshipWording,
  ProviderSearchStatus,
  SponsorRegisterMatchStatus,
} from '@/shared/types/job';

// ── Discovery relevance ─────────────────────────────────────────────────────

/**
 * Deterministic pre-analysis relevance. Deliberately three coarse levels: this
 * is computed from declared targets and vacancy metadata only, and a number
 * would imply a precision the inputs cannot support. It is NOT a CV-to-job match.
 */
export type DiscoveryRelevanceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DiscoveryRelevance {
  level: DiscoveryRelevanceLevel;
  /** Why this level was reached, each a complete user-facing sentence. */
  reasons: string[];
}

// ── Description ─────────────────────────────────────────────────────────────

/** Where the analysed description text came from. */
export type JobDescriptionSource =
  /** The provider supplied the complete advert. */
  | 'PROVIDER_FULL'
  /** The provider supplied part of the advert. */
  | 'PROVIDER_PARTIAL'
  /** The user pasted the full advert from the original listing. */
  | 'USER_PASTED';

export interface JobDescriptionView {
  availability: JobDescriptionAvailability;
  source: JobDescriptionSource;
  /** Exactly what the provider supplied. Never edited, never replaced. */
  providerText?: string;
  /** What the user pasted, stored alongside — never over — the provider's. */
  userText?: string;
  /** Attribution for the provider text, e.g. "Reed". */
  providerLabel: string;
  /** True when the user has supplied a fuller description than the provider. */
  hasUserSuppliedText: boolean;
}

// ── Sponsorship evidence ────────────────────────────────────────────────────

/** Employer-level: about the organisation's licence. Not about this vacancy. */
export interface CompanySponsorEvidenceView {
  registerMatchStatus: SponsorRegisterMatchStatus;
  /** Compact badge from SPONSOR_REGISTER_LABELS. */
  label: string;
  /** Longer explanation from SPONSOR_REGISTER_EXPLANATIONS. */
  statement: string;
  /** The register's own organisation name, when a match was made. */
  matchedOrganisationName?: string;
  /** Which register edition produced this, so stale evidence is visible. */
  registerVersion?: string;
  checkedAt?: string;
}

/** Vacancy-level: about this advert's wording. Not about the employer. */
export interface VacancySponsorEvidenceView {
  wording: JobSponsorshipWording;
  label: string;
  statement: string;
  /** Verbatim fragments of the advert the wording was read from. */
  sourceExcerpts?: string[];
}

export interface SponsorEvidenceView {
  company: CompanySponsorEvidenceView;
  vacancy: VacancySponsorEvidenceView;
  /** SPONSOR_REGISTER_DISCLAIMER. Rendered wherever company evidence appears. */
  disclaimer: string;
}

/**
 * Eligibility hints reach the UI unchanged: they are verbatim readings of the
 * advert, so re-shaping them for display is how a hint drifts from its source.
 */
export type EligibilityHintView = EligibilityHint;

// ── Shared value objects ────────────────────────────────────────────────────

export interface SalaryView {
  /** The provider's own wording, preserved for display. */
  text?: string;
  min?: number;
  max?: number;
  period?: JobSalaryPeriod;
  currency?: 'GBP';
}

export interface JobProviderAttributionView {
  provider: JobProvider;
  label: string;
  /** The listing on that provider. */
  sourceUrl: string;
  /** True when this URL is the employer's own application page. */
  employerDirect: boolean;
}

/**
 * A persisted canonical analysis of this vacancy. Its presence is the ONLY
 * condition under which the Job Board may show a fit percentage.
 */
export interface JobAnalysisView {
  analysisId: string;
  /** 0–100, read from the persisted analysis. Never recomputed client-side. */
  fitPercentage: number;
  /** Unmet mandatory requirements, from that analysis's requirement ledger. */
  mandatoryGapCount: number | null;
  analysedAt: string;
  /**
   * `LIMITED` when the analysis ran against a partial description, so the report
   * can warn that requirements may be missing.
   */
  confidence: 'STANDARD' | 'LIMITED';
  /** Whether a newer description exists than the one analysed. */
  stale: boolean;
}

export type JobAvailabilityStatus = 'ACTIVE' | 'POSSIBLY_EXPIRED' | 'EXPIRED' | 'REMOVED';

// ── Job list and details ────────────────────────────────────────────────────

export interface JobListItemView {
  /** Durable snapshot id — safe to put in a URL and to store. */
  jobSnapshotId: string;
  title: string;
  employerName: string;
  locationText: string;
  city?: string;
  workStyle: JobRemoteType;
  salary?: SalaryView;
  contractType?: string;
  postedAt?: string;
  providers: JobProviderAttributionView[];
  /** Completeness only — the list never renders description text. */
  descriptionAvailability: JobDescriptionAvailability;
  descriptionSource: JobDescriptionSource;
  relevance: DiscoveryRelevance;
  sponsorship: SponsorEvidenceView;
  saved: boolean;
  status: JobAvailabilityStatus;
  /** Present only when a canonical analysis of this vacancy exists. */
  analysis?: JobAnalysisView;
}

export interface JobDetailsView extends Omit<JobListItemView, 'descriptionAvailability' | 'descriptionSource'> {
  employerRegion?: string;
  employerCountry?: string;
  employmentType?: string;
  seniority?: string;
  expiresAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  description: JobDescriptionView;
  eligibilityHints: EligibilityHintView[];
  /** The employer's canonical application page. */
  originalListingUrl: string;
  /** Linked company record, when identity confidence was sufficient to link. */
  companyReference?: string;
}

// ── Saved jobs ──────────────────────────────────────────────────────────────

export type SavedJobAnalysisFilter = 'ALL' | 'NOT_ANALYSED' | 'ANALYSED' | 'STRONGEST_FIT' | 'ACTIVE' | 'INACTIVE';
export type SavedJobSort = 'RECENTLY_SAVED' | 'RECENTLY_POSTED' | 'HIGHEST_FIT' | 'SALARY' | 'COMPANY';

export interface SavedJobView {
  savedJobId: string;
  savedAt: string;
  /** The Career Track it was saved against, when one was active. */
  careerTrackId?: string;
  careerTrackLabel?: string;
  job: JobListItemView;
}

export interface SavedJobsResponseView {
  items: SavedJobView[];
  totalSaved: number;
  totalAnalysed: number;
  /** Remaining allowance from the entitlement service; null when unmetered. */
  remaining: number | null;
  limit: number | null;
}

// ── Companies ───────────────────────────────────────────────────────────────

export interface CompanySummaryView {
  companyReference: string;
  displayName: string;
  /** Register evidence only — never merged with vacancy wording. */
  sponsorship: CompanySponsorEvidenceView;
  disclaimer: string;
  /** Vacancies Align currently holds for this employer. */
  activeJobCount: number;
  /** Vacancies whose own wording mentions sponsorship being available. */
  jobsMentioningSponsorship: number;
  /** Vacancies whose own wording excludes sponsorship. */
  jobsExcludingSponsorship: number;
  /** Vacancies requiring an existing right to work. */
  jobsRequiringRightToWork: number;
  /** True when vacancies come from the employer's own ATS board. */
  employerDirect: boolean;
}

export interface CompanyDetailView extends CompanySummaryView {
  /** The register's own organisation name, when matched. */
  matchedSponsorOrganisationName?: string;
  careersUrl?: string;
  websiteUrl?: string;
  jobs: JobListItemView[];
  savedJobCount: number;
  previousAnalysisCount: number;
}

// ── Match preparation ───────────────────────────────────────────────────────

export interface MatchPreparationCareerTrackView {
  careerTrackId: string;
  label: string;
  isDefault: boolean;
}

/** Current `job_match_analysis` allowance, read from the entitlement service. */
export interface MatchPreparationUsageView {
  used: number;
  limit: number | null;
  remaining: number | null;
  period: string;
}

/**
 * Everything the preparation surface needs. Assembling this must consume no
 * quota: it is a read of existing state, and only "Run job match" reserves.
 */
export interface MatchPreparationView {
  jobSnapshotId: string;
  title: string;
  employerName: string;
  locationText: string;
  originalListingUrl: string;
  careerTracks: MatchPreparationCareerTrackView[];
  selectedCareerTrackId?: string;
  description: JobDescriptionView;
  sponsorship: SponsorEvidenceView;
  eligibilityHints: EligibilityHintView[];
  usage: MatchPreparationUsageView;
  /**
   * An analysis of this same description against this same track already exists.
   * The user is offered it instead of spending another unit.
   */
  existingAnalysis?: JobAnalysisView;
  /** True when running now would produce a LIMITED-confidence analysis. */
  requiresPartialAcknowledgement: boolean;
}

// ── Search response ─────────────────────────────────────────────────────────

export interface ProviderStatusView {
  provider: JobProvider;
  label: string;
  status: ProviderSearchStatus;
  /** Records this provider returned before dedupe. */
  returned: number;
  /** Jobs in the RENDERED list this provider contributed to. */
  contributedToResults: number;
  durationMs: number;
  fromCache: boolean;
}

export interface JobSearchMetaView {
  /** Total records returned across providers, before dedupe. */
  providerResultCount: number;
  /** Jobs actually rendered after dedupe and filtering. Never equated above. */
  uniqueJobCount: number;
  providers: ProviderStatusView[];
  /** True when at least one provider failed or timed out. */
  partialResults: boolean;
  /** Set when results were served from cache while a refresh runs behind them. */
  refreshing: boolean;
  servedFrom: 'FRESH' | 'STALE' | 'LIVE';
  /** Opaque cursor for Load more. Absent when every source is exhausted. */
  sessionId?: string;
  hasMore: boolean;
}

export interface JobSearchResponseView {
  jobs: JobListItemView[];
  meta: JobSearchMetaView;
}

// Phase 10 stable Job Board API contract. These lightweight views deliberately
// omit provider payloads, raw Prisma shapes, descriptions and private evidence.
export type JobCardViewModel = {
  id: string;
  title: string;
  company: { id?: string; displayName: string };
  location?: string;
  workplaceType?: string;
  employmentType?: string;
  salary?: { text?: string; min?: number; max?: number; period?: string; currency?: string };
  postedAt?: string;
  freshness: 'FRESH' | 'STALE';
  sourceSummary: { preferredProvider: string; providerCount: number; employerDirect: boolean };
  sponsorEvidenceSummary?: { status: 'MATCHED' | 'AMBIGUOUS' | 'NONE' | 'NOT_CHECKED' };
  careerTrackRelevance?: 'HIGH' | 'MEDIUM' | 'LOW';
  saved: boolean;
};

export type CompanyCardViewModel = {
  id: string;
  displayName: string;
  industry?: string;
  websiteUrl?: string;
  careersUrl?: string;
  sponsorEvidenceSummary: { status: 'MATCHED' | 'AMBIGUOUS' | 'NONE' | 'NOT_CHECKED' };
  verifiedSourceCount: number;
  activeJobCount: number;
  providers: string[];
  lastRefreshedAt?: string;
};

export type ApiPaginationView = { hasMore: boolean; nextCursor?: string };
