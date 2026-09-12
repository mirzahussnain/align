// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompaniesBoard,
  CompanyDetailsBoard,
  DiscoverBoard,
  JobDetailsBoard,
  SavedBoard,
} from "@/features/job-board/components/JobBoard";
import type { JobCardViewModel } from "@/features/job-board/lib/job-board";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard/jobs",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace,
    back: navigation.back,
  }),
}));

vi.mock("@/features/dashboard/components/DashboardTopBar", () => ({
  default: () => <div data-testid="dashboard-top-bar" />,
}));

const card = (id: string, title = "IT Analyst"): JobCardViewModel => ({
  id,
  title,
  company: { id: "company-1", displayName: "Example Ltd" },
  location: "Birmingham",
  freshness: "FRESH",
  sourceSummary: {
    preferredProvider: "GREENHOUSE",
    providerCount: 1,
    employerDirect: true,
  },
  saved: false,
});

const details = (id: string) => ({
  job: card(id),
  description: {
    text: "A durable description.",
    source: "PROVIDER",
    completeness: "FULL",
  },
  sponsorEvidence: {
    summary: { status: "NOT_CHECKED" },
    disclaimer: "Register evidence is not vacancy evidence.",
  },
  sourceProvenance: [{ provider: "GREENHOUSE" }],
  availability: "CURRENT",
  availableCareerTracks: [],
});

const response = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

beforeEach(() => {
  cleanup();
  navigation.pathname = "/dashboard/jobs";
  navigation.search = "";
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.back.mockReset();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

describe("authenticated Job Board API wiring", () => {
  it("loads Saved from the dedicated Saved Jobs API", async () => {
    navigation.pathname = "/dashboard/jobs/saved";
    const fetchMock = vi.fn(() =>
      response({ items: [], page: { hasMore: false } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SavedBoard />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/jobs/saved?limit=20",
        undefined,
      ),
    );
  });

  it("loads Companies from the Companies API", async () => {
    navigation.pathname = "/dashboard/jobs/companies";
    const fetchMock = vi.fn(() =>
      response({ items: [], page: { hasMore: false } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CompaniesBoard />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/companies?", {
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("uses jobSnapshotId for durable details and never calls a provider endpoint", async () => {
    navigation.pathname = "/dashboard/jobs/snapshot-42";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url === "/api/jobs/bootstrap")
          return response({
            profiles: [],
            defaultSearch: { query: "", location: "" },
          });
        if (url === "/api/jobs/snapshot-42")
          return response({
            ...details("snapshot-42"),
            applicationUrl: "https://jobs.example.test/apply/42",
          });
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    render(<JobDetailsBoard jobSnapshotId="snapshot-42" />);

    expect(
      await screen.findByText("A durable description."),
    ).toBeInTheDocument();
    expect(urls).toContain("/api/jobs/snapshot-42");
    expect(
      screen.getByRole("link", { name: /Apply for IT Analyst/ }),
    ).toHaveAttribute("href", "https://jobs.example.test/apply/42");
    expect(urls.join(" ")).not.toMatch(/greenhouse|lever|ashby|provider/i);
  });

  it("uses companyRecordId for company identity and stable company vacancies", async () => {
    navigation.pathname = "/dashboard/jobs/companies/company-42";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url === "/api/companies/company-42")
          return response({
            company: {
              id: "company-42",
              displayName: "Example Ltd",
              sponsorEvidenceSummary: { status: "NOT_CHECKED" },
              verifiedSourceCount: 1,
              activeJobCount: 0,
              providers: ["GREENHOUSE"],
            },
            sponsorEvidence: {
              summary: { status: "MATCHED" },
              disclaimer: "Evidence disclaimer.",
            },
            sponsorHistory: [
              {
                registerVersion: "v2-2026-07-29-0123456789abcdef",
                status: "MATCHED",
                organisationName: "EXAMPLE LTD",
                checkedAt: "2026-07-29T12:00:00.000Z",
                current: true,
              },
            ],
            sources: [{ provider: "GREENHOUSE", health: "EMPTY" }],
          });
        if (url === "/api/companies/company-42/jobs?limit=20")
          return response({ items: [], page: { hasMore: false } });
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    render(<CompanyDetailsBoard companyRecordId="company-42" />);

    expect(await screen.findByText("Example Ltd")).toBeInTheDocument();
    expect(screen.getByText(/Sponsorship history/i)).toBeInTheDocument();
    expect(screen.getByText("Version 2 · 29 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("Matched as EXAMPLE LTD")).toBeInTheDocument();
    expect(urls).toEqual(
      expect.arrayContaining([
        "/api/companies/company-42",
        "/api/companies/company-42/jobs?limit=20",
      ]),
    );
  });

  it("prevents a slower previous Discover response from overwriting a newer query", async () => {
    navigation.search = "q=old";
    let resolveOld: ((value: Response) => void) | undefined;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/jobs/bootstrap")
        return response({
          profiles: [],
          defaultSearch: { query: "", location: "" },
        });
      if (url.includes("query=old")) return oldResponse;
      if (url.includes("query=new"))
        return response({
          jobs: [card("new-id", "New result")],
          sessionId: "new-session",
          meta: {},
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<DiscoverBoard />);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("query=old")),
      ).toBe(true),
    );

    navigation.search = "q=new";
    view.rerender(<DiscoverBoard />);
    expect(await screen.findByText("New result")).toBeInTheDocument();

    resolveOld?.(
      new Response(
        JSON.stringify({
          jobs: [card("old-id", "Old result")],
          sessionId: "old-session",
          meta: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await Promise.resolve();
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(screen.getByText("New result")).toBeInTheDocument();
  });
  it("pages forward on the session cursor and trusts the server's hasMore", async () => {
    navigation.search = "q=analyst";
    const user = userEvent.setup();
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url === "/api/jobs/bootstrap")
          return response({
            profiles: [],
            defaultSearch: { query: "", location: "" },
          });
        if (url.includes("sessionId=session-1"))
          return response({
            jobs: [card("snapshot-2", "Second page result")],
            sessionId: "session-2",
            meta: { hasMore: false },
          });
        if (url.startsWith("/api/jobs?"))
          return response({
            jobs: [card("snapshot-1", "First page result")],
            sessionId: "session-1",
            // A single-job page: the old client inferred "no more" from the
            // page size and never offered Next at all.
            meta: { hasMore: true },
          });
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    render(<DiscoverBoard />);
    expect(await screen.findByText("First page result")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next/ }));

    expect(await screen.findByText("Second page result")).toBeInTheDocument();
    expect(screen.queryByText("First page result")).not.toBeInTheDocument();
    expect(urls.some((url) => url.includes("sessionId=session-1"))).toBe(true);
    // hasMore:false must retire Next rather than leave a control that repeats.
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
    // Page 1 stays reachable from the cache the client keeps.
    await user.click(screen.getByRole("button", { name: "Page 1" }));
    expect(screen.getByText("First page result")).toBeInTheDocument();
  });

  it("restarts the search when the server rejects an expired session", async () => {
    navigation.search = "q=analyst";
    const user = userEvent.setup();
    let continuations = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/jobs/bootstrap")
          return response({
            profiles: [],
            defaultSearch: { query: "", location: "" },
          });
        if (url.includes("sessionId=")) {
          continuations += 1;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: "Your search session has expired.",
                code: "SEARCH_SESSION_EXPIRED",
              }),
              {
                status: 409,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        return response({
          jobs: [card("snapshot-1", "First page result")],
          sessionId: "session-1",
          meta: { hasMore: true },
        });
      }),
    );

    render(<DiscoverBoard />);
    expect(await screen.findByText("First page result")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next/ }));

    expect(
      await screen.findByText(/search session expired/i),
    ).toBeInTheDocument();
    expect(continuations).toBe(1);
    // Recovered to a usable first page, not left on a dead error.
    expect(screen.getByText("First page result")).toBeInTheDocument();
  });

  it("keeps Discover on the results list instead of opening the first job", async () => {
    navigation.search = "q=analyst";
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url === "/api/jobs/bootstrap")
          return response({
            profiles: [],
            defaultSearch: { query: "", location: "" },
          });
        if (url.startsWith("/api/jobs?"))
          return response({
            jobs: [card("snapshot-1", "First result")],
            sessionId: "session-1",
            meta: {},
          });
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(<DiscoverBoard />);

    expect(await screen.findByText("First result")).toBeInTheDocument();
    expect(
      replaceState.mock.calls.filter(([, , url]) =>
        String(url).startsWith("/dashboard/jobs/"),
      ),
    ).toHaveLength(0);
    expect(urls).not.toContain("/api/jobs/snapshot-1");
    expect(
      screen.getByText(/Select a vacancy to review its details/),
    ).toBeInTheDocument();
    replaceState.mockRestore();
  });

  it("rolls a Saved-row unsave back when the shared mutation fails", async () => {
    navigation.pathname = "/dashboard/jobs/saved";
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/jobs/saved?limit=20")
        return response({
          items: [
            {
              id: "saved-1",
              savedAt: "2026-07-28T12:00:00.000Z",
              availability: "CURRENT",
              job: { ...card("snapshot-1"), saved: true },
            },
          ],
          page: { hasMore: false },
        });
      if (url === "/api/jobs/snapshot-1/save")
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "INTERNAL_ERROR",
                message: "Unable to unsave.",
                retryable: false,
              },
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SavedBoard />);
    await user.click(
      await screen.findByRole("button", { name: "Unsave IT Analyst" }),
    );

    expect(
      await screen.findByRole("button", { name: "Unsave IT Analyst" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to unsave.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs/snapshot-1/save",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("traps keyboard focus in Filters and restores it on Escape", async () => {
    navigation.pathname = "/dashboard/jobs";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/jobs/bootstrap")
          return response({
            profiles: [],
            defaultSearch: { query: "", location: "" },
          });
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );
    const user = userEvent.setup();
    render(<DiscoverBoard />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "More filters" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Close filters" }),
      ).toHaveFocus(),
    );
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "More filters" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
