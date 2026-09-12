export const JOB_BOARD_ROUTES = {
  discover: "/dashboard/jobs",
  saved: "/dashboard/jobs/saved",
  companies: "/dashboard/jobs/companies",
  intake: "/dashboard/jobs/analyze",
  details: (jobSnapshotId: string) =>
    `/dashboard/jobs/${encodeURIComponent(jobSnapshotId)}`,
  company: (companyRecordId: string) =>
    `/dashboard/jobs/companies/${encodeURIComponent(companyRecordId)}`,
} as const;

export type SponsorStatus = "MATCHED" | "AMBIGUOUS" | "NONE" | "NOT_CHECKED";
/**
 * Why a NOT_CHECKED is NOT_CHECKED. "The register was unreachable" and "nobody
 * has looked yet" read identically without this, and neither is "no match found".
 */
export type SponsorCheckState =
  | "NEVER_CHECKED"
  | "CHECK_UNAVAILABLE"
  | "EMPLOYER_UNIDENTIFIABLE"
  | "COMPANY_UNRESOLVED";
export type Relevance = "HIGH" | "MEDIUM" | "LOW";

/** One candidate ↔ vacancy practical comparison. Never a score, never advice. */
export type CandidateFactState =
  | "CONFIRMED"
  | "CONFLICT"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export interface PracticalCompatibilityItemViewModel {
  category: string;
  state: CandidateFactState;
  vacancyRequirement?: string;
  confirmedProfileFact?: string;
  explanation: string;
  source: "PROFILE" | "VACANCY" | "BOTH";
}

export interface PracticalCompatibilityViewModel {
  items: PracticalCompatibilityItemViewModel[];
  summary: {
    confirmed: number;
    conflicts: number;
    unknown: number;
    notApplicable: number;
  };
  updatableCategories?: string[];
  disclaimer: string;
}

export type DescriptionAvailability = "FULL" | "PARTIAL" | "EXTERNAL_ONLY";
export type DescriptionSource =
  | "PROVIDER_FULL"
  | "PROVIDER_PARTIAL"
  | "USER_PASTED";

export interface JobCardViewModel {
  id: string;
  title: string;
  company: { id?: string; displayName: string };
  location?: string;
  countryCode?: string;
  /**
   * Server-computed description state. NEVER re-derive this in React from text
   * length or from `freshness` — `freshness` is snapshot age and is FRESH for
   * almost every discovered vacancy, which is exactly how every card came to be
   * badged "Full Description".
   */
  descriptionAvailability?: DescriptionAvailability;
  /** Whether opening a Description view would show real content. */
  hasReadableDescription?: boolean;
  /** Safe, backend-validated URL for the complete advert on the source site. */
  fullDescriptionExternalUrl?: string;
  workplaceType?: string;
  employmentType?: string;
  salary?: {
    text?: string;
    min?: number;
    max?: number;
    currency?: string;
    period?: string;
  };
  postedAt?: string;
  freshness: "FRESH" | "STALE";
  sourceSummary: {
    preferredProvider: string;
    providerCount: number;
    employerDirect: boolean;
  };
  sponsorEvidenceSummary?: { status: SponsorStatus };
  saved: boolean;
  careerTrackRelevance?: Relevance;
}

export interface Page<T> {
  items: T[];
  page: { hasMore: boolean; nextCursor?: string };
}

export interface CareerTrack {
  profileId: string;
  label: string;
  isDefault?: boolean;
}

export interface SearchMeta {
  cached?: boolean;
  cacheState?: string;
  /**
   * Whether the server can actually serve another page. Absent only on older
   * responses; never re-derive it from the page size, which is a merged count
   * and says nothing about whether the providers behind it have more.
   */
  hasMore?: boolean;
  cacheBackend?: string;
  selectedCareerTrackId?: string;
  providerCounts?: Array<{
    provider: string;
    status: string;
    uniqueContributed?: number;
  }>;
  providerResults?: Array<{ provider: string; status: string }>;
}

export interface SearchResponse {
  jobs: JobCardViewModel[];
  sessionId: string;
  meta: SearchMeta;
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface JobDetailsViewModel {
  job: JobCardViewModel;
  description: {
    text?: string;
    source: DescriptionSource | "NONE";
    completeness: DescriptionAvailability;
    /** Whether the Description tab would open onto real content. */
    hasReadableText?: boolean;
    intelligenceCurrent?: boolean;
  };
  /** Provider text, kept addressable separately from anything the user pasted. */
  providerDescription?: string;
  providerDescriptionAvailability?: DescriptionAvailability;
  userPastedDescription?: string;
  activeDescriptionSource?: DescriptionSource;
  activeDescriptionHash?: string;
  /**
   * Rule-based assessment of the description that was actually stored, present
   * only while it still describes the selected text. Absent means "not
   * assessed" — never render it as a quality verdict of its own.
   */
  descriptionAssessment?: {
    availability?: string;
    confidence?: Confidence;
    reasons?: string[];
    source?: string | null;
  };
  assessedAt?: string;
  /**
   * BLOCK 1 of the sponsorship story: evidence about the EMPLOYER's name against
   * the UK register. Rendered separately from `vacancySponsorship` below, which
   * is what this specific advert says. The two are never combined.
   */
  sponsorEvidence: {
    status?: SponsorStatus;
    /** Retained for older clients; identical to `status`. */
    summary: { status: SponsorStatus };
    disclaimer: string;
    matchedOrganisationName?: string;
    checkedAt?: string;
    registerVersion?: string;
    checkState?: SponsorCheckState;
    /** Evidence belongs to a superseded register generation. */
    stale?: boolean;
    confidenceBand?: "EXACT" | "STRONG" | "AMBIGUOUS";
    reasons?: string[];
  };
  /** BLOCK 3: the signed-in user's own confirmed facts against this vacancy. */
  practicalCompatibility?: PracticalCompatibilityViewModel;
  practicalCompatibilityProfileId?: string;
  sourceProvenance: Array<{
    provider: string;
    providerJobId?: string;
    hostedUrl?: string;
    applicationUrl?: string;
  }>;
  applicationUrl?: string;
  hostedUrl?: string;
  availability: string;
  firstSeenAt?: string;
  lastRefreshedAt?: string;
  practicalRequirements?: Array<{
    category?: string;
    requirement?: "REQUIRED" | "PREFERRED" | "MENTIONED" | "NOT_DETECTED";
    value?: string;
    evidenceText?: string;
    confidence?: Confidence;
  }>;
  vacancySponsorship?: {
    signal?: string;
    evidence?: Array<{ text: string }>;
    confidence?: Confidence;
    reasons?: string[];
  };
  matchPreparation?: {
    eligible: boolean;
    /** True when the user must paste the complete advert before a formal match. */
    requiresPastedDescription?: boolean;
    reason?: string;
  };
  availableCareerTracks: Array<{ id: string; label: string }>;
}

export interface CompanyViewModel {
  id: string;
  displayName: string;
  industry?: string;
  websiteUrl?: string;
  careersUrl?: string;
  sponsorEvidenceSummary: { status: SponsorStatus };
  verifiedSourceCount: number;
  /** CURRENT UK vacancies. Not the employer's global board total. */
  activeJobCount: number;
  totalActiveJobCount?: number;
  ukScope?:
    | "UK_RELEVANT"
    | "GLOBAL_WITH_UK_JOBS"
    | "NOT_CURRENTLY_UK_RELEVANT"
    | "UNKNOWN";
  providers: string[];
  lastRefreshedAt?: string;
}

export interface CompanySponsorHistoryViewModel {
  registerVersion: string;
  status: SponsorStatus;
  organisationName?: string;
  checkedAt: string;
  current: boolean;
}

export interface DiscoverFilters {
  query: string;
  location: string;
  workplace: "all" | "REMOTE" | "HYBRID" | "ONSITE";
  employmentType: "all" | "permanent" | "contract" | "temporary";
  salaryMin: string;
  freshness: "" | "1" | "7" | "30";
  sponsorStatus: "all" | "registered";
  sort: "relevance" | "date" | "salary_desc" | "salary_asc";
  careerTrackId: string;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  query: "",
  location: "",
  workplace: "all",
  employmentType: "all",
  salaryMin: "",
  freshness: "",
  sponsorStatus: "all",
  sort: "relevance",
  careerTrackId: "",
};

const oneOf = <T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T => (value && allowed.includes(value as T) ? (value as T) : fallback);

export function parseDiscoverFilters(
  params: Pick<URLSearchParams, "get">,
): DiscoverFilters {
  const salary = params.get("salaryMin") ?? "";
  return {
    query: (params.get("q") ?? "").slice(0, 200),
    location: (params.get("location") ?? "").slice(0, 100),
    workplace: oneOf(
      params.get("workplace"),
      ["all", "REMOTE", "HYBRID", "ONSITE"],
      "all",
    ),
    employmentType: oneOf(
      params.get("employmentType"),
      ["all", "permanent", "contract", "temporary"],
      "all",
    ),
    salaryMin: /^\d{1,7}$/.test(salary) ? salary : "",
    freshness: oneOf(params.get("freshness"), ["", "1", "7", "30"], ""),
    sponsorStatus: oneOf(
      params.get("sponsorStatus"),
      ["all", "registered"],
      "all",
    ),
    sort: oneOf(
      params.get("sort"),
      ["relevance", "date", "salary_desc", "salary_asc"],
      "relevance",
    ),
    careerTrackId: (params.get("careerTrack") ?? "").slice(0, 200),
  };
}

export function filtersToUrl(filters: DiscoverFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.workplace !== "all") params.set("workplace", filters.workplace);
  if (filters.employmentType !== "all")
    params.set("employmentType", filters.employmentType);
  if (filters.salaryMin) params.set("salaryMin", filters.salaryMin);
  if (filters.freshness) params.set("freshness", filters.freshness);
  if (filters.sponsorStatus !== "all")
    params.set("sponsorStatus", filters.sponsorStatus);
  if (filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.careerTrackId) params.set("careerTrack", filters.careerTrackId);
  return params;
}

export function filtersToApi(
  filters: DiscoverFilters,
  sessionId?: string,
): URLSearchParams {
  const params = new URLSearchParams({
    query: filters.query.trim(),
    remoteType: filters.workplace,
    contractType: filters.employmentType,
    sponsorship: filters.sponsorStatus,
    sortBy: filters.sort,
    perPage: "15",
  });
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.salaryMin) params.set("salaryMin", filters.salaryMin);
  if (filters.freshness) params.set("postedWithinDays", filters.freshness);
  if (filters.careerTrackId) params.set("careerTrackId", filters.careerTrackId);
  if (sessionId) params.set("sessionId", sessionId);
  return params;
}

const DEGRADED_PROVIDER_STATES = new Set([
  "TIMEOUT",
  "TIMED_OUT",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "FAILED",
  "STALE_CACHE",
]);

export function hasDegradedProviders(meta: SearchMeta): boolean {
  return (meta.providerResults ?? meta.providerCounts ?? []).some((item) =>
    DEGRADED_PROVIDER_STATES.has(item.status),
  );
}

type ApiErrorBody = {
  error?: string | { message?: string; code?: string };
  code?: string;
};

export async function readJson<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    const contractError =
      body.error && typeof body.error === "object" ? body.error : undefined;
    throw Object.assign(
      new Error(
        contractError?.message ??
          (typeof body.error === "string" ? body.error : undefined) ??
          "Unable to complete this request.",
      ),
      {
        code: contractError?.code ?? body.code,
        status: response.status,
      },
    );
  }
  return body;
}
