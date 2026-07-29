// @vitest-environment jsdom

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JobResultCard } from "@/features/job-board/components/JobBoard";
import type { JobCardViewModel } from "@/features/job-board/lib/job-board";

const card = (id: string, company: string): JobCardViewModel => ({
  id,
  title: "IT Analyst",
  company: { displayName: company },
  location: "Birmingham",
  workplaceType: "HYBRID",
  employmentType: "FULL_TIME",
  freshness: "FRESH",
  sourceSummary: {
    preferredProvider: "GREENHOUSE",
    providerCount: 1,
    employerDirect: true,
  },
  sponsorEvidenceSummary: { status: "MATCHED" },
  saved: false,
});

function EqualTitleHarness() {
  const [jobs, setJobs] = useState([
    card("snapshot-1", "Alpha Ltd"),
    card("snapshot-2", "Beta Ltd"),
  ]);
  const [selected, setSelected] = useState("snapshot-1");
  return (
    <>
      {jobs.map((job) => (
        <JobResultCard
          key={job.id}
          job={job}
          selected={selected === job.id}
          careerTrackId="track-1"
          onSelect={() => setSelected(job.id)}
          onSave={() =>
            setJobs((current) =>
              current.map((item) =>
                item.id === job.id ? { ...item, saved: !item.saved } : item,
              ),
            )
          }
          saving={false}
        />
      ))}
    </>
  );
}

describe("durable equal-title vacancy identity", () => {
  it("renders, selects and saves equal-title jobs independently without a duplicate-key warning", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(<EqualTitleHarness />);

    expect(screen.getAllByRole("button", { name: "IT Analyst" })).toHaveLength(
      2,
    );
    await user.click(screen.getAllByRole("button", { name: "IT Analyst" })[1]);
    expect(
      screen.getAllByRole("button", { name: "IT Analyst" })[1],
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getAllByRole("button", { name: "Save IT Analyst" })[0],
    );
    expect(
      screen.getByRole("button", { name: "Unsave IT Analyst" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Save IT Analyst" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(
      /same key|unique key/i,
    );
    consoleError.mockRestore();
  });
});
