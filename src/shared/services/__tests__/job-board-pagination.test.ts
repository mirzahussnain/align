import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  companyFindMany: vi.fn(),
  companyFindUnique: vi.fn(),
  jobFindMany: vi.fn(),
  jobGroupBy: vi.fn(),
  savedFindMany: vi.fn(),
}));

vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    companyRecord: {
      findMany: mocks.companyFindMany,
      findUnique: mocks.companyFindUnique,
    },
    jobSnapshot: {
      findMany: mocks.jobFindMany,
      groupBy: mocks.jobGroupBy,
    },
    savedJob: { findMany: mocks.savedFindMany },
  },
}));

const { listCompanies, listCompanyVacancies, listSavedJobs } = await import(
  "@/shared/services/job-board-api"
);

const source = (id: string) => ({
  id,
  provider: "GREENHOUSE",
  verificationStatus: "VERIFIED",
  enabled: true,
  lastVerifiedAt: new Date("2026-07-28T10:00:00.000Z"),
  lastSuccessfulSyncAt: new Date("2026-07-28T10:00:00.000Z"),
  lastVerifiedJobCount: 50,
  lastErrorAt: null,
});

const snapshot = (id: string) => ({
  id,
  title: `Role ${id}`,
  employerName: "Example Ltd",
  companyRecordId: "company-1",
  locationText: "Birmingham",
  status: "ACTIVE",
  postedAt: new Date("2026-07-28T10:00:00.000Z"),
  lastSeenAt: new Date(),
  employerSource: {
    provider: "GREENHOUSE",
    enabled: true,
    verificationStatus: "VERIFIED",
  },
  companyRecord: {
    displayName: "Example Ltd",
    sponsorMatchStatus: "NOT_CHECKED",
  },
  providerReferences: [],
  savedJobs: [],
});

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

describe("bounded Job Board pagination", () => {
  it("sorts thousands of company summaries without loading durable snapshot rows", async () => {
    const companies = Array.from({ length: 3_000 }, (_, index) => ({
      id: `company-${index.toString().padStart(4, "0")}`,
      displayName: `Company ${index.toString().padStart(4, "0")}`,
      websiteUrl: null,
      careersUrl: null,
      industry: "Technology",
      // A UK country record, so every fixture company is in scope and the test
      // stays about pagination rather than about the UK gate.
      country: "GB",
      sponsorMatchStatus: "NOT_CHECKED",
      jobSources: [source(`source-${index}`)],
      _count: { jobSnapshots: index % 41 },
    }));
    mocks.companyFindMany.mockResolvedValue(companies);
    // UK vacancy counts come from a separate grouped query: Prisma's `_count`
    // cannot express the same relation twice under two different predicates.
    mocks.jobGroupBy.mockResolvedValue(
      companies.map((company, index) => ({
        companyRecordId: company.id,
        _count: { _all: index % 41 },
      })),
    );

    const started = performance.now();
    const result = await listCompanies({
      sort: "ACTIVE_JOBS",
      limit: 20,
    });
    const durationMs = performance.now() - started;

    expect(result.items).toHaveLength(20);
    expect(result.page.hasMore).toBe(true);
    expect(result.items[0].activeJobCount).toBe(40);
    expect(durationMs).toBeLessThan(2_000);
    const query = mocks.companyFindMany.mock.calls[0][0];
    expect(query.select).not.toHaveProperty("jobSnapshots");
    expect(query.select._count.select.jobSnapshots).toHaveProperty("where");
    // The UK vacancy count is one aggregate for the whole page, not a query per
    // company.
    expect(mocks.jobGroupBy).toHaveBeenCalledTimes(1);
  });

  it("asks the database for only one Saved page plus a has-more sentinel", async () => {
    mocks.savedFindMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `saved-${index}`,
        savedAt: new Date(2026, 6, 28, 12, 0, 0, -index),
        jobSnapshot: snapshot(`snapshot-${index}`),
      })),
    );

    const result = await listSavedJobs("user-1", { limit: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.page.hasMore).toBe(true);
    expect(mocks.savedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 }),
    );
  });

  it("loads a bounded company-vacancy page rather than Company details", async () => {
    mocks.companyFindUnique.mockResolvedValue({ id: "company-1" });
    mocks.jobFindMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => snapshot(`snapshot-${index}`)),
    );

    const result = await listCompanyVacancies("company-1", "user-1", {
      limit: 20,
    });

    expect(result?.items).toHaveLength(20);
    expect(result?.page.hasMore).toBe(true);
    expect(mocks.jobFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        where: expect.objectContaining({ companyRecordId: "company-1" }),
      }),
    );
    expect(mocks.jobGroupBy).not.toHaveBeenCalled();
  });
});
