// @vitest-environment jsdom

/**
 * The Job Details UI contract for the three separated blocks.
 *
 * These assertions are deliberately about WORDS, not colours: every state has to
 * be readable in greyscale and to a screen reader, so each test looks for the
 * label rather than a class name.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobDetailsBoard } from "@/features/job-board/components/JobBoard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/jobs/snapshot-9",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/features/dashboard/components/DashboardTopBar", () => ({
  default: () => <div data-testid="dashboard-top-bar" />,
}));

const baseDetails = {
  job: {
    id: "snapshot-9",
    title: "Ward Administrator",
    company: { id: "company-1", displayName: "Fixture Care" },
    location: "Birmingham, UK",
    freshness: "FRESH",
    sourceSummary: { preferredProvider: "GREENHOUSE", providerCount: 1, employerDirect: true },
    sponsorEvidenceSummary: { status: "MATCHED" },
    saved: false,
  },
  description: {
    text: "About the role.\n\n- Support the ward team\n- Maintain records",
    source: "PROVIDER_FULL",
    completeness: "FULL",
    hasReadableText: true,
    intelligenceCurrent: true,
  },
  sponsorEvidence: {
    status: "MATCHED",
    summary: { status: "MATCHED" },
    disclaimer:
      "Sponsor-register evidence indicates that an organisation name may appear on the UK register. It does not confirm sponsorship for a particular vacancy or candidate.",
    matchedOrganisationName: "FIXTURE CARE LIMITED",
    registerVersion: "register-v1",
    checkedAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  vacancySponsorship: {
    signal: "NOT_AVAILABLE",
    evidence: [{ text: "We cannot offer sponsorship for this position." }],
    confidence: "HIGH",
    reasons: ["The vacancy explicitly says sponsorship is not available."],
  },
  practicalRequirements: [
    { category: "DBS", requirement: "REQUIRED", value: "ENHANCED", evidenceText: "Enhanced DBS check required.", confidence: "HIGH" },
  ],
  practicalCompatibility: {
    items: [
      { category: "RIGHT_TO_WORK", state: "CONFIRMED", confirmedProfileFact: "British citizen", explanation: "Your profile records a current right-to-work status.", source: "BOTH" },
      { category: "DRIVING_LICENCE", state: "CONFLICT", confirmedProfileFact: "Driving licence recorded as not held", vacancyRequirement: "Required by the vacancy", explanation: "The vacancy states a driving licence and your profile records that you do not hold one.", source: "BOTH" },
      { category: "DBS", state: "UNKNOWN", vacancyRequirement: "ENHANCED (required)", explanation: "The vacancy mentions a DBS check. Your DBS status is not recorded in your profile.", source: "VACANCY" },
    ],
    summary: { confirmed: 1, conflicts: 1, unknown: 1, notApplicable: 0 },
    updatableCategories: ["DBS"],
    disclaimer:
      "This comparison uses the information recorded in your profile and the wording detected in the vacancy. It is not legal or immigration advice.",
  },
  sourceProvenance: [{ provider: "GREENHOUSE", providerJobId: "g-1", hostedUrl: "https://jobs.test/9" }],
  availability: "DISCOVERABLE",
  firstSeenAt: new Date().toISOString(),
  lastRefreshedAt: new Date().toISOString(),
  matchPreparation: { eligible: true },
  availableCareerTracks: [{ id: "track-1", label: "Administration" }],
};

const response = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

function mountWith(details: unknown) {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/jobs/bootstrap")
        return response({ profiles: [], defaultSearch: { query: "", location: "" } });
      if (url.startsWith("/api/jobs/snapshot-9")) return response(details);
      throw new Error(`Unexpected URL: ${url}`);
    }),
  );
  return render(<JobDetailsBoard jobSnapshotId="snapshot-9" />);
}

const openSponsorshipTab = async () => {
  await userEvent.click(await screen.findByRole("tab", { name: "Sponsorship" }));
  return screen.getByRole("tabpanel");
};

beforeEach(cleanup);

describe("employer sponsor-register evidence", () => {
  it("shows a matched organisation and the date it was checked", async () => {
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();

    expect(within(panel).getByText("Employer sponsor-register evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Employer on UK register")).toBeInTheDocument();
    expect(within(panel).getByText("FIXTURE CARE LIMITED")).toBeInTheDocument();
    expect(within(panel).getByText("1 day ago")).toBeInTheDocument();
    expect(within(panel).queryByText("Not recorded")).not.toBeInTheDocument();
  });

  it("always shows the disclaimer", async () => {
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();
    expect(
      within(panel).getByText(/does not confirm sponsorship for a particular vacancy or candidate/),
    ).toBeInTheDocument();
  });

  it("states an ambiguous employer without making a definitive claim", async () => {
    mountWith({
      ...baseDetails,
      sponsorEvidence: {
        status: "AMBIGUOUS",
        summary: { status: "AMBIGUOUS" },
        disclaimer: baseDetails.sponsorEvidence.disclaimer,
        checkedAt: new Date().toISOString(),
      },
    });
    const panel = await openSponsorshipTab();
    expect(within(panel).getByText("Possible sponsor-register match")).toBeInTheDocument();
    expect(
      within(panel).getByText(/could correspond to more than one organisation/),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Employer on UK register")).not.toBeInTheDocument();
  });

  it("distinguishes an unavailable check from a completed no-match", async () => {
    mountWith({
      ...baseDetails,
      sponsorEvidence: {
        status: "NOT_CHECKED",
        checkState: "CHECK_UNAVAILABLE",
        summary: { status: "NOT_CHECKED" },
        disclaimer: baseDetails.sponsorEvidence.disclaimer,
      },
    });
    const panel = await openSponsorshipTab();
    expect(within(panel).getByText("Check unavailable")).toBeInTheDocument();
    expect(within(panel).getByText(/could not be reached/)).toBeInTheDocument();
    expect(within(panel).queryByText("No sponsor-register match found")).not.toBeInTheDocument();
  });

  it("says a completed no-match was checked against the current register", async () => {
    mountWith({
      ...baseDetails,
      sponsorEvidence: {
        status: "NONE",
        summary: { status: "NONE" },
        registerVersion: "register-v1",
        checkedAt: new Date().toISOString(),
        disclaimer: baseDetails.sponsorEvidence.disclaimer,
      },
    });
    const panel = await openSponsorshipTab();
    expect(within(panel).getByText("No sponsor-register match found")).toBeInTheDocument();
    expect(within(panel).getByText(/checked against the current register/)).toBeInTheDocument();
  });

  it("flags stale evidence rather than presenting it as current", async () => {
    mountWith({
      ...baseDetails,
      sponsorEvidence: { ...baseDetails.sponsorEvidence, stale: true },
    });
    const panel = await openSponsorshipTab();
    expect(within(panel).getByText(/newer version of the sponsor register/)).toBeInTheDocument();
  });
});

describe("vacancy sponsorship wording stays separate", () => {
  it("renders as its own block and says it is not derived from register evidence", async () => {
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();

    expect(within(panel).getByText("Vacancy sponsorship wording")).toBeInTheDocument();
    expect(within(panel).getByText("Sponsorship stated as unavailable")).toBeInTheDocument();
    expect(
      within(panel).getByText(/not derived from the employer's sponsor-register evidence/i),
    ).toBeInTheDocument();
  });

  it("shows a register match and an unavailable-sponsorship advert at the same time", async () => {
    // The exact combination that must never collapse into one verdict.
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();
    expect(within(panel).getByText("Employer on UK register")).toBeInTheDocument();
    expect(within(panel).getByText("Sponsorship stated as unavailable")).toBeInTheDocument();
  });
});

describe("your practical compatibility", () => {
  it("renders confirmed, conflict and unknown states as words", async () => {
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();
    const compatibility = within(panel).getByText("Your practical compatibility").closest("section")
      ?? panel;

    expect(within(compatibility).getByText("Confirmed")).toBeInTheDocument();
    expect(within(compatibility).getByText("Potential conflict")).toBeInTheDocument();
    expect(within(compatibility).getByText("Not confirmed")).toBeInTheDocument();
    expect(within(compatibility).getByText("Right to work")).toBeInTheDocument();
    expect(within(compatibility).getByText("DBS check")).toBeInTheDocument();
  });

  it("shows no overall eligibility score", async () => {
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();
    expect(within(panel).queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/eligibility score/i)).not.toBeInTheDocument();
  });

  it("offers a profile update route when something is not confirmed", async () => {
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();
    expect(within(panel).getAllByRole("link", { name: "Update profile" })[0]).toBeInTheDocument();
  });

  it("does not offer an update route when nothing is missing", async () => {
    mountWith({
      ...baseDetails,
      practicalCompatibility: {
        ...baseDetails.practicalCompatibility,
        items: [baseDetails.practicalCompatibility.items[0]],
        summary: { confirmed: 1, conflicts: 0, unknown: 0, notApplicable: 0 },
        updatableCategories: [],
      },
    });
    const panel = await openSponsorshipTab();
    expect(within(panel).queryByRole("link", { name: "Update profile" })).not.toBeInTheDocument();
  });

  it("carries its own disclaimer and never a legal conclusion", async () => {
    mountWith(baseDetails);
    const panel = await openSponsorshipTab();
    expect(within(panel).getByText(/not legal or immigration advice/)).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/legally eligible|you cannot apply|must sponsor you/i);
  });

  it("asks for a Career Track instead of showing an empty comparison", async () => {
    const { practicalCompatibility: _omitted, ...withoutComparison } = baseDetails;
    mountWith(withoutComparison);
    const panel = await openSponsorshipTab();
    expect(
      within(panel).getByText(/Choose a Career Track to compare this vacancy/),
    ).toBeInTheDocument();
  });
});
