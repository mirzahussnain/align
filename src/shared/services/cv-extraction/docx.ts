import { CvPipelineError } from './errors';
import { normaliseExtractedText } from './text';
import { mergeLinks, normaliseUrl, type ExtractedLink } from './links';
import { readDocxBodyExtras, readDocxHeadersAndFooters, type DocxPart } from './docx-parts';
import type { RawExtraction } from './pdf';

/**
 * Read the text of a WordprocessingML (.docx) document, and the addresses behind
 * its hyperlinks.
 *
 * Three passes, each with a different job:
 *
 *   - `mammoth.extractRawText` produces the canonical text, one line per
 *     paragraph. This is unchanged and remains the authority on what the text of
 *     a DOCX is;
 *   - `mammoth.convertToHtml` produces the same content with `<a href>` intact,
 *     which is the only way to recover a hyperlink whose visible label is "Repo".
 *     Anchors are matched back onto the raw-text lines by their paragraph text,
 *     so a link keeps the line it appeared on;
 *   - `readDocxHeadersAndFooters` and `readDocxBodyExtras` cover the parts
 *     mammoth does not walk: headers, footers, text boxes, and links stored as
 *     field codes rather than as `w:hyperlink` elements.
 *
 * VERIFIED coverage (asserted by the fixture tests in ./__tests__):
 *   - body paragraphs, including headings and styled runs;
 *   - bulleted and numbered list items;
 *   - table cell text;
 *   - hyperlink targets in body paragraphs, list items and table cells;
 *   - header and footer paragraph text, and hyperlink targets within them;
 *   - text box / shape paragraph text, and hyperlink targets within it;
 *   - hyperlinks written as `HYPERLINK` field codes.
 *
 * NOT covered, and deliberately not claimed in any user-facing copy:
 *   - comments, footnotes and endnotes;
 *   - the legacy binary `.doc` format, which is rejected at signature validation.
 *
 * Anything the parser could not see is absent, and the import review is where the
 * user supplies it — it is never invented.
 */
export async function extractDocx(bytes: Buffer): Promise<RawExtraction> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: bytes });
    const body = normaliseExtractedText(result.value ?? '');

    // Headers, text boxes and footers are all outside mammoth's walk. Headers
    // and text boxes go ABOVE the body: a CV whose contact block lives in a page
    // header, or whose whole left column is a text box, then lands in the head
    // block where identity reading looks, in the order a reader sees it. Footers
    // trail the document, which is where they are read.
    const { headers, footers } = await readDocxHeadersAndFooters(bytes);
    const { textBoxes, fieldLinks } = await readDocxBodyExtras(bytes);

    const text = normaliseExtractedText(
      [joinParts(headers), joinParts(textBoxes), body, joinParts(footers)].filter(Boolean).join('\n')
    );
    const lines = text.split('\n');

    const bodyLinks = await readBodyHyperlinks(bytes, lines);
    const partLinks = locatePartLinks([...headers, ...textBoxes, ...footers], lines);
    const fieldCodeLinks = locateFieldLinks(fieldLinks, lines);

    return { text, pageCount: null, links: mergeLinks(bodyLinks, partLinks, fieldCodeLinks) };
  } catch (error) {
    if (error instanceof CvPipelineError) throw error;
    // mammoth throws for a non-OOXML archive or a damaged part. Its message can
    // include internal part names, so it is logged and never returned.
    console.warn('[cv-extraction] DOCX extraction failed:', error instanceof Error ? error.message : error);
    throw new CvPipelineError('CORRUPT_DOCUMENT');
  }
}

function joinParts(parts: DocxPart[]): string {
  return parts.flatMap((part) => part.paragraphs.map((paragraph) => paragraph.text)).join('\n');
}

/** Collapse whitespace so a paragraph from one pass matches the same paragraph from another. */
function comparable(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Find the line a paragraph became.
 *
 * Matched by content rather than by index, because the two mammoth passes do not
 * emit the same number of blocks — HTML wraps list items and table cells
 * differently from the raw-text walk, and lining them up by position drifts after
 * the first table. Exact match first, then containment, and each line is claimed
 * once so a CV that repeats a paragraph does not put every copy's link on the
 * first occurrence.
 */
function matchLine(target: string, lines: string[], claimed: Set<number>): number | undefined {
  const needle = comparable(target);
  if (!needle) return undefined;
  let fallback: number | undefined;
  for (const [index, line] of lines.entries()) {
    if (claimed.has(index)) continue;
    const candidate = comparable(line);
    if (candidate === needle) {
      claimed.add(index);
      return index;
    }
    if (fallback === undefined && (candidate.includes(needle) || needle.includes(candidate))) {
      fallback = index;
    }
  }
  if (fallback !== undefined) claimed.add(fallback);
  return fallback;
}

/** `<a href="…">label</a>` as mammoth writes it. */
const ANCHOR = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
/** The tags mammoth closes at the end of a block of text. */
const BLOCK_END = /<\/(?:p|li|h[1-6]|td|th|tr|table|blockquote)>/gi;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#160': ' ',
};

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (match, entity: string) => HTML_ENTITIES[entity.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hyperlink targets from the document body, placed on the line they appeared on.
 *
 * A failure here degrades to "no links" rather than failing the import: the text
 * is the CV, and losing an enrichment must not cost a user their experience and
 * education. mammoth's HTML is scanned block by block rather than parsed into a
 * DOM because the input is mammoth's own tightly-constrained output — a handful
 * of tags, one attribute on the anchors — and not arbitrary web HTML.
 */
async function readBodyHyperlinks(bytes: Buffer, lines: string[]): Promise<ExtractedLink[]> {
  try {
    const mammoth = await import('mammoth');
    const { value: html } = await mammoth.convertToHtml({ buffer: bytes });
    if (!html) return [];

    const links: ExtractedLink[] = [];
    const claimed = new Set<number>();
    for (const block of html.split(BLOCK_END)) {
      const anchors = [...block.matchAll(ANCHOR)];
      if (anchors.length === 0) continue;
      const blockText = htmlToText(block);
      // Internal bookmarks (`href="#…"`) are navigation inside the document, not
      // addresses, so they never become links.
      const external = anchors.filter((anchor) => !anchor[1].startsWith('#'));
      if (external.length === 0) continue;
      const line = matchLine(blockText, lines, claimed);
      for (const anchor of external) {
        const url = normaliseUrl(anchor[1]);
        if (!url) continue;
        const visibleText = htmlToText(anchor[2]);
        links.push({
          url,
          ...(visibleText ? { visibleText } : {}),
          ...(line !== undefined ? { line } : {}),
          ...(blockText ? { surroundingText: blockText } : {}),
        });
      }
    }
    return links;
  } catch (error) {
    console.warn(
      '[cv-extraction] DOCX hyperlink targets unavailable:',
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Place field-code links onto the lines their paragraphs became.
 *
 * Separate from the part links because these come from ordinary body paragraphs
 * that mammoth DID produce text for — only the address was missing, because a
 * field-code link has no relationship id for mammoth's anchor handling to follow.
 */
function locateFieldLinks(
  fieldLinks: { url: string; visibleText?: string; paragraphText: string }[],
  lines: string[]
): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const claimed = new Set<number>();
  for (const field of fieldLinks) {
    const url = normaliseUrl(field.url);
    if (!url) continue;
    const line = matchLine(field.paragraphText, lines, claimed);
    links.push({
      url,
      ...(field.visibleText ? { visibleText: field.visibleText } : {}),
      ...(line !== undefined ? { line } : {}),
      ...(field.paragraphText ? { surroundingText: field.paragraphText } : {}),
    });
  }
  return links;
}

/** Place header/footer/text-box links onto the lines their paragraphs became. */
function locatePartLinks(parts: DocxPart[], lines: string[]): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const claimed = new Set<number>();
  for (const part of parts) {
    for (const paragraph of part.paragraphs) {
      if (paragraph.links.length === 0) continue;
      const line = matchLine(paragraph.text, lines, claimed);
      for (const link of paragraph.links) {
        const url = normaliseUrl(link.url);
        if (!url) continue;
        links.push({
          url,
          ...(link.visibleText ? { visibleText: link.visibleText } : {}),
          ...(line !== undefined ? { line } : {}),
          ...(paragraph.text ? { surroundingText: paragraph.text } : {}),
        });
      }
    }
  }
  return links;
}
