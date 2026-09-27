import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalisedJob } from "@/shared/types/job";
import { blankSponsorSignal } from "@/shared/services/job-normalisation";

const findMany = vi.fn(async () => [] as Array<{ jobSnapshotId: string }>);
const findExistingJobSnapshots = vi.fn(
  async (jobs: readonly NormalisedJob[]) =>
    new Map(
      jobs.map((job) => [
        job.canonicalJobId,
        { id: `snapshot-${job.sourceJobId}`, canonicalJobId: job.dedupeFingerprint },
      ]),
    ),
);

vi.mock("@/shared/lib/prisma", () => ({
  prisma: { savedJob: { findMany } },
}));
vi.mock("@/shared/services/job-snapshot", () => ({
  findExistingJobSnapshots,
}));

const { projectSearchJobCards } = await import(
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
        identityStability: 'STABLE',
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
  findExistingJobSnapshots.mockClear();
});

describe("search result projection", () => {
  it("projects anonymous cards with canonical identity", async () => {
    findExistingJobSnapshots.mockResolvedValueOnce(new Map());
    const [card] = await projectSearchJobCards(
      [vacancy("public", "NHS Trust")],
      null,
    );
    expect(card.id).toBe("canonical-public");
    expect(card.canonicalJobId).toBe("canonical-public");
    expect(card).not.toHaveProperty("jobSnapshotId");
    expect(card.fullDescriptionExternalUrl).toBe("https://example.test/public");
    expect(card.saved).toBe(false);
    expect(card).not.toHaveProperty("careerTrackRelevance");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("keeps equal-title card identity canonical while exposing durable metadata", async () => {
    const cards = await projectSearchJobCards(
      [vacancy("one", "Alpha Ltd"), vacancy("two", "Beta Ltd")],
      "user-1",
    );

    expect(cards.map((card) => card.id)).toEqual([
      "canonical-one",
      "canonical-two",
    ]);
    expect(cards.map((card) => card.jobSnapshotId)).toEqual([
      "snapshot-one",
      "snapshot-two",
    ]);
    expect(new Set(cards.map((card) => card.id)).size).toBe(2);
    expect(findExistingJobSnapshots).toHaveBeenCalledTimes(1);
  });

  it("returns API-provided relevance only when a Career Track is supplied", async () => {
    const [withTrack] = await projectSearchJobCards(
      [vacancy("one", "Alpha Ltd")],
      "user-1",
      {
        targetRoleTitle: "IT Analyst",
        preferredLocation: "Birmingham",
        workStyle: "HYBRID",
      },
    );
    const [withoutTrack] = await projectSearchJobCards(
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
    const [partial] = await projectSearchJobCards(
      [vacancy("one", "Alpha Ltd", "PARTIAL")],
      "user-1",
    );
    const [external] = await projectSearchJobCards(
      [vacancy("two", "Beta Ltd", "EXTERNAL_ONLY")],
      "user-1",
    );
    const [full] = await projectSearchJobCards(
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
    const cards = await projectSearchJobCards(
      [vacancy("one", "Alpha Ltd"), vacancy("two", "Beta Ltd")],
      "user-1",
    );
    expect(cards.map((card) => card.saved)).toEqual([false, true]);
  });
});
