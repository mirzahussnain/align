import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalisedJob } from "@/shared/types/job";
import { blankSponsorSignal } from "@/shared/services/job-normalisation";

const findMany = vi.fn(async () => [] as Array<{ jobSnapshotId: string }>);
// The search path now materialises a whole page in one batched call instead of
// one round trip per card, so this is the boundary the view is mocked at.
const materialiseTrustedProviderSnapshotIds = vi.fn(
  async (jobs: readonly NormalisedJob[]) =>
    new Map(jobs.map((job) => [job.canonicalJobId, `snapshot-${job.sourceJobId}`])),
);

vi.mock("@/shared/lib/prisma", () => ({
  prisma: { savedJob: { findMany } },
}));
vi.mock("@/shared/services/job-snapshot", () => ({
  materialiseTrustedProviderSnapshotIds,
}));

const { materialiseSearchJobCards, projectPublicSearchJobCards } = await import(
  "@/shared/services/job-search-view"
);

function vacancy(
  sourceJobId: string,
  company: string,
  descriptionAvailability: NormalisedJob["descriptionAvailability"] = "FULL",
): NormalisedJob {
  return {
    source: "REED",
    sourceJobId,
    providerReferences: [
      {
        provider: "REED",
        sourceJobId,
        sourceUrl: `https://example.test/${sourceJobId}`,
      },
    ],
    canonicalUrl: `https://example.test/${sourceJobId}`,
    title: "IT Analyst",
    company,
    locationText: "Birmingham",
    descriptionAvailability,
    remoteType: "HYBRID",
    sponsorSignal: blankSponsorSignal(),
    eligibilityHints: [],
    dedupeFingerprint: `fingerprint-${sourceJobId}`,
    canonicalJobId: `canonical-${sourceJobId}`,
    fetchedAt: "2026-07-28T12:00:00.000Z",
  };
}

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
  materialiseTrustedProviderSnapshotIds.mockClear();
});

describe("search result materialisation", () => {
  it("projects anonymous cards without creating durable snapshots", () => {
    const [card] = projectPublicSearchJobCards([vacancy("public", "NHS Trust")]);
    expect(card.id).toBe("canonical-public");
    expect(card.fullDescriptionExternalUrl).toBe("https://example.test/public");
    expect(card.saved).toBe(false);
    expect(card).not.toHaveProperty("careerTrackRelevance");
    expect(materialiseTrustedProviderSnapshotIds).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("gives equal-title jobs distinct durable snapshot ids", async () => {
    const cards = await materialiseSearchJobCards(
      [vacancy("one", "Alpha Ltd"), vacancy("two", "Beta Ltd")],
      "user-1",
    );

    expect(cards.map((card) => card.id)).toEqual([
      "snapshot-one",
      "snapshot-two",
    ]);
    expect(new Set(cards.map((card) => card.id)).size).toBe(2);
    // ONE batched call for the page, not one per card. A fifteen-result page
    // previously cost sixty-plus queries on the critical path of every search.
    expect(materialiseTrustedProviderSnapshotIds).toHaveBeenCalledTimes(1);
  });

  it("returns API-provided relevance only when a Career Track is supplied", async () => {
    const [withTrack] = await materialiseSearchJobCards(
      [vacancy("one", "Alpha Ltd")],
      "user-1",
      {
        targetRoleTitle: "IT Analyst",
        preferredLocation: "Birmingham",
        workStyle: "HYBRID",
      },
    );
    const [withoutTrack] = await materialiseSearchJobCards(
      [vacancy("two", "Beta Ltd")],
      "user-1",
    );

    expect(withTrack.careerTrackRelevance).toBe("HIGH");
    expect(withoutTrack).not.toHaveProperty("careerTrackRelevance");
  });

  it("carries a server-computed description state on every card", async () => {
    // The badge must never be derived in React from `freshness` (snapshot age)
    // or from text length. The pipeline's own verdict is carried through
    // verbatim, whatever it is.
    const [partial] = await materialiseSearchJobCards(
      [vacancy("one", "Alpha Ltd", "PARTIAL")],
      "user-1",
    );
    const [external] = await materialiseSearchJobCards(
      [vacancy("two", "Beta Ltd", "EXTERNAL_ONLY")],
      "user-1",
    );
    const [full] = await materialiseSearchJobCards(
      [vacancy("three", "Gamma Ltd", "FULL")],
      "user-1",
    );

    expect(partial.descriptionAvailability).toBe("PARTIAL");
    expect(external.descriptionAvailability).toBe("EXTERNAL_ONLY");
    expect(full.descriptionAvailability).toBe("FULL");
    // A vacancy with no description text has nothing readable to open.
    expect(external.hasReadableDescription).toBe(false);
    expect(partial.fullDescriptionExternalUrl).toBe("https://example.test/one");
  });

  it("maps saved state by snapshot id rather than title", async () => {
    findMany.mockResolvedValue([{ jobSnapshotId: "snapshot-two" }]);
    const cards = await materialiseSearchJobCards(
      [vacancy("one", "Alpha Ltd"), vacancy("two", "Beta Ltd")],
      "user-1",
    );
    expect(cards.map((card) => card.saved)).toEqual([false, true]);
  });
});
