// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import CareerMarketExplorer from "../CareerMarketExplorer";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trends",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("role=Analyst&location=Leeds"),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("reloads the persisted Career Market query after a hard remount", async () => {
  const body = {
    freshness: "FRESH",
    snapshot: {
      id: "market-1", marketKey: "key", roleQuery: "Analyst", locationQuery: "Leeds", normalizedRole: "analyst", normalizedLocation: "leeds",
      providerCoverage: [], sampleSize: 0, samplingStartedAt: "2026-09-26T00:00:00.000Z", samplingCompletedAt: "2026-09-26T00:00:01.000Z", generatedAt: "2026-09-26T00:00:01.000Z", expiresAt: "2026-09-27T00:00:01.000Z", calculationVersion: "market-sample-v1",
      dataQuality: { salaryMissing: 0, contractTypeMissing: 0, workStyleUnknown: 0, locationMissing: 0, note: "" },
      metrics: { sampledVacancyCount: 0, salary: { disclosedCount: 0, eligibleAnnualCount: 0, disclosureRate: 0 }, employmentTypeMix: [], workingHoursMix: [], workStyleMix: [], regions: [], topEmployers: [], sponsorshipEmployerContext: [], currentVacancies: [] },
    },
    methodology: { statement: "", salaryMethod: "", sponsorshipMethod: "" },
  };
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const first = render(<CareerMarketExplorer />);
  await screen.findByText("Analyst · Leeds");
  first.unmount();
  render(<CareerMarketExplorer />);
  await screen.findByText("Analyst · Leeds");

  expect(fetchMock).toHaveBeenCalledTimes(2);
});
