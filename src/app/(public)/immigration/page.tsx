"use client";

import { Suspense, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/shared/components/layout/Navbar";
import VisaRouteDetails from "@/features/immigration/components/VisaRouteDetails";
import { useSponsors } from "@/features/immigration/hooks/useSponsors";
import { VISAS, INDUSTRY_SECTORS } from "@/shared/constants/immigration-config";
import { EXTERNAL_LINKS } from "@/shared/constants/navigation";
import ResourcePageBackdrop from "@/shared/components/ui/ResourcePageBackdrop";
import { OrbitMotif } from "@/shared/components/ui/ResourceBackdropMotifs";
import { DonutDistributionChart } from "@/shared/components/charts/PublicDataCharts";

function Bars({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number; share: number }>;
}) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0 text-slate-600">{item.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-950">
                {item.count.toLocaleString()}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SponsorshipVisasContent() {
  const [activeVisaTab, setActiveVisaTab] = useState(VISAS[0].title);
  const {
    query,
    setQuery,
    route,
    setRoute,
    industry,
    setIndustry,
    sponsors,
    total,
    isLoading,
    page,
    error,
    register,
    summary,
    handlePageChange,
  } = useSponsors();
  const activeVisa =
    VISAS.find((visa) => visa.title === activeVisaTab) ?? VISAS[0];
  const refreshed = register?.publishedAt
    ? new Date(`${register.publishedAt}T00:00:00Z`).toLocaleDateString(
        "en-GB",
        { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
      )
    : register?.source === "LIVE_FALLBACK"
      ? "Current GOV.UK fallback"
      : "Loading";

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100">
      <Navbar />
      <ResourcePageBackdrop variant="visas" />
      <section className="relative mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <header className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(190px,.55fr)_minmax(190px,.55fr)]">
          <div
            data-testid="visas-overview-card"
            className="rounded-2xl border border-violet-200/80 p-6 shadow-[0_18px_48px_rgba(76,65,155,0.07)] [background:radial-gradient(circle_at_92%_4%,rgba(221,214,254,0.74),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] sm:p-8"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              Sponsorship & Visas
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Search indexed GOV.UK sponsor-register data, understand employer
              context, and review maintained guidance for common visa routes.
            </p>
            <div className="mt-6 flex flex-wrap gap-5 border-t border-slate-100 pt-5 text-xs text-slate-500">
              <span>
                <strong className="text-slate-800">Official source</strong>
                <br />
                GOV.UK licensed sponsors
              </span>
              <span>
                <strong className="text-slate-800">Register date</strong>
                <br />
                {refreshed}
              </span>
            </div>
          </div>
          <div
            data-testid="visas-indexed-card"
            className="rounded-2xl border border-cyan-200/80 p-5 shadow-[0_18px_48px_rgba(14,116,144,0.06)] [background:radial-gradient(circle_at_100%_0%,rgba(165,243,252,0.42),transparent_48%),linear-gradient(145deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92))]"
          >
            <p className="text-xs font-semibold text-slate-500">
              Indexed sponsors
            </p>
            <p className="mt-5 text-3xl font-semibold tabular-nums text-slate-950">
              {(
                summary?.totalEntries ??
                register?.rowCount ??
                0
              ).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              entries in the full indexed register
            </p>
          </div>
          <div
            data-testid="visas-breadth-card"
            className="rounded-2xl border border-indigo-200/80 p-5 shadow-[0_18px_48px_rgba(79,70,229,0.06)] [background:radial-gradient(circle_at_100%_0%,rgba(199,210,254,0.52),transparent_46%),linear-gradient(145deg,rgba(255,255,255,0.98),rgba(245,243,255,0.92))]"
          >
            <p className="text-xs font-semibold text-slate-500">
              Register breadth
            </p>
            <p className="mt-5 text-3xl font-semibold tabular-nums text-slate-950">
              {summary?.locationCount.toLocaleString() ?? "Not available"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              indexed towns and cities across {summary?.routeCount ?? "Not available"} route
              categories
            </p>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    Register of Licensed Sponsors
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {register
                      ? `Version ${register.releaseVersion} · ${register.rowCount.toLocaleString()} indexed entries · ${refreshed}`
                      : "Loading register metadata…"}
                  </p>
                </div>
                <a
                  href={EXTERNAL_LINKS.govSponsorList}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-violet-700"
                >
                  Official source <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-5 rounded-xl border border-cyan-200/80 p-4 text-sm leading-6 text-cyan-950 [background:radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.82),transparent_38%),linear-gradient(105deg,#e0f2fe_0%,#f8fafc_56%,#eff6ff_100%)]">
                <div className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    An organisation appearing on the register does not confirm
                    that a specific vacancy offers sponsorship, that a
                    Certificate of Sponsorship is available, or that a candidate
                    is eligible.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_200px]">
                <label className="relative">
                  <span className="sr-only">Search company, town or city</span>
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search company, town or city"
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                </label>
                <label>
                  <span className="sr-only">Industry</span>
                  <select
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="all">All industries</option>
                    {INDUSTRY_SECTORS.filter(
                      (item) => item.value !== "all",
                    ).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Visa route</span>
                  <select
                    value={route}
                    onChange={(event) => setRoute(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="all">All routes</option>
                    <option value="skilled worker">Skilled Worker</option>
                    <option value="global business mobility">
                      Global Business Mobility
                    </option>
                  </select>
                </label>
              </div>
              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
                >
                  {error}
                </div>
              )}
            </div>
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-[36%] px-5 py-3 font-semibold">
                      Organisation
                    </th>
                    <th className="w-[19%] px-4 py-3 font-semibold">
                      Town / City
                    </th>
                    <th className="w-[25%] px-4 py-3 font-semibold">Sector</th>
                    <th className="w-[20%] px-4 py-3 font-semibold">Route</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading && sponsors.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-10 text-center text-sm text-slate-500"
                      >
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-violet-600" />
                        Loading sponsors…
                      </td>
                    </tr>
                  ) : sponsors.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-10 text-center text-slate-500"
                      >
                        No sponsors match these filters.
                      </td>
                    </tr>
                  ) : (
                    sponsors.map((sponsor, index) => (
                      <tr
                        key={`${sponsor.organisationName}-${index}`}
                        className="align-top hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <div className="flex gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <Building2 className="h-4 w-4" />
                            </span>
                            <span className="max-w-[300px] font-semibold leading-5 text-slate-900">
                              {sponsor.organisationName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {sponsor.townCity || "Not stated"}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex max-w-[200px] rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs leading-4 text-slate-600">
                            {sponsor.industry}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs leading-5 text-slate-600">
                          {sponsor.route}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!isLoading && sponsors.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, total)} of{" "}
                  {total.toLocaleString()} matching entries
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => handlePageChange(page - 1)}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page * 10 >= total}
                    onClick={() => handlePageChange(page + 1)}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
          <aside className="space-y-4">
            <Bars
              title="Top Indexed Sectors"
              items={summary?.topSectors ?? []}
            />
            <Bars
              title="Top Sponsor Locations"
              items={summary?.topLocations ?? []}
            />
            <DonutDistributionChart
              title="Route Distribution"
              description="Share of the complete indexed sponsor register"
              items={summary?.routeDistribution ?? []}
              noun="sponsors"
              context="of indexed sponsors"
              showLegend={false}
            />
          </aside>
        </div>

        <section className="relative grid overflow-hidden rounded-2xl border border-cyan-200/80 p-6 shadow-[0_18px_50px_rgba(14,165,233,0.10)] [background:radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.88),transparent_36%),linear-gradient(105deg,#e0f2fe_0%,#f8fafc_56%,#eff6ff_100%)] sm:p-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,.6fr)] lg:items-center lg:gap-8">
          <OrbitMotif
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 h-64 w-64 text-cyan-300/35 motion-reduce:animate-none"
          />
          <div className="relative">
            <p className="inline-flex rounded-full border border-cyan-300/80 bg-white/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-800 shadow-[0_6px_18px_rgba(14,116,144,0.10)]">
              One Career Route · Spotlight
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-3xl">
              Knowledge Transfer Partnerships (KTPs)
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
              KTP Associate roles connect a business with a university or other
              knowledge base for a defined innovation project. Roles span
              technical, operational and management disciplines. Visa
              arrangements vary by role and partner, and sponsor-register status
              does not confirm sponsorship for a specific vacancy.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={EXTERNAL_LINKS.ktpJobs}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(103,87,217,0.20)] hover:bg-violet-700"
              >
                View official KTP jobs <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={`${EXTERNAL_LINKS.jobsAcUk}KTP+Associate`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:border-cyan-400"
              >
                Search jobs.ac.uk <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div className="relative rounded-2xl bg-white/95 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
            <h3 className="text-sm font-semibold text-slate-950">
              Useful Context
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-700" />
                Projects are jointly delivered by a business and a
                knowledge-base partner.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-700" />
                Opportunities span multiple industries and professional
                disciplines.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-700" />
                Check each vacancy and employer independently for sponsorship
                wording.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">
                Visa Routes and Planning
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Compare maintained route guidance and continue to the official
                source.
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Visa routes"
              className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1"
            >
              {VISAS.map((visa) => (
                <button
                  key={visa.title}
                  type="button"
                  role="tab"
                  aria-selected={activeVisaTab === visa.title}
                  onClick={() => setActiveVisaTab(visa.title)}
                  className={`min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${activeVisaTab === visa.title ? "bg-white text-violet-700 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
                >
                  {visa.title.replace(" Visa", "")}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <VisaRouteDetails visa={activeVisa} />
          </div>
        </section>
      </section>
    </main>
  );
}

export default function SponsorshipVisasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
          Loading Sponsorship & Visas…
        </div>
      }
    >
      <SponsorshipVisasContent />
    </Suspense>
  );
}
