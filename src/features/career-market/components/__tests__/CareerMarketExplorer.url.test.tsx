// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const response = (roleQuery: string) => ({
  freshness: "FRESH",
  snapshot: {
    id: `market-${roleQuery}`,
    marketKey: roleQuery,
    roleQuery,
    locationQuery: "UK",
    normalizedRole: roleQuery.toLowerCase(),
    normalizedLocation: "uk",
    providerCoverage: [],
    sampleSize: 0,
    samplingStartedAt: "2026-09-26T00:00:00.000Z",
    samplingCompletedAt: "2026-09-26T00:00:01.000Z",
    generatedAt: "2026-09-26T00:00:01.000Z",
    expiresAt: "2026-09-27T00:00:01.000Z",
    calculationVersion: "market-sample-v1",
    dataQuality: { salaryMissing: 0, contractTypeMissing: 0, workStyleUnknown: 0, locationMissing: 0, note: "" },
    metrics: {
      sampledVacancyCount: 0,
      salary: { disclosedCount: 0, eligibleAnnualCount: 0, disclosureRate: 0 },
      employmentTypeMix: [],
      workingHoursMix: [],
      workStyleMix: [],
      regions: [],
      topEmployers: [],
      sponsorshipEmployerContext: [],
      currentVacancies: [],
    },
  },
  methodology: { statement: "", salaryMethod: "", sponsorshipMethod: "" },
});

beforeEach(() => {
  navigation.search = "";
  navigation.push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Career Market URL persistence", () => {
  it("commits a search to the URL without fetching directly", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CareerMarketExplorer />);

    await user.type(screen.getByLabelText(/role or occupation/i), "Analyst");
    await user.clear(screen.getByLabelText(/^location/i));
    await user.type(screen.getByLabelText(/^location/i), "Leeds");
    await user.click(screen.getByRole("button", { name: /explore market/i }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/trends?role=Analyst&location=Leeds",
      { scroll: false },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores controls and automatically fetches once from the initial URL", async () => {
    navigation.search = "role=Data+Analyst&location=Manchester";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(response("Data Analyst")), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CareerMarketExplorer />);

    expect(screen.getByLabelText(/role or occupation/i)).toHaveValue("Data Analyst");
    expect(screen.getByLabelText(/^location/i)).toHaveValue("Manchester");
    await screen.findByText("Data Analyst · UK");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty URL idle", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CareerMarketExplorer />);

    await Promise.resolve();
    expect(screen.getByLabelText(/role or occupation/i)).toHaveValue("");
    expect(screen.getByLabelText(/^location/i)).toHaveValue("UK");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores browser navigation and prevents an older response from overwriting it", async () => {
    navigation.search = "role=Old+Role&location=London";
    let resolveOld: ((value: Response) => void) | undefined;
    const old = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).includes("Old+Role")
        ? old
        : Promise.resolve(new Response(JSON.stringify(response("New Role")), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<CareerMarketExplorer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    navigation.search = "role=New+Role&location=Leeds";
    view.rerender(<CareerMarketExplorer />);

    await screen.findByText("New Role · UK");
    expect(screen.getByLabelText(/role or occupation/i)).toHaveValue("New Role");
    resolveOld?.(new Response(JSON.stringify(response("Old Role")), { status: 200 }));
    await Promise.resolve();
    expect(screen.queryByText("Old Role · UK")).not.toBeInTheDocument();
  });
});
