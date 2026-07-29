// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobDetailsBoard } from "@/features/job-board/components/JobBoard";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard/jobs/snapshot-42",
  search: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/features/dashboard/components/DashboardTopBar", () => ({
  default: () => <div data-testid="dashboard-top-bar" />,
}));

const details = {
  job: {
    id: "snapshot-42",
    title: "IT Support Apprentice",
    company: { id: "company-1", displayName: "QA" },
    location: "Birmingham, UK",
    workplaceType: "HYBRID",
    employmentType: "APPRENTICESHIP",
    salary: { min: 16000, currency: "GBP" },
    postedAt: new Date(Date.now() - 86_400_000).toISOString(),
    freshness: "FRESH",
    sourceSummary: {
      preferredProvider: "GREENHOUSE",
      providerCount: 1,
      employerDirect: true,
    },
    sponsorEvidenceSummary: { status: "MATCHED" },
    saved: false,
  },
  description: {
    text: "QA are looking for an enthusiastic IT Support Apprentice.\n\n- Provide first line IT support\n- Log and resolve user issues",
    source: "PROVIDER_FULL",
    completeness: "FULL",
    intelligenceCurrent: true,
  },
  descriptionAssessment: {
    availability: "FULL",
    confidence: "HIGH",
    reasons: ["Complete description from employer"],
    source: "PROVIDER_FULL",
  },
  assessedAt: new Date(Date.now() - 86_400_000).toISOString(),
  sponsorEvidence: {
    summary: { status: "MATCHED" },
    disclaimer: "Register evidence is not vacancy evidence.",
    matchedOrganisationName: "QA Limited",
    registerVersion: "2026-07-01",
    checkedAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  sourceProvenance: [
    {
      provider: "GREENHOUSE",
      providerJobId: "QA-HA3GAG",
      hostedUrl: "https://jobs.example.test/qa/42",
    },
  ],
  hostedUrl: "https://jobs.example.test/qa/42",
  availability: "DISCOVERABLE",
  firstSeenAt: new Date(Date.now() - 86_400_000).toISOString(),
  lastRefreshedAt: new Date(Date.now() - 86_400_000).toISOString(),
  practicalRequirements: [
    {
      category: "RIGHT_TO_WORK",
      requirement: "REQUIRED",
      evidenceText: "Applicants must have the right to work in the UK.",
      confidence: "HIGH",
    },
  ],
  vacancySponsorship: {
    signal: "NOT_MENTIONED",
    evidence: [],
    confidence: "MEDIUM",
    reasons: ["No sponsorship wording was found."],
  },
  matchPreparation: { eligible: true },
  availableCareerTracks: [{ id: "track-1", label: "IT Support" }],
};

const response = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

beforeEach(() => {
  cleanup();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/jobs/bootstrap")
        return response({
          profiles: [],
          defaultSearch: { query: "", location: "" },
        });
      if (url === "/api/jobs/snapshot-42") return response(details);
      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
});

describe("redesigned vacancy details", () => {
  it("opens on Overview with stored description, assessment and provenance", async () => {
    render(<JobDetailsBoard jobSnapshotId="snapshot-42" />);

    expect(
      await screen.findByRole("heading", { name: "IT Support Apprentice" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByText(/enthusiastic IT Support Apprentice/),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Key responsibilities")).toBeInTheDocument();
    expect(
      within(panel).getByText("Complete description from employer"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Right to work in the UK required"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("QA Limited")).toBeInTheDocument();
    expect(within(panel).getByText("QA-HA3GAG")).toBeInTheDocument();
    expect(within(panel).getByText("2026-07-01")).toBeInTheDocument();
  });

  it("states no licence status, because the register match carries none", async () => {
    render(<JobDetailsBoard jobSnapshotId="snapshot-42" />);

    await screen.findByRole("heading", { name: "IT Support Apprentice" });
    expect(screen.queryByText(/licence status/i)).not.toBeInTheDocument();
  });

  it("moves between detail tabs and opens Check Match modal from Check match", async () => {
    const user = userEvent.setup();
    render(<JobDetailsBoard jobSnapshotId="snapshot-42" />);
    await screen.findByRole("heading", { name: "IT Support Apprentice" });

    await user.click(screen.getByRole("tab", { name: "Requirements" }));
    expect(
      screen.getByText(/Applicants must have the right to work in the UK/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check match" }));
    expect(
      await screen.findByRole("dialog", { name: "Check Vacancy Match" }),
    ).toBeInTheDocument();
  });

  it("labels the source link as the original advert when no application URL exists", async () => {
    render(<JobDetailsBoard jobSnapshotId="snapshot-42" />);

    expect(
      await screen.findByRole("link", { name: /View the original advert/ }),
    ).toHaveAttribute("href", "https://jobs.example.test/qa/42");
  });
});
