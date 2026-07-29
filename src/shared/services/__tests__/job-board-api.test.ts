import { describe, expect, it } from "vitest";
import {
  isUsableSnapshot,
  jobCard,
  safeUrl,
  snapshotFreshness,
  sponsorSummary,
} from "@/shared/services/job-board-api";

const now = new Date("2026-07-28T12:00:00.000Z");
const snapshot = (
  lastSeenAt: Date,
  overrides: Record<string, unknown> = {},
) => ({
  id: "job-1",
  title: "Platform Engineer",
  employerName: "Example Ltd",
  companyRecordId: "company-1",
  locationText: "London",
  workStyle: "HYBRID",
  employmentType: "FULL_TIME",
  salaryMin: 60000,
  salaryMax: 75000,
  salaryCurrency: "GBP",
  salaryPeriod: "YEAR",
  status: "ACTIVE",
  lastSeenAt,
  employerSource: {
    provider: "GREENHOUSE",
    enabled: true,
    verificationStatus: "VERIFIED",
  },
  companyRecord: { displayName: "Example Ltd", sponsorMatchStatus: "EXACT" },
  providerReferences: [
    {
      provider: "GREENHOUSE",
      providerUrl: "https://jobs.example.test/1",
      applicationUrl: "https://jobs.example.test/apply/1",
    },
  ],
  ...overrides,
});

describe("Phase 10 job-board contract mapping", () => {
  it("uses the central 24-hour / 7-day ATS freshness policy", () => {
    expect(
      snapshotFreshness(
        snapshot(new Date(now.getTime() - 23 * 60 * 60_000)),
        now,
      ),
    ).toBe("FRESH");
    expect(
      snapshotFreshness(
        snapshot(new Date(now.getTime() - 25 * 60 * 60_000)),
        now,
      ),
    ).toBe("STALE");
    expect(
      isUsableSnapshot(
        snapshot(new Date(now.getTime() - 6 * 24 * 60 * 60_000)),
        now,
      ),
    ).toBe(true);
    expect(
      isUsableSnapshot(
        snapshot(new Date(now.getTime() - 8 * 24 * 60 * 60_000)),
        now,
      ),
    ).toBe(false);
  });

  it("does not count disabled or unverified ATS snapshots as active", () => {
    expect(
      isUsableSnapshot(
        snapshot(now, {
          employerSource: {
            provider: "GREENHOUSE",
            enabled: false,
            verificationStatus: "VERIFIED",
          },
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isUsableSnapshot(
        snapshot(now, {
          employerSource: {
            provider: "GREENHOUSE",
            enabled: true,
            verificationStatus: "PENDING",
          },
        }),
        now,
      ),
    ).toBe(false);
  });

  it("creates a lightweight provider-neutral card and omits unsafe URLs", () => {
    // `jobCard` reads freshness against the REAL clock, so the fixture's
    // `lastSeenAt` has to be relative to it. Pinning it to the fixed `now` made
    // this assertion pass only while that date stayed inside the 24-hour fresh
    // window, and start failing once it did not.
    const card = jobCard(snapshot(new Date()));
    expect(card).toMatchObject({
      id: "job-1",
      company: { id: "company-1", displayName: "Example Ltd" },
      freshness: "FRESH",
      saved: false,
      sourceSummary: { preferredProvider: "GREENHOUSE", employerDirect: true },
    });
    expect(card).not.toHaveProperty("description");
    expect(safeUrl("https://jobs.example.test/apply")).toBe(
      "https://jobs.example.test/apply",
    );
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("carries server-computed description state and never leaks the body", () => {
    // The card must be able to badge completeness WITHOUT shipping the advert,
    // and must never let a caller infer completeness from `freshness`, which is
    // snapshot age and is FRESH for essentially every discovered vacancy.
    const external = jobCard(snapshot(new Date()));
    expect(external.descriptionAvailability).toBe("EXTERNAL_ONLY");
    expect(external.hasReadableDescription).toBe(false);
    expect(external.fullDescriptionExternalUrl).toBe(
      "https://jobs.example.test/1",
    );
    expect(external).not.toHaveProperty("description");
    expect(external).not.toHaveProperty("providerDescription");

    const partial = jobCard(
      snapshot(new Date(), {
        providerDescription: "A shortened advert body from the search feed…",
        descriptionAvailability: "PARTIAL",
      }),
    );
    expect(partial.descriptionAvailability).toBe("PARTIAL");
    expect(partial.freshness).toBe("FRESH");
  });

  it("keeps sponsor-register evidence neutral", () => {
    expect(sponsorSummary("EXACT")).toEqual({ status: "MATCHED" });
    expect(sponsorSummary("AMBIGUOUS")).toEqual({ status: "AMBIGUOUS" });
    expect(sponsorSummary("NONE")).toEqual({ status: "NONE" });
  });
});
