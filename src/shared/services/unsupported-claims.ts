/**
 * Deterministic unsupported-claim detection.
 *
 * A single, shared set of rules for spotting the specific dangerous claims this
 * phase exists to prevent — date-range expansion, invented tenure, unearned
 * seniority, tools/metrics/commercial context absent from verified evidence.
 * Every detector is pure and deterministic; none calls a model. They reuse the
 * `cv-evidence.ts` corpus primitives so "is this supported?" means exactly the
 * same thing here as in build-spec grounding and the truthfulness validator.
 *
 * These flags are consumed by reconciliation (to refuse importing an
 * unsupported claim) and by the CV truthfulness validator. A flag is never a
 * silent fix — it is a signal that a value has no trusted backing.
 */
import type { EvidenceCorpus } from './cv-evidence';
import { extractImpactMetrics, metricSupported, normalizeText } from './cv-evidence';
import {
  durationSupportsYears,
  type DerivedFact,
  type ExperienceDuration,
} from './derived-facts';

export type UnsupportedClaimKind =
  | 'date_expansion'
  | 'experience_duration'
  | 'seniority'
  | 'tool'
  | 'metric'
  | 'commercial_context';

export interface UnsupportedClaimFlag {
  kind: UnsupportedClaimKind;
  /** The exact offending fragment, for diagnostics. Never shown to end users. */
  claim: string;
  reason: string;
}

// ── Date-range expansion ─────────────────────────────────────────────────────

const YEAR = '\\d{4}';
// "2023 - 2025", "2023–2025", "Jan 2023 to 2025" — two year endpoints joined by a dash/"to".
const RENDERED_RANGE = new RegExp(
  `(?:[A-Za-z]{3,9}\\s+)?(${YEAR})\\s*(?:[-–—]|to)\\s*(?:[A-Za-z]{3,9}\\s+)?(${YEAR})`
);

function yearOf(value: string | undefined | null): string | null {
  const match = /(\d{4})/.exec((value ?? '').trim());
  return match ? match[1] : null;
}

/**
 * Flag a rendered date range that asserts more than the canonical record
 * supports. The canonical example: a record with `endDate = 2025` and no start
 * date, rendered as "2023–2025", invents a start bound. A range is unsupported
 * when the canonical record has no start at all, or when either endpoint year
 * disagrees with the canonical start/end year.
 */
export function detectDateExpansion(
  canonical: { startDate?: string | null; endDate?: string | null },
  rendered: string
): UnsupportedClaimFlag | null {
  const match = RENDERED_RANGE.exec(rendered);
  if (!match) return null;
  const [, renderedStart, renderedEnd] = match;

  const canonicalStart = yearOf(canonical.startDate);
  const canonicalEnd = yearOf(canonical.endDate);

  if (!canonicalStart) {
    return {
      kind: 'date_expansion',
      claim: match[0].trim(),
      reason: `Rendered range "${match[0].trim()}" introduces a start date the record does not have.`,
    };
  }
  if (renderedStart !== canonicalStart || (canonicalEnd && renderedEnd !== canonicalEnd)) {
    return {
      kind: 'date_expansion',
      claim: match[0].trim(),
      reason: `Rendered range "${match[0].trim()}" does not match canonical dates ${canonicalStart}–${canonicalEnd ?? '?'}.`,
    };
  }
  return null;
}

// ── Experience-duration claims ───────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// "2+ years", "3 years' experience", "over five years", "more than 4 yrs".
const DURATION_CLAIM =
  /(?:over|more than|at least)?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*\+?\s*(?:years?|yrs?)\b/gi;

/** Parse minimum-year duration claims out of free text. */
export function detectDurationClaims(text: string): { claim: string; minYears: number }[] {
  const found: { claim: string; minYears: number }[] = [];
  for (const match of text.matchAll(DURATION_CLAIM)) {
    const token = match[1].toLowerCase();
    const minYears = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
    if (Number.isFinite(minYears) && minYears > 0) {
      found.push({ claim: match[0].trim(), minYears });
    }
  }
  return found;
}

/**
 * Flag any tenure claim in `text` not backed by a deterministic duration fact.
 * With an `insufficient` fact, every numeric tenure claim is unsupported — the
 * exact guard against "2+ yrs" appearing over project-only or undated history.
 */
export function flagUnsupportedDurationClaims(
  text: string,
  durationFact: DerivedFact<ExperienceDuration | null>
): UnsupportedClaimFlag[] {
  return detectDurationClaims(text)
    .filter((claim) => !durationSupportsYears(durationFact, claim.minYears))
    .map((claim) => ({
      kind: 'experience_duration' as const,
      claim: claim.claim,
      reason:
        durationFact.confidence === 'insufficient'
          ? `Tenure claim "${claim.claim}" has no deterministic supporting duration.`
          : `Tenure claim "${claim.claim}" exceeds the ${durationFact.value?.months ?? 0} supported months.`,
    }));
}

// ── Vocabulary claims (seniority, tools, commercial context) ─────────────────

/** Seniority markers that must be earned by verified evidence, not asserted. */
export const SENIORITY_TERMS = ['senior', 'lead', 'principal', 'head of', 'manager', 'director'];

/** Commercial-context phrases that imply responsibilities requiring evidence. */
export const COMMERCIAL_CONTEXT_TERMS = [
  'client-facing',
  'campaign management',
  'account management',
  'commercial experience',
  'stakeholder ownership',
  'client facing',
];

/** True when the normalised phrase appears as a whole token run in the corpus. */
function corpusHasPhrase(corpus: EvidenceCorpus, phrase: string): boolean {
  const needle = normalizeText(phrase);
  return needle.length > 0 && corpus.norm.includes(` ${needle} `);
}

function detectVocabulary(
  text: string,
  corpus: EvidenceCorpus,
  terms: readonly string[],
  kind: UnsupportedClaimKind,
  describe: (term: string) => string
): UnsupportedClaimFlag[] {
  const haystack = ` ${normalizeText(text)} `;
  const flags: UnsupportedClaimFlag[] = [];
  for (const term of terms) {
    const needle = normalizeText(term);
    if (haystack.includes(` ${needle} `) && !corpusHasPhrase(corpus, term)) {
      flags.push({ kind, claim: term, reason: describe(term) });
    }
  }
  return flags;
}

export function detectUnsupportedSeniority(
  text: string,
  corpus: EvidenceCorpus
): UnsupportedClaimFlag[] {
  return detectVocabulary(
    text,
    corpus,
    SENIORITY_TERMS,
    'seniority',
    (term) => `Seniority marker "${term}" is not supported by verified evidence.`
  );
}

export function detectUnsupportedCommercialContext(
  text: string,
  corpus: EvidenceCorpus
): UnsupportedClaimFlag[] {
  return detectVocabulary(
    text,
    corpus,
    COMMERCIAL_CONTEXT_TERMS,
    'commercial_context',
    (term) => `Commercial-context claim "${term}" is not supported by verified evidence.`
  );
}

/**
 * Flag tools that appear in generated/imported text but are absent from verified
 * evidence. The tool vocabulary is supplied by the caller (e.g. tools named in
 * the JD) — this detector does not guess what counts as a tool.
 */
export function detectUnsupportedTools(
  text: string,
  corpus: EvidenceCorpus,
  toolVocabulary: readonly string[]
): UnsupportedClaimFlag[] {
  return detectVocabulary(
    text,
    corpus,
    toolVocabulary,
    'tool',
    (term) => `Tool "${term}" is claimed but absent from verified evidence.`
  );
}

export function detectUnsupportedMetrics(
  text: string,
  corpus: EvidenceCorpus
): UnsupportedClaimFlag[] {
  return extractImpactMetrics(text)
    .filter((metric) => !metricSupported(corpus, metric))
    .map((metric) => ({
      kind: 'metric' as const,
      claim: metric,
      reason: `Metric "${metric}" is not present in verified evidence.`,
    }));
}
