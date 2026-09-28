import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  filtersToApi,
  filtersToUrl,
  hasDegradedProviders,
  parseDiscoverFilters,
} from "@/features/job-board/lib/job-board";

describe("Job Board URL and API query contracts", () => {
  it("sends the selected durable Career Track id to /api/jobs", () => {
    const params = filtersToApi({
      ...DEFAULT_FILTERS,
      query: "IT Analyst",
      location: "Birmingham",
      careerTrackId: "profile-it-support",
    });

    expect(`/api/jobs?${params}`).toContain("careerTrackId=profile-it-support");
    expect(params.get("query")).toBe("IT Analyst");
    expect(params.get("location")).toBe("Birmingham");
  });

  it("round-trips the direct-employer source into the search API", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      query: "Platform Engineer",
      source: "direct_employer" as const,
    };

    const url = filtersToUrl(filters);

    expect(url.get("source")).toBe("direct_employer");
    expect(parseDiscoverFilters(url)).toEqual(filters);
    expect(filtersToApi(filters).get("source")).toBe("direct_employer");
  });

  it("omits empty strings and round-trips supported URL state", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      query: "Platform Engineer",
      workplace: "HYBRID" as const,
      freshness: "7" as const,
    };
    const url = filtersToUrl(filters);
    const api = filtersToApi(filters);

    expect(url.has("location")).toBe(false);
    expect(api.has("location")).toBe(false);
    expect(parseDiscoverFilters(url)).toEqual(filters);
  });

  it("falls back safely for invalid URL enums and numeric filters", () => {
    const invalid = new URLSearchParams({
      q: "Analyst",
      workplace: "SOMEWHERE",
      employmentType: "forever",
      salaryMin: "-100",
      freshness: "999",
      sort: "random",
    });

    expect(parseDiscoverFilters(invalid)).toMatchObject({
      query: "Analyst",
      workplace: "all",
      employmentType: "all",
      salaryMin: "",
      freshness: "",
      sort: "relevance",
    });
  });
});

describe("provider availability messaging", () => {
  it.each([
    "TIMEOUT",
    "TIMED_OUT",
    "RATE_LIMITED",
    "UNAVAILABLE",
    "FAILED",
    "STALE_CACHE",
  ])("treats %s as degraded", (status) =>
    expect(
      hasDegradedProviders({ providerResults: [{ provider: "REED", status }] }),
    ).toBe(true),
  );

  it.each(["SUCCESS", "EMPTY", "NOT_CONFIGURED", "PENDING"])(
    "does not treat %s as degraded",
    (status) =>
      expect(
        hasDegradedProviders({
          providerResults: [{ provider: "REED", status }],
        }),
      ).toBe(false),
  );

  it("does not invent a warning when status metadata is missing", () => {
    expect(hasDegradedProviders({})).toBe(false);
  });
});
