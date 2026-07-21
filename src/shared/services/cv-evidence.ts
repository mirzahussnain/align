/**
 * Shared, deterministic evidence primitives.
 *
 * Analysis-time build-spec grounding, generation-time build-spec grounding, and
 * post-generation truthfulness validation all reason about "is this claim
 * supported by verified evidence?". They MUST use identical rules for impact
 * metrics, numbers, currency, counts, and containment — otherwise a claim could
 * pass one gate and fail another. This module is the single source of those
 * rules; nothing here trusts AI-authored build-spec text.
 */

/** Words too generic to distinguish an invented title from a real one. */
const TITLE_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'of',
  'a',
  'an',
  'at',
  'in',
  'to',
]);

/** A normalised view of the verified evidence a generation is allowed to draw on. */
export interface EvidenceCorpus {
  /** Lowercased, punctuation-collapsed text, space-padded at both ends. */
  norm: string;
  /** Every digit run, commas/spaces removed, so "10,000" and "10000" match. */
  digits: string;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function digitsOnly(value: string): string {
  return value.toLowerCase().replace(/[,\s]/g, '');
}

/** Assemble a corpus from raw evidence strings. Callers choose which sources qualify. */
export function buildEvidenceCorpus(sources: string[]): EvidenceCorpus {
  const raw = sources.filter(Boolean).join(' \n ');
  return { norm: ` ${normalizeText(raw)} `, digits: digitsOnly(raw) };
}

/**
 * The verified evidence sources a generation may draw on, in one place so
 * generation-time grounding and post-generation validation never disagree on
 * WHAT counts as evidence. Build-spec text is intentionally absent.
 */
export function collectGenerationEvidenceSources(parts: {
  cvText: string;
  approvedProfileEvidence: { resolvedEvidenceText: string; evidenceLocation: string }[];
  userContext?: { label: string; text: string }[];
  requirementEvidence?: string[];
}): string[] {
  const sources: string[] = [parts.cvText];
  for (const item of parts.approvedProfileEvidence) {
    sources.push(item.resolvedEvidenceText, item.evidenceLocation);
  }
  for (const note of parts.userContext ?? []) {
    sources.push(note.label, note.text);
  }
  sources.push(...(parts.requirementEvidence ?? []));
  return sources;
}

/**
 * Impact-bearing numbers only: currency, %, multipliers, magnitude words, and
 * counts ≥ 1000 (comma-grouped or not). Plain small integers and standalone
 * 4-digit years are ignored so the checks target fabricated impact, not
 * incidental numbers or dates.
 */
export function extractImpactMetrics(text: string): string[] {
  const found: string[] = [];
  const pattern =
    /(£|\$|€)?\s?(\d[\d,]*(?:\.\d+)?)\s?(%|\+|(?:x|k|m|bn|billion|million|thousand)\b)?/gi;
  for (const match of text.matchAll(pattern)) {
    const [, currency, numeric, unit] = match;
    if (!numeric) continue;
    const value = Number(numeric.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;

    const hasUnit = Boolean(currency || unit);
    const isYear = !hasUnit && /^\d{4}$/.test(numeric) && value >= 1900 && value <= 2099;
    if ((hasUnit || value >= 1000) && !isYear) {
      found.push(match[0].trim());
    }
  }
  return found;
}

/** The bare digits of a metric, for containment comparison. */
export function metricDigits(metric: string): string {
  return digitsOnly(metric).replace(/[^0-9]/g, '');
}

/** A metric is supported when its digits already appear in verified evidence. */
export function metricSupported(corpus: EvidenceCorpus, metric: string): boolean {
  const digits = metricDigits(metric);
  return digits.length === 0 || corpus.digits.includes(digits);
}

/** Whole normalised phrase must appear — for proper nouns (employers, certs). */
export function phraseSupportedExact(corpus: EvidenceCorpus, field: string): boolean {
  const needle = normalizeText(field);
  if (needle.length === 0) return true;
  return corpus.norm.includes(needle);
}

/**
 * Exact phrase, OR every significant word present — for descriptive fields
 * (titles, project names, degrees) that a rewrite may legitimately rephrase.
 */
export function tokensSupportedLoose(corpus: EvidenceCorpus, field: string): boolean {
  if (phraseSupportedExact(corpus, field)) return true;
  const tokens = normalizeText(field)
    .split(' ')
    .filter((token) => token.length >= 3 && !TITLE_STOPWORDS.has(token));
  if (tokens.length === 0) return true;
  return tokens.every(
    (token) => corpus.norm.includes(` ${token} `) || corpus.norm.includes(`${token} `)
  );
}
