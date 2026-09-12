import { describe, expect, it } from "vitest";
import {
  extractVacancyFromHtml,
  VacancyExtractionError,
} from "@/shared/services/vacancy-url-extractor";

const longDescription =
  "Build reliable reporting products with analysts and engineers. ".repeat(10);

describe("vacancy URL extraction", () => {
  it("extracts a schema.org JobPosting and converts its description to text", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Senior Data Analyst",
              "hiringOrganization": { "@type": "Organization", "name": "Acme Ltd" },
              "jobLocation": {
                "@type": "Place",
                "address": {
                  "addressLocality": "Leeds",
                  "addressRegion": "West Yorkshire",
                  "addressCountry": "GB"
                }
              },
              "description": "<p>${longDescription}</p><ul><li>SQL &amp; Python</li></ul>"
            }
          </script>
        </head>
      </html>
    `;

    const result = extractVacancyFromHtml(
      html,
      "https://jobs.example/vacancy/123",
    );

    expect(result).toMatchObject({
      title: "Senior Data Analyst",
      employerName: "Acme Ltd",
      locationText: "Leeds, West Yorkshire, GB",
      source: "JOB_POSTING_JSON_LD",
      warnings: [],
    });
    expect(result.description).toContain("SQL & Python");
    expect(result.description).not.toContain("<p>");
  });

  it("finds a JobPosting inside an @graph after malformed JSON-LD", () => {
    const html = `
      <script type="application/ld+json">{ broken JSON </script>
      <script type="application/ld+json">
        {
          "@graph": [{
            "@type": ["Thing", "JobPosting"],
            "name": "Platform Engineer",
            "jobLocationType": "TELECOMMUTE",
            "description": "<p>${longDescription}</p>"
          }]
        }
      </script>
    `;

    const result = extractVacancyFromHtml(html, "https://jobs.example/remote");

    expect(result.title).toBe("Platform Engineer");
    expect(result.locationText).toBe("Remote");
    expect(result.warnings).toContain(
      "The page did not expose the hiring organisation.",
    );
  });

  it("falls back to page metadata and visible main content with a review warning", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Business Analyst &amp; Planner">
          <meta property="og:site_name" content="Example Careers">
        </head>
        <body><main><h1>Business Analyst</h1><p>${longDescription}</p></main></body>
      </html>
    `;

    const result = extractVacancyFromHtml(html, "https://jobs.example/456");

    expect(result).toMatchObject({
      title: "Business Analyst & Planner",
      employerName: "Example Careers",
      source: "PAGE_METADATA",
    });
    expect(result.description).toContain("Build reliable reporting products");
    expect(result.warnings[0]).toContain("review every imported field");
  });

  it("rejects a page that contains no readable vacancy", () => {
    expect(() =>
      extractVacancyFromHtml(
        "<html><body><nav>Home</nav></body></html>",
        "https://example.com",
      ),
    ).toThrowError(VacancyExtractionError);
  });
});
