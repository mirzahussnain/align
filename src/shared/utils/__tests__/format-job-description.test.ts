import { describe, expect, it } from "vitest";
import { parseJobDescription } from "../format-job-description";

describe("parseJobDescription", () => {
  it("returns empty array when text is undefined or empty", () => {
    expect(parseJobDescription(undefined)).toEqual([]);
    expect(parseJobDescription("   ")).toEqual([]);
  });

  it("identifies headings and lists accurately", () => {
    const rawText = `About The Role
We are seeking a talented Senior Engineer to join our core product team.

Key Requirements
- 5+ years experience in React and TypeScript
- Proven track record with Next.js applications
- Strong understanding of REST APIs

Benefits
- Competitive salary package
- Remote flexible working`;

    const blocks = parseJobDescription(rawText);
    expect(blocks).toHaveLength(6);
    expect(blocks[0]).toEqual({ type: "heading", content: "About The Role" });
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[2]).toEqual({ type: "heading", content: "Key Requirements" });
    expect(blocks[3].type).toBe("list");
    expect(blocks[3].items).toHaveLength(3);
    expect(blocks[4]).toEqual({ type: "heading", content: "Benefits" });
    expect(blocks[5].type).toBe("list");
    expect(blocks[5].items).toHaveLength(2);
  });
});
