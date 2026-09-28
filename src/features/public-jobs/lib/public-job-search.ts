export type PublicJobFilters = {
  query: string;
  location: string;
  source: "all" | "adzuna" | "reed" | "jooble" | "nhs_jobs";
  salaryMin: "all" | "25000" | "30000" | "40000" | "50000" | "75000";
  experience: "all" | "junior" | "mid" | "senior";
  sponsorship:
    | "all"
    | "offered"
    | "required"
    | "registered"
    | "exclude_no_sponsorship";
  contractType: "all" | "permanent" | "contract" | "temporary";
  remoteType: "all" | "REMOTE" | "HYBRID" | "ONSITE";
  postedWithinDays: "all" | "7" | "14" | "30";
  sortBy: "relevance" | "date" | "salary_desc" | "salary_asc";
};

export const DEFAULT_PUBLIC_JOB_FILTERS: PublicJobFilters = {
  query: "",
  location: "",
  source: "all",
  salaryMin: "all",
  experience: "all",
  sponsorship: "all",
  contractType: "all",
  remoteType: "all",
  postedWithinDays: "30",
  sortBy: "relevance",
};

const oneOf = <T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T => (value && allowed.includes(value as T) ? (value as T) : fallback);

export function parsePublicJobFilters(
  params: Pick<URLSearchParams, "get">,
): PublicJobFilters {
  return {
    query: (params.get("q") ?? "").slice(0, 200),
    location: (params.get("location") ?? "").slice(0, 100),
    source: oneOf(
      params.get("source"),
      ["all", "adzuna", "reed", "jooble", "nhs_jobs"],
      "all",
    ),
    salaryMin: oneOf(
      params.get("salaryMin"),
      ["all", "25000", "30000", "40000", "50000", "75000"],
      "all",
    ),
    experience: oneOf(
      params.get("experience"),
      ["all", "junior", "mid", "senior"],
      "all",
    ),
    sponsorship: oneOf(
      params.get("sponsorship"),
      ["all", "offered", "required", "registered", "exclude_no_sponsorship"],
      "all",
    ),
    contractType: oneOf(
      params.get("contractType"),
      ["all", "permanent", "contract", "temporary"],
      "all",
    ),
    remoteType: oneOf(
      params.get("remoteType"),
      ["all", "REMOTE", "HYBRID", "ONSITE"],
      "all",
    ),
    postedWithinDays: oneOf(
      params.get("postedWithinDays"),
      ["all", "7", "14", "30"],
      "30",
    ),
    sortBy: oneOf(
      params.get("sortBy"),
      ["relevance", "date", "salary_desc", "salary_asc"],
      "relevance",
    ),
  };
}

export function publicJobFiltersToUrl(
  filters: PublicJobFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.location.trim()) params.set("location", filters.location.trim());
  params.set("source", filters.source);
  params.set("salaryMin", filters.salaryMin);
  params.set("experience", filters.experience);
  params.set("sponsorship", filters.sponsorship);
  params.set("contractType", filters.contractType);
  params.set("remoteType", filters.remoteType);
  params.set("postedWithinDays", filters.postedWithinDays);
  params.set("sortBy", filters.sortBy);
  return params;
}

export function publicJobFiltersToApi(
  filters: PublicJobFilters,
  sessionId?: string,
): URLSearchParams {
  const params = new URLSearchParams({
    query: filters.query.trim(),
    location: filters.location.trim(),
    perPage: "12",
  });
  if (filters.contractType !== "all") params.set("contractType", filters.contractType);
  if (filters.remoteType !== "all") params.set("remoteType", filters.remoteType);
  if (filters.postedWithinDays !== "all") params.set("postedWithinDays", filters.postedWithinDays);
  if (filters.experience !== "all") params.set("experience", filters.experience);
  if (filters.salaryMin !== "all") params.set("salaryMin", filters.salaryMin);
  if (filters.sponsorship !== "all") params.set("sponsorship", filters.sponsorship);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.sortBy !== "relevance") params.set("sortBy", filters.sortBy);
  if (sessionId) params.set("sessionId", sessionId);
  return params;
}
