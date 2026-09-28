// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CareerMarketExplorer from "../CareerMarketExplorer";

const navigation = vi.hoisted(() => ({
  pathname: "/trends",
  search: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const snapshot = {
  id: "market-1", marketKey: "key", roleQuery: "Analyst", locationQuery: "UK", normalizedRole: "analyst", normalizedLocation: "uk",
  providerCoverage: [{ provider: "NHS_JOBS", status: "SUCCESS", sampled: 5 }, { provider: "REED", status: "SUCCESS", sampled: 3 }],
  sampleSize: 8, samplingStartedAt: "2026-09-26T00:00:00.000Z", samplingCompletedAt: "2026-09-26T00:00:01.000Z", generatedAt: "2026-09-26T00:00:01.000Z", expiresAt: "2026-09-27T00:00:01.000Z", calculationVersion: "market-sample-v1",
  dataQuality: { salaryMissing: 2, contractTypeMissing: 1, workStyleUnknown: 1, locationMissing: 0, note: "Current sample." },
  metrics: {
    sampledVacancyCount: 8,
    salary: { disclosedCount: 6, eligibleAnnualCount: 4, disclosureRate: 75, annualGbp: { minimum: 30000, median: 42000, maximum: 60000, range: { kind: "OBSERVED", minimum: 30000, maximum: 60000 } } },
    employmentTypeMix: [{ label: "Permanent", count: 6, share: 75 }, { label: "Not stated", count: 2, share: 25 }], workingHoursMix: [{ label: "Full-time", count: 5, share: 62.5 }, { label: "Not stated", count: 3, share: 37.5 }], workStyleMix: [{ label: "HYBRID", count: 5, share: 62.5 }],
    regions: [{ label: "London", count: 4, share: 50 }], topEmployers: [{ label: "Acme", count: 2, share: 25 }], sponsorshipEmployerContext: [],
    currentVacancies: [{ id: "job-1", title: "Data Analyst", employer: "Acme", location: "London", provider: "REED", url: "https://jobs.test/1", salaryText: "£40,000" }],
  },
};

const api = (value = snapshot) => new Response(JSON.stringify({ freshness: "GENERATED", snapshot: value, methodology: { statement: "Current sample, not the whole market.", salaryMethod: "Disclosed salaries only.", sponsorshipMethod: "Register context only." } }), { status: 200 });

beforeEach(() => {
  navigation.search = "";
  navigation.push.mockReset();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("UK Career Market explorer", () => {
  it("presents the market search in the same gradient chapter pattern as public jobs", () => {
    render(<CareerMarketExplorer />);
    const chapter = screen.getByTestId("career-market-search-chapter");
    expect(chapter.className).toContain("linear-gradient");
    expect(within(chapter).getByRole("heading", { level: 1 })).toHaveTextContent("UK Career Market");
    expect(within(chapter).getByRole("button", { name: /explore market/i })).toBeInTheDocument();
    expect(screen.getByTestId("career-market-results")).not.toContainElement(chapter);
  });

  it("presents user-facing controls and truthful snapshot metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => api()));
    navigation.search = "role=Analyst&location=UK";
    render(<CareerMarketExplorer />);

    expect(await screen.findByText("Current vacancies sampled")).toBeInTheDocument();
    expect(screen.getByText("Sources included")).toBeInTheDocument();
    expect(screen.getByText("Salary available")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /market overview/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /employment type/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /working hours/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /workplace arrangement/i })).toBeInTheDocument();
    const bentoRow = screen.getByTestId("geography-employers-row");
    expect(within(bentoRow).getByRole("heading", { name: /geographical distribution/i })).toBeInTheDocument();
    expect(within(bentoRow).getByRole("heading", { name: /leading employers/i })).toBeInTheDocument();
    expect(screen.getByText("Observed salary range")).toBeInTheDocument();
    expect(screen.queryByText("Current sample")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view original posting/i })).toHaveAttribute("href", "https://jobs.test/1");
  });

  it("labels an eligible percentile range as typical without changing the median", async () => {
    const quartileSnapshot = { ...snapshot, metrics: { ...snapshot.metrics, salary: { ...snapshot.metrics.salary, eligibleAnnualCount: 8, annualGbp: { minimum: 20000, median: 55000, maximum: 90000, range: { kind: "QUARTILE", minimum: 37500, maximum: 72500 } } } } };
    vi.stubGlobal("fetch", vi.fn(async () => api(quartileSnapshot)));
    navigation.search = "role=Engineer&location=UK";
    render(<CareerMarketExplorer />);

    expect(await screen.findByText("Typical advertised range")).toBeInTheDocument();
    expect(screen.getAllByText(/55,000/).length).toBeGreaterThan(0);
  });

  it("omits the work-style chart when the sample has no disclosed work style", async () => {
    const unknownWorkStyleSnapshot = { ...snapshot, dataQuality: { ...snapshot.dataQuality, workStyleUnknown: 8 }, metrics: { ...snapshot.metrics, workStyleMix: [{ label: "UNKNOWN", count: 8, share: 100 }] } };
    vi.stubGlobal("fetch", vi.fn(async () => api(unknownWorkStyleSnapshot)));
    navigation.search = "role=Analyst&location=UK";
    render(<CareerMarketExplorer />);

    await screen.findByRole("heading", { name: /market overview/i });
    expect(screen.queryByRole("heading", { name: /^work style$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^unknown$/i)).not.toBeInTheDocument();
  });
});
