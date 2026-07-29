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

/** Walk the wizard from the first step to the description step. */
const reachDescriptionStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByRole("button", { name: /Continue/i })[0]);
  await user.click(screen.getAllByRole("button", { name: /Continue/i })[0]);
};

beforeEach(() => {
  cleanup();
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

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
  it("persists it and asks the caller to refresh", async () => {
    const user = userEvent.setup();
    const onSaved = open("PARTIAL");
    await reachDescriptionStep(user);

    const box = screen.getByLabelText(/Full job description/i);
    await user.click(box);
    await user.paste(FULL_ADVERT);
    await user.click(screen.getByRole("button", { name: /Save and reassess/i }));

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("/api/jobs/snapshot-1/description");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).description).toContain(
      "We are recruiting an IT analyst",
    );

    // The panel refetches, so badges, tabs and completeness follow the server's
    // reassessment rather than a client-side guess.
    expect(onSaved).toHaveBeenCalledTimes(1);
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
