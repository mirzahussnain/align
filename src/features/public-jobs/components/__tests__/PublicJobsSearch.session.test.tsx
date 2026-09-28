// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PublicJobsSearch from "../PublicJobsSearch";

const navigation = vi.hoisted(() => ({ search: "q=analyst&source=all" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const result = (sessionId: string, title: string, hasMore = false) => ({
  jobs: [{
    id: `${sessionId}-${title}`,
    title,
    company: { displayName: "Example Ltd" },
    sourceSummary: { preferredProvider: "REED", providerCount: 1, employerDirect: false },
  }],
  sessionId,
  meta: { hasMore, partialResults: false },
});

beforeEach(() => { navigation.search = "q=analyst&source=all"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("public Jobs Redis session lifecycle", () => {
  it("starts a new page-one session after a hard remount", async () => {
    let pageOne = 0;
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      pageOne += 1;
      return Promise.resolve(new Response(JSON.stringify(result(`session-${pageOne}`, `Result ${pageOne}`)), { status: 200 }));
    }));

    const first = render(<PublicJobsSearch />);
    await screen.findByRole("heading", { name: "Result 1" });
    first.unmount();
    render(<PublicJobsSearch />);
    await screen.findByRole("heading", { name: "Result 2" });

    expect(urls).toHaveLength(2);
    expect(urls.every((url) => !url.includes("sessionId="))).toBe(true);
  });

  it("recovers an expired continuation by restarting the same URL query on page one", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (urls.length === 1) return Promise.resolve(new Response(JSON.stringify(result("session-1", "First page", true)), { status: 200 }));
      if (urls.length === 2) return Promise.resolve(new Response(JSON.stringify({ code: "SEARCH_SESSION_EXPIRED" }), { status: 409 }));
      return Promise.resolve(new Response(JSON.stringify(result("session-2", "Restarted page")), { status: 200 }));
    }));
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await screen.findByRole("heading", { name: "First page" });
    await user.click(screen.getByRole("button", { name: /load more vacancies/i }));
    await screen.findByRole("heading", { name: "Restarted page" });

    expect(urls[1]).toContain("sessionId=session-1");
    expect(urls[2]).not.toContain("sessionId=");
  });
});
