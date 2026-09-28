import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUBLIC_JOB_FILTERS,
  parsePublicJobFilters,
  publicJobFiltersToUrl,
} from "../public-job-search";

describe("public Jobs URL state", () => {
  it("round-trips every reproducible filter using canonical API values", () => {
    const filters = {
      query: "Data Analyst",
      location: "Leeds",
      source: "nhs_jobs" as const,
      salaryMin: "50000" as const,
      experience: "senior" as const,
      sponsorship: "registered" as const,
      contractType: "permanent" as const,
      remoteType: "HYBRID" as const,
      postedWithinDays: "7" as const,
      sortBy: "salary_desc" as const,
    };

    const url = publicJobFiltersToUrl(filters);

    expect(Object.fromEntries(url)).toEqual({
      q: "Data Analyst",
      location: "Leeds",
      source: "nhs_jobs",
      salaryMin: "50000",
      experience: "senior",
      sponsorship: "registered",
      contractType: "permanent",
      remoteType: "HYBRID",
      postedWithinDays: "7",
      sortBy: "salary_desc",
    });
    expect(parsePublicJobFilters(url)).toEqual(filters);
  });

  it("falls back safely when URL filter values are malformed", () => {
    const filters = parsePublicJobFilters(
      new URLSearchParams({
        q: "Engineer",
        source: "provider-invented-by-user",
        salaryMin: "-1",
        experience: "principal",
        sponsorship: "guaranteed",
        contractType: "forever",
        remoteType: "SOMEWHERE",
        postedWithinDays: "365",
        sortBy: "random",
      }),
    );

    expect(filters).toEqual({
      ...DEFAULT_PUBLIC_JOB_FILTERS,
      query: "Engineer",
    });
  });

  it("preserves an explicit all-source selection", () => {
    expect(
      parsePublicJobFilters(new URLSearchParams("q=Nurse&source=all")).source,
    ).toBe("all");
  });
});
