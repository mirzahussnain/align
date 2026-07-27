/**
 * Text normalisation shared by every extractor.
 *
 * Two extractors that read the same CV must produce comparable text, otherwise
 * the same document parsed from PDF and from DOCX yields different candidates,
 * different section detection and different excerpts. This module is the single
 * place that decides what "the text of a CV" looks like.
 *
 * The character classes below are built from code points rather than written as
 * literals on purpose: U+2028 and U+2029 are line terminators to a JavaScript
 * parser, so pasting them into a regex literal ends the line mid-expression, and
 * the rest are invisible in an editor and impossible to review or diff.
 */

/** A character class built from code points, so no invisible or
 *  line-terminating character ever appears literally in this source. */
function charClass(...codePoints: number[]): string {
  return `[${String.fromCharCode(...codePoints)}]`;
}

/** U+2028 line separator, U+2029 paragraph separator. */
const UNICODE_LINE_BREAKS = new RegExp(charClass(0x2028, 0x2029), 'g');
/** Soft hyphen, zero-width space / non-joiner / joiner, BOM. */
const INVISIBLE_CHARS = new RegExp(charClass(0xAD, 0x200B, 0x200C, 0x200D, 0xFEFF), 'g');
/** Non-breaking, narrow no-break and figure spaces. */
const EXOTIC_SPACES = new RegExp(charClass(0xA0, 0x202F, 0x2007), 'g');

/** The shortest extraction we will treat as a readable CV. */
export const MIN_EXTRACTED_TEXT_LENGTH = 50;

/**
 * Collapse a raw extractor result into normalised plain text.
 *
 * - Unicode line separators and CRLF become `\n`, so line logic is uniform.
 * - Soft hyphens and zero-width characters are dropped: PDF extraction sprinkles
 *   them through justified text, where they turn "man-agement" into a word no
 *   keyword pass will ever match.
 * - Non-breaking spaces become ordinary spaces, for the same reason.
 * - Runs of blank lines collapse to one and trailing spaces go, so an excerpt
 *   taken from this text reads the way the CV reads.
 *
 * Deliberately NOT done: lowercasing, punctuation stripping, or de-hyphenating
 * across line breaks. Those are scoring concerns, and doing them here would make
 * the stored text a lossy record of a document the user still owns.
 */
export function normaliseExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(UNICODE_LINE_BREAKS, '\n')
    .replace(INVISIBLE_CHARS, '')
    .replace(EXOTIC_SPACES, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Is there enough text here to treat the document as readable? */
export function hasUsableText(text: string): boolean {
  return text.trim().length >= MIN_EXTRACTED_TEXT_LENGTH;
}

/**
 * A short, verbatim quote from the source text for provenance.
 *
 * Verbatim is the point: an excerpt is the durable evidence for a confirmed
 * profile record once the original file has expired, so it is never paraphrased,
 * re-cased or re-wrapped. It is only bounded in length and cut at a word
 * boundary where one is close enough, so a review card can show it without a
 * wall of text.
 */
export function sourceExcerpt(text: string, maxLength = 240): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  const cut = collapsed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trimEnd()}…`;
}
