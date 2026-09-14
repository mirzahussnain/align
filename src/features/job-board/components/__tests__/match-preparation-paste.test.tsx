// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckMatchModal } from "@/features/job-board/components/CheckMatchModal";

/**
 * Match preparation for an incomplete vacancy.
 *
 * THE DEFECT. The paste step existed but could not do its job. The textarea was
 * PRE-FILLED with the provider's partial text, so pressing Continue submitted
 * the same teaser and the save was then skipped because the value had not
 * changed. Worse, `partialDescriptionAccepted` was hardcoded to
 * `!isFullDescription`, so the server-side reduced-confidence guard was
 * auto-answered on the user's behalf and they were never told they were about
 * to analyse half an advert.
 */

const PARTIAL_EXCERPT =
  "We are recruiting an IT analyst for our Birmingham service desk team…";

const FULL_ADVERT = [
  "About the role",
  "We are recruiting an IT analyst to join our Birmingham service desk team.",
  "You will be the first point of contact for around 400 colleagues across three sites.",
  "Responsibilities include triaging first-line incidents against agreed service levels,",
  "building and deploying standard Windows 11 laptop images, and keeping the ITSM records accurate.",
  "Essential: one year in a service desk role and confident troubleshooting Windows and Microsoft 365.",
  "Desirable: exposure to Active Directory administration and Intune.",
  "We offer 25 days of annual leave, a matched pension and a professional development budget.",
].join("\n");

let fetchMock: ReturnType<typeof vi.fn>;

const open = (
  completeness: "FULL" | "PARTIAL" | "EXTERNAL_ONLY",
  onDescriptionSaved = vi.fn(),
) => {
  render(
    <CheckMatchModal
      open
      onClose={() => {}}
      jobId="snapshot-1"
      jobTitle="IT Analyst"
      companyName="Alpha Ltd"
      descriptionCompleteness={completeness}
      providerDescription={completeness === "FULL" ? FULL_ADVERT : PARTIAL_EXCERPT}
      availableCareerTracks={[{ id: "track-1", label: "IT Support" }]}
      hostedUrl="https://jobs.example.test/1"
      onDescriptionSaved={onDescriptionSaved}
    />,
  );
  return onDescriptionSaved;
};

/**
 * Walk the wizard from the first step to the description step, choosing the
 * stored CV the modal offers — the analysis reads a real document, so the CV
 * step cannot be walked past on a radio button alone.
 */
const reachDescriptionStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByRole("button", { name: /Continue/i })[0]);
  await screen.findByRole("radio", { name: /baseline-cv\.pdf/i });
  await user.click(screen.getAllByRole("button", { name: /Continue/i })[0]);
};

const STORED_CVS = [
  {
    id: "stored-1",
    originalFilename: "baseline-cv.pdf",
    sizeBytes: 90_000,
    createdAt: "2026-07-01T09:00:00.000Z",
    objectAvailable: true,
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  cleanup();
  fetchMock = vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/stored-cvs")) return json({ storedCvs: STORED_CVS });
    if (url.includes("match-preparation")) return json({ matchRequestId: "match-1" });
    if (url.includes("/api/job-matches")) return json(ANALYZE_RESULT);
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});

/** A minimal, realistic /api/analyze response for a job match. */
const ANALYZE_RESULT = {
  analysisId: "analysis-9",
  overallScore: 72,
  jobMatchReport: {
    overview: {
      score: 72,
      verdict: "Strong Candidate",
      summary: "Your service desk experience covers most of what this advert asks for.",
      experienceGap: "",
      recommendation: "",
    },
    requirements: {
      totals: {
        mandatory: 4,
        desirable: 2,
        mandatoryMet: 3,
        desirableMet: 1,
        met: 4,
        partial: 1,
        notMet: 1,
        unclear: 0,
        contradicted: 0,
        visible: 6,
        locked: 0,
        total: 6,
      },
      items: [],
      hasPersonSpecification: true,
    },
    mandatoryGaps: { missing: ["Intune administration"], partial: ["Active Directory"] },
    access: { fullReport: true, requirementLedger: true, rewriteStrategy: true, eligibility: true },
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a partial vacancy prompts for the full description", () => {
  it("states plainly that the vacancy has no complete description", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    expect(
      screen.getByText(
        /This vacancy does not include a complete job description\./i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Paste the full description to get a reliable match analysis\./i,
      ),
    ).toBeTruthy();
  });

  it("starts with an EMPTY box rather than the provider's teaser", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    // Pre-filling let a user press Continue on the same partial text and have it
    // counted as a completed paste.
    const box = screen.getByLabelText(/Full job description/i);
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("offers Paste, Clear, a character count and Save and reassess", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    expect(screen.getByRole("button", { name: /^Paste$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Clear$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save and reassess/i })).toBeTruthy();
    expect(screen.getByText(/0 characters/i)).toBeTruthy();
  });

  it("keeps the provider excerpt visible but separate from the paste box", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    expect(
      screen.getByText(/Show the partial text the job source supplied/i),
    ).toBeTruthy();
  });

  it("links out to the employer site with a complete, honest label", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    const link = screen.getByRole("link", {
      name: /View description on employer site/i,
    });
    expect(link.getAttribute("href")).toBe("https://jobs.example.test/1");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("validation before a paste is accepted", () => {
  it("refuses to save a paste that is too short to be an advert", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    await user.type(screen.getByLabelText(/Full job description/i), "Too short");
    expect(
      screen.getByRole("button", { name: /Save and reassess/i }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/at least 400 needed/i)).toBeTruthy();
  });

  it("blocks Continue until either a paste is saved or the warning is accepted", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    const advance = screen
      .getAllByRole("button", { name: /Continue/i })
      .at(-1) as HTMLButtonElement;
    expect(advance.disabled).toBe(true);

    await user.click(
      screen.getByRole("checkbox", { name: /Continue without the full description/i }),
    );
    expect(advance.disabled).toBe(false);
  });
});

describe("saving a pasted description", () => {
  it("keeps it as a private match-time override instead of mutating the shared vacancy", async () => {
    const user = userEvent.setup();
    const onSaved = open("PARTIAL");
    await reachDescriptionStep(user);

    const box = screen.getByLabelText(/Full job description/i);
    await user.click(box);
    await user.paste(FULL_ADVERT);
    await user.click(screen.getByRole("button", { name: /Save and reassess/i }));

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/description"))).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText(/Saved and reassessed/i)).toBeTruthy();
  });

  it("does not send the reduced-confidence acceptance once a full paste is saved", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    const box = screen.getByLabelText(/Full job description/i);
    await user.click(box);
    await user.paste(FULL_ADVERT);
    await user.click(screen.getByRole("button", { name: /Save and reassess/i }));
    await user.click(
      screen.getAllByRole("button", { name: /Continue/i }).at(-1) as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: /Start Analysis/i }));

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("match-preparation"),
    );
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
      partialDescriptionAccepted: false,
    });
  });

  it("sends the acceptance only when the user actually ticked it", async () => {
    const user = userEvent.setup();
    open("PARTIAL");
    await reachDescriptionStep(user);

    await user.click(
      screen.getByRole("checkbox", { name: /Continue without the full description/i }),
    );
    await user.click(
      screen.getAllByRole("button", { name: /Continue/i }).at(-1) as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: /Start Analysis/i }));

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("match-preparation"),
    );
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
      partialDescriptionAccepted: true,
    });
  });
});

/**
 * THE DEFECT this covers. "Start Analysis" only prepared a match request and
 * then navigated to /analyze, where the user met an empty upload form: the
 * career track, CV choice and description they had just given bought them
 * nothing, and the analysis had not started.
 */
describe("the analysis runs inside the modal", () => {
  it("blocks the CV step until a CV is actually chosen", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/stored-cvs")) return json({ storedCvs: [] });
      return json({ ok: true });
    });

    const user = userEvent.setup();
    open("FULL");
    await user.click(screen.getAllByRole("button", { name: /Continue/i })[0]);

    // Nothing stored and nothing uploaded: there is no document to analyse, so
    // the wizard cannot advance on the radio button alone.
    expect(await screen.findByText(/You have no stored CVs yet/i)).toBeTruthy();
    const advance = () =>
      screen.getAllByRole("button", { name: /Continue/i })[0] as HTMLButtonElement;
    expect(advance().disabled).toBe(true);

    await user.click(screen.getByRole("radio", { name: /Upload New CV/i }));
    expect(advance().disabled).toBe(true);

    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["%PDF-1.7 cv"], "fresh-cv.pdf", { type: "application/pdf" }),
    );
    expect(advance().disabled).toBe(false);
  });

  it("selects a stored CV by default so a repeat match needs no re-upload", async () => {
    const user = userEvent.setup();
    open("FULL");
    await user.click(screen.getAllByRole("button", { name: /Continue/i })[0]);

    const stored = await screen.findByRole("radio", { name: /baseline-cv\.pdf/i });
    expect((stored as HTMLInputElement).checked).toBe(true);
  });

  it("posts the chosen stored CV to the dedicated Job Match endpoint without navigating away", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    const user = userEvent.setup();
    open("FULL");
    await reachDescriptionStep(user);
    await user.click(screen.getByRole("button", { name: /Start Analysis/i }));

    await screen.findByText(/Analysis complete/i);

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/job-matches"),
    );
    const body = (call?.[1] as RequestInit).body as FormData;
    expect(body.get("mode")).toBe("job_match");
    expect(body.get("jobMatchRequestId")).toBe("match-1");
    expect(body.get("storedCvId")).toBe("stored-1");
    // The CV travels as an id, never as a re-upload the user already did.
    expect(body.get("file")).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the server's score, verdict and gaps, and a link to the full report", async () => {
    const user = userEvent.setup();
    open("FULL");
    await reachDescriptionStep(user);
    await user.click(screen.getByRole("button", { name: /Start Analysis/i }));

    await screen.findByText(/Analysis complete/i);
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getByText(/Strong Candidate/i)).toBeTruthy();
    expect(screen.getByText(/3 of 4 essential requirements met/i)).toBeTruthy();
    expect(screen.getByText(/Intune administration/i)).toBeTruthy();

    const link = screen.getByRole("link", { name: /View Full Analysis/i });
    expect(link.getAttribute("href")).toBe(
      "/dashboard?tab=job_matches&analysis=analysis-9",
    );
  });

  it("returns to the review step with the shared not-charged wording on a provider failure", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/stored-cvs")) return json({ storedCvs: STORED_CVS });
      if (url.includes("match-preparation")) return json({ matchRequestId: "match-1" });
      return json({ code: "AI_OPERATION_FAILED", reason: "provider_unavailable" }, 503);
    });

    const user = userEvent.setup();
    open("FULL");
    await reachDescriptionStep(user);
    await user.click(screen.getByRole("button", { name: /Start Analysis/i }));

    expect(await screen.findByText(/You were not charged/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start Analysis/i })).toBeTruthy();
    expect(screen.queryByText(/Analysis complete/i)).toBeNull();
  });

  it("hides the report link when the result could not be filed", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/stored-cvs")) return json({ storedCvs: STORED_CVS });
      if (url.includes("match-preparation")) return json({ matchRequestId: "match-1" });
      const withoutId = { ...ANALYZE_RESULT, analysisId: undefined };
      return json(withoutId);
    });

    const user = userEvent.setup();
    open("FULL");
    await reachDescriptionStep(user);
    await user.click(screen.getByRole("button", { name: /Start Analysis/i }));

    await screen.findByText(/Analysis complete/i);
    // No dead CTA: an honest note instead of a button that leads nowhere.
    expect(screen.queryByRole("link", { name: /View Full Analysis/i })).toBeNull();
    expect(screen.getByText(/could not be saved to your history/i)).toBeTruthy();
  });
});

describe("a complete vacancy skips the paste step entirely", () => {
  it("never asks for a paste and never claims a partial advert", async () => {
    const user = userEvent.setup();
    open("FULL");
    await reachDescriptionStep(user);

    expect(
      screen.queryByText(/does not include a complete job description/i),
    ).toBeNull();
    expect(screen.getByText(/Complete advert from the job source/i)).toBeTruthy();
  });
});
