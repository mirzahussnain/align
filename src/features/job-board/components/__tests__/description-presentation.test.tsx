// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobResultCard } from "@/features/job-board/components/JobResultCard";
import { JobDetailsPanel } from "@/features/job-board/components/JobDetailsPanel";
import type {
  DescriptionAvailability,
  JobCardViewModel,
  JobDetailsViewModel,
} from "@/features/job-board/lib/job-board";

/**
 * How description state reaches the user.
 *
 * THE DEFECT. The card badge read `job.freshness === "FRESH" ? "Full
 * Description" : "Partial Description"`. `freshness` is how recently the
 * snapshot was seen — it is FRESH for essentially every discovered vacancy and
 * has nothing to do with the advert body — so every card claimed a full
 * description. The Description tab, meanwhile, was gated on
 * `completeness === "FULL"`, so it vanished for every partial vacancy even when
 * there was perfectly readable text to show.
 */

const card = (
  overrides: Partial<JobCardViewModel> = {},
): JobCardViewModel => ({
  id: "snapshot-1",
  title: "IT Analyst",
  company: { displayName: "Alpha Ltd" },
  location: "Birmingham",
  workplaceType: "HYBRID",
  freshness: "FRESH",
  sourceSummary: {
    preferredProvider: "GREENHOUSE",
    providerCount: 1,
    employerDirect: true,
  },
  sponsorEvidenceSummary: { status: "MATCHED" },
  saved: false,
  ...overrides,
});

const renderCard = (job: JobCardViewModel) =>
  render(
    <JobResultCard job={job} onSelect={() => {}} onSave={() => {}} saving={false} />,
  );

describe("job card description badge", () => {
  it("claims a full description only when the server says FULL", () => {
    renderCard(card({ descriptionAvailability: "FULL" }));
    expect(screen.getByText("Full description")).toBeTruthy();
  });

  it("says partial for a partial description, however fresh the snapshot is", () => {
    // The exact regression: FRESH snapshot, PARTIAL body.
    renderCard(card({ freshness: "FRESH", descriptionAvailability: "PARTIAL" }));
    expect(screen.getByText("Partial description")).toBeTruthy();
    expect(screen.queryByText("Full description")).toBeNull();
  });

  it("says the description is external for an external-only vacancy", () => {
    renderCard(card({ descriptionAvailability: "EXTERNAL_ONLY" }));
    expect(screen.getByText("Description available externally")).toBeTruthy();
  });

  it("shows no description badge at all when the server sent no state", () => {
    // A badge is a claim. An absent field is not evidence for one.
    renderCard(card({}));
    expect(screen.queryByText("Full description")).toBeNull();
    expect(screen.queryByText("Partial description")).toBeNull();
    expect(screen.queryByText("Description available externally")).toBeNull();
  });
});

const details = (
  completeness: DescriptionAvailability,
  overrides: Partial<JobDetailsViewModel> = {},
): JobDetailsViewModel => ({
  job: card({ descriptionAvailability: completeness }),
  description: {
    text: "About the role\nWe are recruiting an IT analyst for the Birmingham team.",
    source: completeness === "FULL" ? "PROVIDER_FULL" : "PROVIDER_PARTIAL",
    completeness,
    hasReadableText: true,
  },
  providerDescriptionAvailability: completeness,
  sponsorEvidence: {
    summary: { status: "MATCHED" },
    disclaimer: "Sponsor-register evidence is not a sponsorship decision.",
  },
  sourceProvenance: [
    { provider: "GREENHOUSE", providerJobId: "1", hostedUrl: "https://jobs.example.test/1" },
  ],
  hostedUrl: "https://jobs.example.test/1",
  availability: "DISCOVERABLE",
  availableCareerTracks: [],
  ...overrides,
});

const renderDetails = (data: JobDetailsViewModel) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  return render(
    <JobDetailsPanel
      jobSnapshotId="snapshot-1"
      onSaved={() => {}}
      onSave={() => {}}
      saving={false}
    />,
  );
};

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Description tab rules", () => {
  it("shows the Description tab for a FULL description", async () => {
    renderDetails(details("FULL"));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Description" })).toBeTruthy(),
    );
  });

  it("shows the Description tab for a PARTIAL description that has readable text", async () => {
    // Previously hidden, because the gate was `completeness === "FULL"`.
    renderDetails(details("PARTIAL"));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Description" })).toBeTruthy(),
    );
  });

  it("hides the Description tab when there is nothing readable to open", async () => {
    renderDetails(
      details("PARTIAL", {
        description: {
          text: "Read more…",
          source: "PROVIDER_PARTIAL",
          completeness: "PARTIAL",
          hasReadableText: false,
        },
      }),
    );
    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
    // A tab that opens onto an empty panel is worse than no tab.
    expect(screen.queryByRole("tab", { name: "Description" })).toBeNull();
  });

  it("hides the Description tab for an external-only vacancy with no excerpt", async () => {
    renderDetails(
      details("EXTERNAL_ONLY", {
        description: {
          source: "NONE",
          completeness: "EXTERNAL_ONLY",
          hasReadableText: false,
        },
      }),
    );
    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
    expect(screen.queryByRole("tab", { name: "Description" })).toBeNull();
  });

  it("warns inside the Description tab that a partial excerpt is not the advert", async () => {
    const user = userEvent.setup();
    renderDetails(details("PARTIAL"));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Description" })).toBeTruthy(),
    );
    await user.click(screen.getByRole("tab", { name: "Description" }));
    expect(
      screen.getByText(/partial description from the job source/i),
    ).toBeTruthy();
  });
});

describe("the external description control", () => {
  it("shows a complete, untruncated label that says it leaves the site", async () => {
    renderDetails(details("PARTIAL"));
    const link = await screen.findByRole("link", {
      name: /View the complete job description on the employer site/i,
    });
    // The full label text is present in the DOM, not an abbreviation of it.
    expect(link.textContent).toContain("View description on employer site");
    expect(link.getAttribute("href")).toBe("https://jobs.example.test/1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("does not clip or ellipsise the label", async () => {
    renderDetails(details("PARTIAL"));
    const link = await screen.findByRole("link", {
      name: /View the complete job description on the employer site/i,
    });
    const label = link.querySelector("span");
    // `truncate` in this codebase is overflow-hidden + text-overflow: ellipsis +
    // whitespace-nowrap, which is exactly what clipped the old control.
    expect(label?.className ?? "").not.toContain("truncate");
    expect(label?.className ?? "").toContain("whitespace-normal");
    expect(link.className).not.toContain("overflow-hidden");
  });

  it("offers no external control when the backend supplied no safe URL", async () => {
    renderDetails(details("PARTIAL", { hostedUrl: undefined, sourceProvenance: [] }));
    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
    expect(
      screen.queryByRole("link", { name: /employer site/i }),
    ).toBeNull();
  });
});

describe("the Overview expand control", () => {
  it("uses a real label and an icon rather than literal chevron characters", async () => {
    renderDetails(details("FULL"));
    const toggle = await screen.findByRole("button", {
      name: /View full description/i,
    });
    // The old label ended in a bare ASCII "v", which read as a truncated word.
    expect(toggle.textContent).not.toMatch(/\bv$/);
    expect(toggle.textContent).not.toMatch(/\^$/);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
