// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VacancyIntake } from "@/features/job-board/components/VacancyIntake";

const readJson = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/job-board/lib/job-board", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/job-board/lib/job-board")>();
  return { ...original, readJson };
});

beforeEach(() => {
  readJson.mockImplementation((url: string) => {
    if (url === "/api/jobs/bootstrap") {
      return Promise.resolve({
        profiles: [
          { profileId: "track-1", label: "Data", isDefault: true },
        ],
      });
    }
    if (url === "/api/stored-cvs") {
      return Promise.resolve({
        storedCvs: [
          {
            id: "cv-1",
            originalFilename: "data-cv.pdf",
            createdAt: "2026-07-01T00:00:00.000Z",
            objectAvailable: true,
          },
        ],
      });
    }
    if (url === "/api/jobs/intake/extract") {
      return Promise.resolve({
        finalUrl: "https://jobs.example/vacancy/123",
        title: "Senior Data Analyst",
        employerName: "Acme Ltd",
        locationText: "Leeds, UK",
        description:
          "Build trusted reporting products with SQL, Python and stakeholder collaboration. ".repeat(
            8,
          ),
        source: "JOB_POSTING_JSON_LD",
        warnings: [],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("universal vacancy intake", () => {
  it("collects the external vacancy, Career Track and CV before analysis", async () => {
    render(<VacancyIntake />);

    expect(screen.getAllByText("Add Job").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Job URL/)).toBeInTheDocument();
    expect(screen.getByLabelText("Job title")).toBeInTheDocument();
    expect(screen.getByLabelText("Employer")).toHaveAttribute("placeholder", "Example Ltd");
    expect(screen.getByText("Employer name helps Align check sponsorship information.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full job description/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Check Profile & Requirements",
      }),
    ).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByLabelText("Career Track")).toHaveValue("track-1");
      expect(screen.getByLabelText("Choose stored CV")).toHaveValue("cv-1");
    });
  });

  it("imports a public vacancy URL into editable fields", async () => {
    render(<VacancyIntake />);

    fireEvent.change(screen.getByLabelText(/Job URL/), {
      target: { value: "https://jobs.example/vacancy/123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Import Vacancy" }),
    );

    await waitFor(() => {
      expect(readJson).toHaveBeenCalledWith(
        "/api/jobs/intake/extract",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByLabelText("Job title")).toHaveValue(
        "Senior Data Analyst",
      );
      expect(screen.getByLabelText("Employer")).toHaveValue("Acme Ltd");
      expect(screen.getByLabelText(/Location/)).toHaveValue("Leeds, UK");
      expect(
        (screen.getByLabelText(/Full job description/) as HTMLTextAreaElement)
          .value,
      ).toContain("SQL, Python");
    });
  });
});
