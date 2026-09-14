/**
 * Deterministic completeness assessment for a vacancy description.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE. Completeness was previously decided in two
 * unrelated places that disagreed: `classifyDescriptionAvailability` (ingestion,
 * persisted onto `JobSnapshot.descriptionAvailability`) tested only
 * `/\.\.\.$/`, while `assessDescription` (Phase 6, read-time) applied a much
 * richer rule set. The persisted value is what the card badge, the Description
 * tab and match preparation all read, so the weaker rule won everywhere the user
 * could see it — and because Adzuna and Reed both DECLARE `PARTIAL` semantics
 * while the old expression only demoted `SNIPPET`/`UNKNOWN`, virtually every
 * aggregator vacancy was persisted as FULL. That is the "nearly every job has a
 * full description" symptom.
 *
 * There is now one classifier. Ingestion and Phase 6 both call it, so a badge, a
 * tab and a match-preparation gate cannot disagree about the same text.
 *
 * THE BIAS IS DELIBERATE. Over-claiming completeness produces a confident
 * analysis of half an advert, which is the failure that actually costs a user
 * something. Under-claiming produces a paste prompt. So:
 *
 *   - a provider whose contract says PARTIAL or SNIPPET can never yield FULL;
 *   - any strong truncation signal forces PARTIAL;
 *   - an unestablished contract (UNKNOWN) is PARTIAL;
 *   - FULL requires a declared-full contract AND no truncation signal AND
 *     enough substance to be a real advert.
 *
 * Nothing here is a heuristic about writing quality. An ordinary sentence ending
 * in a full stop is not truncation, and is never treated as one.
 */

import { htmlToReadableText } from '@/shared/services/job-description-html';
import { getProviderCapabilities } from '@/shared/services/job-providers/capabilities';
import type { JobDescriptionAvailability, JobProvider } from '@/shared/types/job';

/** Contract version. Embedded in cache keys so old classifications are retired. */
export const DESCRIPTION_ASSESSMENT_VERSION = 'v2';

export type TruncationSignal =
  | 'TERMINAL_ELLIPSIS'
  | 'READ_MORE_MARKER'
  | 'MID_SENTENCE_CUTOFF'
  | 'TEASER_LENGTH'
  | 'PROVIDER_CONTRACT_PARTIAL';

export interface DescriptionCompleteness {
  availability: JobDescriptionAvailability;
  /** Plain readable text, entity- and HTML-normalised. Empty when unusable. */
  text: string;
  /** Whether there is enough readable text to be worth showing at all. */
  hasReadableText: boolean;
  signals: TruncationSignal[];
  reasons: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Below this many characters a body is a teaser, not an advert.
 *
 * Chosen from the shape of the data rather than taste: Jooble snippets and
 * Adzuna search bodies cluster at 150–250 characters, while the shortest
 * genuinely complete Greenhouse/Lever adverts observed in this repository's
 * fixtures run to several hundred. 400 sits clearly above the first group and
 * below the second. It only ever DEMOTES — no length alone promotes to FULL.
 */
const TEASER_MAX_CHARS = 400;

/**
 * Markers that a provider truncated the body and is pointing elsewhere.
 *
 * Anchored near the END of the text, because a complete advert may legitimately
 * contain the phrase "read more about our benefits" in its middle. A cut-off
 * teaser puts the marker last.
 */
const READ_MORE_PATTERNS: readonly RegExp[] = [
  /\bread\s+more\b/i,
  /\bview\s+(?:the\s+)?full\s+job\s+description\b/i,
  /\bsee\s+(?:the\s+)?full\s+(?:job\s+)?description\b/i,
  /\bclick\s+to\s+apply\s+for\s+full\s+details\b/i,
  /\bcontinue\s+reading\b/i,
  /\bfull\s+details\s+on\s+(?:the\s+)?(?:employer|company|original)\b/i,
  /\bapply\s+(?:now\s+)?(?:on|at)\s+the\s+(?:employer|company)(?:'s)?\s+site\s+for\s+(?:the\s+)?full\b/i,
];

/** How much of the tail counts as "near the end" for a read-more marker. */
const TAIL_CHARS = 160;

/**
 * Normalise every way a trailing ellipsis can reach us.
 *
 * Providers emit `...`, the U+2026 character, and both HTML entity spellings.
 * `htmlToReadableText` already decodes entities, but this runs on raw text too
 * (a provider that sends plain text with a literal `&hellip;`), so both forms
 * are handled here and the result is compared AFTER decoding — the brief's
 * "inspect HTML before and after sanitation".
 */
function normaliseEllipsis(value: string): string {
  return value
    .replace(/&hellip;/gi, '…')
    .replace(/&#8230;/g, '…')
    .replace(/&#x2026;/gi, '…');
}

const collapse = (value: string) => value.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/**
 * Convert whatever the provider gave us into the text a human would read.
 *
 * Returns both the raw-normalised and the sanitised form, because a truncation
 * marker can be destroyed by sanitation (`<p>Loading&hellip;</p>` survives, but
 * `…<a href>read more</a>` loses its anchor) and can equally only appear after
 * it (an entity-encoded ellipsis). Both are inspected.
 */
export function readableDescriptionText(input: string | null | undefined): {
  raw: string;
  text: string;
} {
  const raw = normaliseEllipsis(input ?? '');
  const looksLikeHtml = /<[a-z!/][^>]*>/i.test(raw);
  const text = collapse(normaliseEllipsis(looksLikeHtml ? htmlToReadableText(raw) : raw));
  return { raw: collapse(raw), text };
}

/** A trailing ellipsis, optionally followed by a short read-more tail. */
function hasTerminalEllipsis(value: string): boolean {
  return /(?:…|\.\.\.)\s*(?:\[?\s*(?:read\s+more|more|continue(?:\s+reading)?)\s*\]?)?\s*$/i.test(value);
}

/**
 * Text that stops mid-sentence.
 *
 * Requires the last non-empty line to end on a word character, comma, semicolon
 * or colon — i.e. no terminator at all. A bullet list whose final item has no
 * full stop is extremely common in complete adverts, so a line that begins with
 * a bullet marker is exempt: it is a list item, not an interrupted sentence.
 */
function hasMidSentenceCutoff(value: string): boolean {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return false;
  if (/^[-*•]/.test(last)) return false;
  // A short trailing fragment (a heading, "Benefits:") is not a cut-off sentence.
  if (last.length < 25) return false;
  return /[\p{L}\p{N},;]$/u.test(last);
}

function hasReadMoreMarker(value: string): boolean {
  const tail = value.slice(-TAIL_CHARS);
  return READ_MORE_PATTERNS.some((pattern) => pattern.test(tail));
}

/**
 * Classify one description.
 *
 * `provider` supplies the contract ceiling; `description` supplies the evidence.
 * Neither alone is sufficient, which is exactly the defect being fixed.
 */
export function assessDescriptionCompleteness(input: {
  provider?: JobProvider;
  description: string | null | undefined;
  /** Set when the text came from the user, which bypasses the provider ceiling. */
  userSupplied?: boolean;
}): DescriptionCompleteness {
  const { raw, text } = readableDescriptionText(input.description);
  const signals: TruncationSignal[] = [];
  const reasons: string[] = [];

  if (!text) {
    return {
      availability: 'EXTERNAL_ONLY',
      text: '',
      hasReadableText: false,
      signals: [],
      reasons: ['No description text was supplied, so the full advert exists only on the source site.'],
      confidence: 'HIGH',
    };
  }

  // Inspected on both the pre-sanitation and post-sanitation forms.
  if (hasTerminalEllipsis(text) || hasTerminalEllipsis(raw)) {
    signals.push('TERMINAL_ELLIPSIS');
    reasons.push('The description ends with an ellipsis, which marks truncated provider text.');
  }
  if (hasReadMoreMarker(text) || hasReadMoreMarker(raw)) {
    signals.push('READ_MORE_MARKER');
    reasons.push('The description ends with a "read more" style marker pointing at the full advert.');
  }
  if (hasMidSentenceCutoff(text)) {
    signals.push('MID_SENTENCE_CUTOFF');
    reasons.push('The description stops mid-sentence with no terminating punctuation.');
  }
  if (text.length < TEASER_MAX_CHARS) {
    signals.push('TEASER_LENGTH');
    reasons.push('The description is too short to be a complete advert.');
  }

  const semantics = input.userSupplied
    ? 'FULL'
    : input.provider
      ? getProviderCapabilities(input.provider).descriptionSemantics
      : 'UNKNOWN';

  if (!input.userSupplied && semantics !== 'FULL') {
    signals.push('PROVIDER_CONTRACT_PARTIAL');
    reasons.push(
      semantics === 'UNKNOWN'
        ? 'This source has no established full-description contract, so completeness cannot be claimed.'
        : 'The source contract declares this field as a snippet or partial description.',
    );
  }

  if (signals.length) {
    return {
      availability: 'PARTIAL',
      text,
      // A teaser is still readable and still worth showing; a bare marker is not.
      hasReadableText: text.replace(/[^\p{L}\p{N}]/gu, '').length >= 40,
      signals,
      reasons,
      confidence: 'HIGH',
    };
  }

  reasons.push('The source declares full advert text and no truncation signal was found.');
  return { availability: 'FULL', text, hasReadableText: true, signals: [], reasons, confidence: 'HIGH' };
}

/** Persisted availability for an ingested provider record. */
export function classifyDescriptionAvailability(
  provider: JobProvider,
  description: string,
): JobDescriptionAvailability {
  return assessDescriptionCompleteness({ provider, description }).availability;
}
