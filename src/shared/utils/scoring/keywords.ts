import {
  getIndustryDictionary,
  type CareerTrack,
  type Industry,
  type KeywordTerm,
} from '@/shared/constants/sector-keywords';
import type { KeywordAnalysis, KeywordMatch, CategoryKeywordBreakdown } from '@/shared/types/cv';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WORD_CHAR = /\w/;

/**
 * `\b` only asserts a boundary next to an ASCII word character, so a term that
 * starts or ends in punctuation — `C#`, `C++`, `.NET`, `Lexis+` — can never match
 * when wrapped in bare `\b`s. Fall back to a lookaround on those ends, which just
 * forbids an adjacent word character and leaves punctuation free to match.
 */
export function buildKeywordRegex(term: string): RegExp {
  const lead = WORD_CHAR.test(term[0]) ? '\\b' : '(?<!\\w)';
  const tail = WORD_CHAR.test(term[term.length - 1]) ? '\\b' : '(?!\\w)';
  return new RegExp(`${lead}${escapeRegex(term)}${tail}`, 'gi');
}

/** Total occurrences of a term's canonical form plus any of its aliases. */
function countOccurrences(term: KeywordTerm, text: string): number {
  const forms = [term.canonical, ...(term.aliases ?? [])];

  return forms.reduce((total, form) => {
    const matches = text.match(buildKeywordRegex(form));
    return total + (matches?.length ?? 0);
  }, 0);
}

export interface AnalyzeKeywordsOptions {
  /** Defaults to `tech` to preserve the original single-dictionary behaviour. */
  industry?: Industry;
  /**
   * When set, terms tagged for a different career tier are skipped entirely —
   * a paralegal shouldn't be marked down for lacking an SRA Practising Certificate.
   */
  track?: CareerTrack;
}

const EMPTY_ANALYSIS: KeywordAnalysis = { present: [], missing: [], categoryBreakdown: [] };

export function analyzeKeywords(text: string, options: AnalyzeKeywordsOptions = {}): KeywordAnalysis {
  const dictionary = getIndustryDictionary(options.industry ?? 'tech');

  // No dictionary for this industry yet. Returning an empty analysis keeps the
  // CV from being scored against some other industry's keywords; callers decide
  // how to weight a missing keyword signal.
  if (!dictionary) return EMPTY_ANALYSIS;

  const present: KeywordMatch[] = [];
  const missing: KeywordMatch[] = [];
  const categoryBreakdown: CategoryKeywordBreakdown[] = [];

  for (const [categoryKey, category] of Object.entries(dictionary.categories)) {
    const applicable = category.terms.filter(
      (term) => !term.track || !options.track || term.track === options.track
    );

    let categoryPresent = 0;

    for (const term of applicable) {
      const count = countOccurrences(term, text);
      const match: KeywordMatch = { keyword: term.canonical, category: category.label, count };

      if (count > 0) {
        present.push(match);
        categoryPresent++;
      } else {
        missing.push(match);
      }
    }

    categoryBreakdown.push({
      category: categoryKey,
      label: category.label,
      present: categoryPresent,
      total: applicable.length,
      percentage: applicable.length === 0 ? 0 : Math.round((categoryPresent / applicable.length) * 100),
    });
  }

  return { present, missing, categoryBreakdown };
}
