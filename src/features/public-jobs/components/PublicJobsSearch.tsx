"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Filter,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";

type PublicJobCard = {
  id: string;
  title: string;
  company: { displayName: string };
  location?: string;
  workplaceType?: string;
  employmentType?: string;
  salary?: { text?: string; min?: number; max?: number; currency?: string };
  postedAt?: string;
  fullDescriptionExternalUrl?: string;
  sourceSummary: {
    preferredProvider: string;
    providerCount: number;
    employerDirect: boolean;
  };
};
type SearchResponse = {
  jobs: PublicJobCard[];
  sessionId: string;
  meta: { hasMore: boolean; partialResults: boolean; message?: string };
};

const PROVIDER_LABELS: Record<string, string> = {
  ADZUNA: "Adzuna",
  REED: "Reed",
  JOOBLE: "Jooble",
  NHS_JOBS: "NHS Jobs",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  SMARTRECRUITERS: "SmartRecruiters",
};

function salaryLabel(salary?: PublicJobCard["salary"]) {
  if (!salary) return undefined;
  if (salary.text) return salary.text;
  const currency = salary.currency === "GBP" ? "£" : "";
  if (salary.min != null && salary.max != null)
    return `${currency}${salary.min.toLocaleString()}–${currency}${salary.max.toLocaleString()}`;
  const amount = salary.min ?? salary.max;
  return amount == null ? undefined : `${currency}${amount.toLocaleString()}`;
}

export default function PublicJobsSearch({
  initialQuery = "",
  initialLocation = "",
}: {
  initialQuery?: string;
  initialLocation?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [contractType, setContractType] = useState("all");
  const [remoteType, setRemoteType] = useState("all");
  const [postedWithinDays, setPostedWithinDays] = useState("30");
  const [experience, setExperience] = useState("all");
  const [salaryMin, setSalaryMin] = useState("all");
  const [sponsorship, setSponsorship] = useState("all");
  const [source, setSource] = useState("all");
  const [sortBy, setSortBy] = useState("relevance");
  const [jobs, setJobs] = useState<PublicJobCard[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [partialMessage, setPartialMessage] = useState<string>();
  const [searched, setSearched] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function search(append = false) {
    if (!query.trim()) {
      setError("Enter a job title or keyword to search current vacancies.");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        location: location.trim(),
        perPage: "12",
      });
      if (contractType !== "all") params.set("contractType", contractType);
      if (remoteType !== "all") params.set("remoteType", remoteType);
      if (postedWithinDays !== "all")
        params.set("postedWithinDays", postedWithinDays);
      if (experience !== "all") params.set("experience", experience);
      if (salaryMin !== "all") params.set("salaryMin", salaryMin);
      if (sponsorship !== "all") params.set("sponsorship", sponsorship);
      if (source !== "all") params.set("source", source);
      if (sortBy !== "relevance") params.set("sortBy", sortBy);
      if (append && sessionId) params.set("sessionId", sessionId);
      const response = await fetch(`/api/jobs?${params.toString()}`);
      if (!response.ok) throw new Error("search_failed");
      const data = (await response.json()) as SearchResponse;
      setJobs((current) => (append ? [...current, ...data.jobs] : data.jobs));
      setSessionId(data.sessionId);
      setHasMore(data.meta.hasMore);
      setPartialMessage(
        data.meta.partialResults
          ? (data.meta.message ?? "Some sources are temporarily unavailable.")
          : undefined,
      );
      setSearched(true);
    } catch {
      setError(
        "Vacancies could not be loaded. Check your connection and try the search again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void search(false);
  }
  function resetFilters() {
    setContractType("all");
    setRemoteType("all");
    setPostedWithinDays("30");
    setExperience("all");
    setSalaryMin("all");
    setSponsorship("all");
    setSource("all");
    setSortBy("relevance");
  }

  const filters = (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal
            className="h-4 w-4 text-violet-600"
            aria-hidden="true"
          />
          <h2 className="font-semibold text-slate-950">Filter results</h2>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="text-xs font-semibold text-violet-700 hover:text-violet-900"
        >
          Reset
        </button>
      </div>
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Role and Pay
        </p>
        <label className="block text-xs font-semibold text-slate-600">
          Experience level
          <select
            value={experience}
            onChange={(event) => setExperience(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Any experience</option>
            <option value="junior">Entry and junior</option>
            <option value="mid">Mid-level</option>
            <option value="senior">Senior and lead</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Minimum salary
          <select
            value={salaryMin}
            onChange={(event) => setSalaryMin(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Any advertised salary</option>
            <option value="25000">£25,000+</option>
            <option value="30000">£30,000+</option>
            <option value="40000">£40,000+</option>
            <option value="50000">£50,000+</option>
            <option value="75000">£75,000+</option>
          </select>
        </label>
      </div>
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Vacancy Details
        </p>
        <label className="block text-xs font-semibold text-slate-600">
          Contract type
          <select
            value={contractType}
            onChange={(event) => setContractType(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Any contract</option>
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="temporary">Temporary</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Work style
          <select
            value={remoteType}
            onChange={(event) => setRemoteType(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Any stated work style</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">On-site</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Posted
          <select
            value={postedWithinDays}
            onChange={(event) => setPostedWithinDays(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="7">Past week</option>
            <option value="14">Past fortnight</option>
            <option value="30">Past month</option>
            <option value="all">Any time</option>
          </select>
        </label>
      </div>
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Evidence and Source
        </p>
        <label className="block text-xs font-semibold text-slate-600">
          Sponsorship context
          <select
            value={sponsorship}
            onChange={(event) => setSponsorship(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Any sponsorship context</option>
            <option value="registered">Employer on sponsor register</option>
            <option value="offered">Listing mentions availability</option>
            <option value="exclude_no_sponsorship">
              Exclude explicit unavailability
            </option>
          </select>
        </label>
        <p className="-mt-2 text-[11px] leading-4 text-slate-500">
          Register evidence does not confirm sponsorship for a vacancy.
        </p>
        <label className="block text-xs font-semibold text-slate-600">
          Source
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">All integrated sources</option>
            <option value="adzuna">Adzuna</option>
            <option value="reed">Reed</option>
            <option value="jooble">Jooble</option>
            <option value="nhs_jobs">NHS Jobs</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Sort results
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-100"
          >
            <option value="relevance">Best match</option>
            <option value="date">Newest first</option>
            <option value="salary_desc">Salary: high to low</option>
            <option value="salary_asc">Salary: low to high</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => void search(false)}
        disabled={loading || !query.trim()}
        className="min-h-11 w-full rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Apply filters
      </button>
    </div>
  );

  return (
    <div className="bg-white">
      <section
        data-testid="jobs-search-chapter"
        className="relative overflow-hidden border-b border-violet-100 pt-24 [background:radial-gradient(circle_at_16%_78%,rgba(186,230,253,0.95),transparent_31%),radial-gradient(circle_at_72%_105%,rgba(216,180,254,0.88),transparent_34%),linear-gradient(108deg,#f7f6ff_0%,#eef6ff_48%,#fff7fc_100%)]"
      >
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              Find your next UK opportunity.
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-700 sm:text-base">
              Search current vacancies from Align&apos;s integrated sources and
              continue directly to the original posting.
            </p>
          </div>
          <form
            onSubmit={submit}
            className="mx-auto mt-7 max-w-4xl rounded-2xl bg-white p-2.5 shadow-[0_16px_40px_rgba(74,63,159,0.16)]"
          >
            <div className="grid gap-2.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
              <label className="relative">
                <span className="sr-only">Job title</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-violet-500"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Job title"
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 !pl-12 !pr-4 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="relative">
                <span className="sr-only">Location</span>
                <MapPin
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-violet-500"
                />
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Town, city or UK-wide"
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 !pl-12 !pr-4 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-violet-600 px-6 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(103,87,217,0.22)] transition hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <Search aria-hidden="true" className="h-4 w-4" />
                )}
                Search
              </button>
            </div>
          </form>
          <div className="mx-auto mt-5 flex max-w-4xl flex-col items-center justify-center gap-1.5 text-center text-sm text-slate-700 sm:flex-row sm:gap-2">
            <p>
              Want saved jobs, Career Profile matching, and tailored application
              tools?
            </p>
            <Link
              href="/login?callbackURL=%2Fdashboard%2Fjobs"
              className="font-semibold text-violet-800 underline decoration-violet-400 underline-offset-4 hover:text-violet-950"
            >
              Continue in your dashboard
            </Link>
          </div>
        </div>
      </section>

      <section
        data-testid="jobs-results-canvas"
        className="relative overflow-hidden bg-white"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <svg
            className="absolute -right-24 top-8 h-[34rem] w-[34rem] text-violet-100/80"
            viewBox="0 0 544 544"
            fill="none"
          >
            <circle cx="272" cy="272" r="158" stroke="currentColor" />
            <circle
              cx="272"
              cy="272"
              r="214"
              stroke="currentColor"
              strokeDasharray="3 12"
            />
            <path
              d="M70 332C166 229 257 209 365 251C426 275 480 268 525 222"
              stroke="currentColor"
              strokeWidth="1.25"
            />
          </svg>
          <svg
            className="absolute -left-16 bottom-8 h-72 w-72 text-cyan-100/85"
            viewBox="0 0 288 288"
            fill="none"
          >
            <path
              d="M18 248C48 138 119 74 250 34"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            {Array.from({ length: 8 }, (_, index) => (
              <circle
                key={index}
                cx={38 + index * 24}
                cy={226 - index * 22}
                r="2.5"
                fill="currentColor"
              />
            ))}
          </svg>
        </div>
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            >
              {error}
            </p>
          )}
          {partialMessage && (
            <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {partialMessage}
            </p>
          )}
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">
                {searched ? "Current vacancies" : "Search UK vacancies"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {searched
                  ? `${jobs.length} current results shown from Align’s integrated sources.`
                  : "Choose a role and use only the filters that matter to you."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 lg:hidden"
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
            <aside
              className={`${filtersOpen ? "block" : "hidden"} rounded-2xl border border-slate-200 bg-white p-5 lg:col-start-2 lg:row-start-1 lg:block`}
            >
              {filters}
            </aside>
            <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
              {!searched && !loading && (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
                  <BriefcaseBusiness
                    className="mx-auto h-7 w-7 text-violet-600"
                    aria-hidden="true"
                  />
                  <p className="mt-3 font-semibold text-slate-950">
                    Current jobs, direct source links.
                  </p>
                  <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-600">
                    Results are normalized and deduplicated. Public searches are
                    not saved to your account.
                  </p>
                </div>
              )}
              {searched && !loading && jobs.length === 0 && !error && (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
                  <p className="font-semibold text-slate-950">
                    No vacancies matched this search.
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Try a broader role term or reset one of the filters.
                  </p>
                </div>
              )}
              {jobs.map((job) => {
                const salary = salaryLabel(job.salary);
                return (
                  <article
                    key={job.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-lg bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">
                            {PROVIDER_LABELS[
                              job.sourceSummary.preferredProvider
                            ] ?? job.sourceSummary.preferredProvider}
                          </span>
                          {job.sourceSummary.employerDirect && (
                            <span className="font-medium text-emerald-700">
                              Employer-direct
                            </span>
                          )}
                        </div>
                        <h3 className="mt-3 text-base font-semibold tracking-[-0.015em] text-slate-950 sm:text-lg">
                          {job.title}
                        </h3>
                        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-700">
                          <Building2
                            className="h-4 w-4 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                          {job.company.displayName}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                          {job.location && (
                            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                              {job.location}
                            </span>
                          )}
                          {job.workplaceType && job.workplaceType !== "UNKNOWN" && (
                            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                              {job.workplaceType.toLowerCase()}
                            </span>
                          )}
                          {job.employmentType && (
                            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                              {job.employmentType}
                            </span>
                          )}
                          {job.postedAt && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {new Date(job.postedAt).toLocaleDateString(
                                "en-GB",
                                { day: "numeric", month: "short" },
                              )}
                            </span>
                          )}
                        </div>
                        {salary && (
                          <p className="mt-3 text-sm font-semibold tabular-nums text-slate-950">
                            {salary}
                          </p>
                        )}
                      </div>
                      {job.fullDescriptionExternalUrl && (
                        <a
                          href={job.fullDescriptionExternalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-violet-100"
                        >
                          View original posting
                          <ArrowUpRight
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
              {hasMore && (
                <div className="flex justify-center pt-3">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void search(true)}
                    className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-900 disabled:opacity-60"
                  >
                    Load more vacancies
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
