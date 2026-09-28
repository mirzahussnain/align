// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PublicJobsSearch from "../PublicJobsSearch";

const navigation = vi.hoisted(() => ({
  pathname: "/jobs",
  search: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const job = (id: string, title: string, provider = "ADZUNA") => ({
  id,
  title,
  company: { displayName: "Example Ltd" },
  location: "Leeds",
  sourceSummary: { preferredProvider: provider, providerCount: 1, employerDirect: false },
});

const payload = (id: string, title: string, sessionId: string, hasMore = false) => ({
  jobs: [job(id, title)],
  sessionId,
  meta: { hasMore, partialResults: false, providerCounts: [] },
});

beforeEach(() => {
  navigation.search = "";
  navigation.push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public Jobs URL persistence", () => {
  it("commits Search and Apply Filters to the URL without fetching directly", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.type(screen.getByLabelText(/job title/i), "analyst");
    await user.selectOptions(screen.getByLabelText(/source/i), "nhs_jobs");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(navigation.push).toHaveBeenCalledWith(expect.stringContaining("/jobs?q=analyst"), { scroll: false });
    expect(navigation.push.mock.calls[0]?.[0]).toContain("source=nhs_jobs");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText(/experience level/i), "senior");
    await user.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(navigation.push.mock.calls[1]?.[0]).toContain("experience=senior");
  });

  it("restores all URL filters and automatically starts a fresh page-one session", async () => {
    navigation.search = "q=analyst&location=Leeds&source=nhs_jobs&salaryMin=50000&experience=senior&sponsorship=registered&contractType=permanent&remoteType=HYBRID&postedWithinDays=7&sortBy=salary_desc";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(payload("one", "Analyst", "fresh-session", true)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicJobsSearch />);

    expect(screen.getByLabelText(/job title/i)).toHaveValue("analyst");
    expect(screen.getByLabelText(/^location/i)).toHaveValue("Leeds");
    expect(screen.getByLabelText(/source/i)).toHaveValue("nhs_jobs");
    expect(screen.getByLabelText(/minimum salary/i)).toHaveValue("50000");
    expect(screen.getByLabelText(/experience level/i)).toHaveValue("senior");
    expect(screen.getByLabelText(/sponsorship context/i)).toHaveValue("registered");
    expect(screen.getByLabelText(/contract type/i)).toHaveValue("permanent");
    expect(screen.getByLabelText(/work style/i)).toHaveValue("HYBRID");
    expect(screen.getByLabelText(/^posted/i)).toHaveValue("7");
    expect(screen.getByLabelText(/sort results/i)).toHaveValue("salary_desc");
    await screen.findByRole("heading", { name: "Analyst" });
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).not.toContain("sessionId=");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses only the restored query's new session for Load More", async () => {
    navigation.search = "q=nurse&source=all";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return Promise.resolve(new Response(JSON.stringify(
        url.includes("sessionId=new-session")
          ? payload("two", "Second result", "continued-session")
          : payload("one", "First result", "new-session", true),
      ), { status: 200 }));
    }));
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await screen.findByRole("heading", { name: "First result" });
    await user.click(screen.getByRole("button", { name: /load more vacancies/i }));

    await screen.findByRole("heading", { name: "Second result" });
    expect(urls[0]).not.toContain("sessionId=");
    expect(urls[1]).toContain("sessionId=new-session");
  });

  it("keeps source=all despite provider provenance and restores explicit sources on navigation", async () => {
    navigation.search = "q=engineer&source=all";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload("one", "Engineer", "all-session")), { status: 200 })));
    const view = render(<PublicJobsSearch />);
    await screen.findByRole("heading", { name: "Engineer" });
    expect(screen.getByLabelText(/source/i)).toHaveValue("all");

    navigation.search = "q=nurse&source=reed";
    view.rerender(<PublicJobsSearch />);
    await waitFor(() => expect(screen.getByLabelText(/source/i)).toHaveValue("reed"));
  });

  it("prevents stale results and sessions from replacing the current URL query", async () => {
    navigation.search = "q=old&source=all";
    let resolveOld: ((value: Response) => void) | undefined;
    const old = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("query=old")) return old;
      if (url.includes("sessionId=new-session")) return Promise.resolve(new Response(JSON.stringify(payload("more", "New continuation", "continued-session")), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify(payload("new", "New result", "new-session", true)), { status: 200 }));
    }));
    const user = userEvent.setup();
    const view = render(<PublicJobsSearch />);
    await waitFor(() => expect(urls.some((url) => url.includes("query=old"))).toBe(true));

    navigation.search = "q=new&source=all";
    view.rerender(<PublicJobsSearch />);
    await screen.findByRole("heading", { name: "New result" });
    resolveOld?.(new Response(JSON.stringify(payload("old", "Old result", "old-session", true)), { status: 200 }));
    await Promise.resolve();

    expect(screen.queryByRole("heading", { name: "Old result" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /load more vacancies/i }));
    expect(urls.at(-1)).toContain("sessionId=new-session");
  });
});
