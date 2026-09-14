/**
 * Pure parser. NO React, and deliberately no re-export of the renderer.
 *
 * This file used to re-export `FormattedJobDescription` from a sibling
 * `format-job-description.tsx`, which imported `./format-job-description`
 * straight back. Two files sharing one basename, referring to each other
 * through an extensionless specifier, is a resolution cycle the bundler cannot
 * settle: `/dashboard/jobs` sat on "Compiling …" indefinitely and never
 * rendered. The renderer now lives in
 * `@/shared/components/ui/FormattedJobDescription`, which is where a component
 * belongs anyway, and the dependency runs one way only: component → parser.
 */

export type DescriptionSectionType = "heading" | "paragraph" | "list";

export interface DescriptionBlock {
  type: DescriptionSectionType;
  content?: string;
  items?: string[];
  level?: number;
}

const HEADING_KEYWORDS = [
  "about the role",
  "about the position",
  "about the job",
  "about the team",
  "about the company",
  "about us",
  "company overview",
  "role overview",
  "job summary",
  "position summary",
  "key responsibilities",
  "responsibilities",
  "duties",
  "what you'll do",
  "what you will do",
  "key requirements",
  "requirements",
  "essential skills",
  "essentials",
  "desired skills",
  "qualifications",
  "who you are",
  "what we are looking for",
  "what we're looking for",
  "experience required",
  "salary & benefits",
  "salary",
  "benefits",
  "perks",
  "what we offer",
  "what's in it for you",
  "why join us",
  "how to apply",
];

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;

  const normalized = trimmed.toLowerCase().replace(/[:#*_-]+$/g, "").trim();

  // Check keyword matches
  if (HEADING_KEYWORDS.some((kw) => normalized === kw || normalized.startsWith(kw))) {
    return true;
  }

  // Lines ending with colon and short (e.g. "Requirements:")
  if (trimmed.endsWith(":") && trimmed.length < 50 && !trimmed.includes(".")) {
    return true;
  }

  // Markdown headers
  if (/^#{1,4}\s+/.test(trimmed)) {
    return true;
  }

  // ALL CAPS short titles (e.g. "ABOUT THE COMPANY")
  if (
    trimmed.length >= 4 &&
    trimmed.length <= 45 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed) &&
    !trimmed.includes(".")
  ) {
    return true;
  }

  return false;
}

function cleanHeadingText(text: string): string {
  return text
    .replace(/^#{1,4}\s+/, "")
    .replace(/\*{2,}/g, "")
    .replace(/[:#*_-]+$/g, "")
    .trim();
}

function isBulletLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:[-*•–—]|(?:\d+\.))\s+/.test(trimmed);
}

function cleanBulletText(line: string): string {
  return line.trim().replace(/^(?:[-*•–—]|(?:\d+\.))\s+/, "").trim();
}

/**
 * Heuristically parses a plain job description into structured sections
 * (Headings, Bullet lists, Paragraphs).
 */
export function parseJobDescription(text?: string): DescriptionBlock[] {
  if (!text || !text.trim()) return [];

  const rawBlocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  const parsedBlocks: DescriptionBlock[] = [];

  for (const block of rawBlocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Case 1: Heading
      if (isHeadingLine(line)) {
        parsedBlocks.push({
          type: "heading",
          content: cleanHeadingText(line),
        });
        i++;
        continue;
      }

      // Case 2: Bullet list block
      if (isBulletLine(line)) {
        const items: string[] = [];
        while (
          i < lines.length &&
          (isBulletLine(lines[i]) ||
            (items.length > 0 &&
              !isHeadingLine(lines[i]) &&
              lines[i].length < 120 &&
              !lines[i].endsWith(".")))
        ) {
          if (isBulletLine(lines[i])) {
            items.push(cleanBulletText(lines[i]));
          } else if (items.length > 0) {
            items[items.length - 1] += " " + lines[i];
          }
          i++;
        }
        if (items.length > 0) {
          parsedBlocks.push({
            type: "list",
            items,
          });
        }
        continue;
      }

      // Case 3: Paragraph
      const paragraphLines: string[] = [];
      while (i < lines.length && !isHeadingLine(lines[i]) && !isBulletLine(lines[i])) {
        paragraphLines.push(lines[i]);
        i++;
      }
      if (paragraphLines.length > 0) {
        parsedBlocks.push({
          type: "paragraph",
          content: paragraphLines.join(" "),
        });
      }
    }
  }

  return parsedBlocks;
}
