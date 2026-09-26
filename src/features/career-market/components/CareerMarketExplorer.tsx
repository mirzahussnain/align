"use client";

import { FormEvent, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Clock3,
  Database,
  Loader2,
  MapPin,
  Search,
} from "lucide-react";
import type {
  CareerMarketSnapshotView,
  MarketMixItem,
} from "@/shared/types/career-market";

type ApiResponse = {
  freshness: "FRESH" | "GENERATED" | "STALE" | "PENDING";
  snapshot: CareerMarketSnapshotView | null;
  methodology: {
    statement: string;
    salaryMethod: string;
    sponsorshipMethod: string;
  };
};
const POPULAR_ROLES = [
  "Software Engineer",
  "Data Analyst",
  "Project Manager",
  "Registered Nurse",
];
const providerName = (provider: string) =>
  ({ ADZUNA: "Adzuna", REED: "Reed", JOOBLE: "Jooble", NHS_JOBS: "NHS Jobs" })[
    provider
  ] ?? provider;
const money = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);

function MixBars({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: MarketMixItem[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-5 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.label}>
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 break-words capitalize text-slate-700">
                  {item.label.toLowerCase().replaceAll("_", " ")}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-slate-950">
                  {item.count} · {item.share}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${item.share}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">
            Not enough disclosed data in this view.
          </p>
        )}
      </div>
    </section>
  );
}

const mixColors = ["#7c3aed", "#0891b2", "#2563eb", "#8b5cf6", "#0e7490"];

function MixDonut({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: MarketMixItem[];
}) {
  const segments = items.reduce<
    Array<MarketMixItem & { chartOffset: number }>
  >((result, item) => {
    const chartOffset = result.reduce(
      (sum, segment) => sum + segment.share,
      0,
    );
    return [...result, { ...item, chartOffset }];
  }, []);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-5 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-5">
        <svg
          role="img"
          aria-label={`${title} chart`}
          className="h-28 w-28 -rotate-90"
          viewBox="0 0 42 42"
        >
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="6" />
          {segments.map((item, index) => {
            return (
              <circle
                key={item.label}
                cx="21"
                cy="21"
                r="15.9"
                fill="none"
                stroke={mixColors[index % mixColors.length]}
                strokeWidth="6"
                pathLength="100"
                strokeDasharray={`${item.share} ${100 - item.share}`}
                strokeDashoffset={-item.chartOffset}
              />
            );
          })}
          <circle cx="21" cy="21" r="11.5" fill="white" />
        </svg>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.label} className="flex items-start gap-2 text-xs">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: mixColors[index % mixColors.length] }} />
              <span className="min-w-0 flex-1 capitalize text-slate-600">{item.label.toLowerCase().replaceAll("_", " ")}</span>
              <span className="font-semibold tabular-nums text-slate-950">{item.share}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SalaryRange({ minimum, median, maximum }: { minimum: number; median: number; maximum: number }) {
  const medianPosition = maximum === minimum ? 50 : ((median - minimum) / (maximum - minimum)) * 100;
  return (
    <div className="mt-6" aria-label={`Salary range from ${money(minimum)} to ${money(maximum)}, median ${money(median)}`}>
      <div className="relative h-2 rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-blue-600" />
        <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950 shadow-sm" style={{ left: `${medianPosition}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-slate-500"><span>{money(minimum)}</span><span className="font-semibold text-slate-800">Median {money(median)}</span><span>{money(maximum)}</span></div>
    </div>
  );
}

function RankedList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: MarketMixItem[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <ol className="mt-4 divide-y divide-slate-100">
        {items.length ? (
          items.map((item, index) => (
            <li key={item.label} className="flex items-center gap-3 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                {item.label}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {item.count} roles
              </span>
            </li>
          ))
        ) : (
          <li className="py-4 text-sm text-slate-500">
            Not enough employer data in this view.
          </li>
        )}
      </ol>
    </section>
  );
}

export default function CareerMarketExplorer() {
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("UK");
  const [data, setData] = useState<ApiResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (role.trim().length < 2) return;
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({
        role: role.trim(),
        location: location.trim() || "UK",
      });
      const response = await fetch(`/api/trends?${params}`);
      const body = (await response.json()) as ApiResponse;
      if (!response.ok && response.status !== 202)
        throw new Error("unavailable");
      setData(body);
    } catch {
      setError(
        "Current market data could not be prepared just now. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const snapshot = data?.snapshot;
  const includedProviders =
    snapshot?.providerCoverage.filter((item) => item.sampled > 0) ?? [];
  const disclosedWorkStyleRows =
    snapshot?.metrics.workStyleMix.filter(
      (item) => item.label !== "UNKNOWN" && item.label !== "NOT_STATED",
    ) ?? [];
  const disclosedWorkStyleTotal = disclosedWorkStyleRows.reduce(
    (total, item) => total + item.count,
    0,
  );
  const disclosedWorkStyles = disclosedWorkStyleRows.map((item) => ({
    ...item,
    share: disclosedWorkStyleTotal
      ? Math.round((item.count / disclosedWorkStyleTotal) * 1000) / 10
      : 0,
  }));
  return (
    <div className="space-y-7">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold text-slate-600">
            Role or occupation
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Analyst, nurse, project manager"
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Location
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="UK, Leeds, London"
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <button
            disabled={loading || role.trim().length < 2}
            className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Explore market
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="mr-1 text-xs font-semibold text-slate-500">
            Popular roles
          </span>
          {POPULAR_ROLES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRole(item)}
              className={`min-h-9 rounded-xl border px-3 text-xs font-semibold transition ${role === item ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-violet-800 hover:border-violet-200"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </form>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {error}
        </p>
      )}
      {data?.freshness === "PENDING" && !snapshot && (
        <p className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
          This market view is already being refreshed. Try again shortly.
        </p>
      )}
      {!data && !loading && (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center">
          <Database className="mx-auto h-7 w-7 text-violet-600" />
          <p className="mt-3 font-semibold text-slate-950">
            Choose a role to explore current market data.
          </p>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-600">
            You will see the contributing sources, refresh time and field
            availability alongside every result.
          </p>
        </div>
      )}
      {snapshot && (
        <>
          {data.freshness === "STALE" && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              The latest completed market view is shown while a refresh is
              unavailable.
            </p>
          )}
          <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b border-slate-100 p-4 sm:border-r lg:border-b-0">
              <p className="text-xs text-slate-500">
                Current vacancies sampled
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
                {snapshot.sampleSize}
              </p>
            </div>
            <div className="border-b border-slate-100 p-4 lg:border-b-0 lg:border-r">
              <p className="text-xs text-slate-500">Sources included</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
                {includedProviders.length}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {includedProviders
                  .map((item) => providerName(item.provider))
                  .join(", ") || "No source returned vacancies"}
              </p>
            </div>
            <div className="border-b border-slate-100 p-4 sm:border-r sm:border-b-0">
              <p className="text-xs text-slate-500">Last refreshed</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {new Date(snapshot.generatedAt).toLocaleString("en-GB")}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500">Salary available</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
                {snapshot.metrics.salary.disclosureRate}%
              </p>
              <p className="mt-1 text-xs text-slate-500">
                of sampled vacancies
              </p>
            </div>
          </section>

          <section>
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">
                  Market Overview
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {snapshot.roleQuery} · {snapshot.locationQuery}
                </p>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock3 className="h-4 w-4" />
                Current view from Align&apos;s integrated job sources
              </p>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-12">
              <div className="rounded-2xl bg-slate-950 p-5 text-white lg:col-span-4">
                <BriefcaseBusiness className="h-5 w-5 text-cyan-300" />
                <p className="mt-7 text-4xl font-semibold tabular-nums">
                  {snapshot.metrics.sampledVacancyCount}
                </p>
                <p className="mt-1 text-sm text-slate-300">current vacancies</p>
                <p className="mt-5 text-xs leading-5 text-slate-400">
                  Deduplicated across the contributing sources shown above.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-8">
                <p className="text-sm font-semibold text-slate-950">
                  Advertised annual salary
                </p>
                {snapshot.metrics.salary.annualGbp ? (
                  <>
                    <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
                      <p className="text-4xl font-semibold tabular-nums text-slate-950">
                        {money(snapshot.metrics.salary.annualGbp.median)}
                      </p>
                      <span className="pb-1 text-sm text-slate-500">
                        median
                      </span>
                    </div>
                    <SalaryRange
                      minimum={snapshot.metrics.salary.annualGbp.minimum}
                      median={snapshot.metrics.salary.annualGbp.median}
                      maximum={snapshot.metrics.salary.annualGbp.maximum}
                    />
                    <div className="mt-6 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          Annual GBP listings
                        </p>
                        <p className="mt-1 font-semibold tabular-nums text-slate-900">
                          {snapshot.metrics.salary.eligibleAnnualCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Salary stated</p>
                        <p className="mt-1 font-semibold tabular-nums text-slate-900">
                          {snapshot.metrics.salary.disclosureRate}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Current sample</p>
                        <p className="mt-1 font-semibold tabular-nums text-slate-900">
                          {snapshot.metrics.sampledVacancyCount}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-5 text-sm text-slate-500">
                    Not enough normalized annual salary data is available for
                    this role.
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className={`grid gap-4 ${disclosedWorkStyles.length ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
            <MixDonut
              title="Contract Type"
              description="Mix within current sampled vacancies"
              items={snapshot.metrics.contractTypeMix}
            />
            {disclosedWorkStyles.length > 0 && (
              <MixDonut
                title="Work Style"
                description="Remote, hybrid and onsite mix where stated"
                items={disclosedWorkStyles}
              />
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RankedList
              title="Leading Employers"
              description="Top employers within this sampled provider set"
              items={snapshot.metrics.topEmployers}
            />
            <MixBars
              title="Geographical Distribution"
              description="Regional distribution within sampled vacancies"
              items={snapshot.metrics.regions}
            />
          </div>

          <section>
            <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">
              Current Opportunities
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Open the provider&apos;s original posting for full details and
              application steps.
            </p>
            <div className="mt-4 space-y-3">
              {snapshot.metrics.currentVacancies.map((job) => (
                <article
                  key={job.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-violet-700">
                      {providerName(job.provider)}
                    </p>
                    <h3 className="mt-1 font-semibold text-slate-950">
                      {job.title}
                    </h3>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {job.employer}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.location}
                      </span>
                      {job.salaryText && (
                        <span className="font-medium text-slate-800">
                          {job.salaryText}
                        </span>
                      )}
                    </p>
                  </div>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    View original posting
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <details className="rounded-2xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer font-semibold text-slate-950">
              About This Data
            </summary>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>{data.methodology.statement}</p>
              <p>
                {data.methodology.salaryMethod}{" "}
                {data.methodology.sponsorshipMethod}
              </p>
              <p>
                Unavailable fields in this view:{" "}
                {snapshot.dataQuality.salaryMissing} salary,{" "}
                {snapshot.dataQuality.contractTypeMissing} contract type,{" "}
                {snapshot.dataQuality.workStyleUnknown} work style and{" "}
                {snapshot.dataQuality.locationMissing} location.
              </p>
              <div className="flex flex-wrap gap-2">
                {snapshot.providerCoverage.map((item) => (
                  <span
                    key={item.provider}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600"
                  >
                    {providerName(item.provider)} ·{" "}
                    {item.status.toLowerCase().replaceAll("_", " ")} ·{" "}
                    {item.sampled}
                  </span>
                ))}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
