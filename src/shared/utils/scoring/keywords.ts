import { UK_TECH_KEYWORDS, KEYWORD_CATEGORY_LABELS, type KeywordCategory } from '@/shared/constants/ats-keywords';
import type { KeywordAnalysis, KeywordMatch, CategoryKeywordBreakdown } from '@/shared/types/cv';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function analyzeKeywords(text: string): KeywordAnalysis {
  const present: KeywordMatch[] = [];
  const missing: KeywordMatch[] = [];
  const categoryBreakdown: CategoryKeywordBreakdown[] = [];

  for (const [category, keywords] of Object.entries(UK_TECH_KEYWORDS)) {
    let categoryPresent = 0;

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      const regex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, 'gi');
      const matches = text.match(regex);

      if (matches && matches.length > 0) {
        present.push({
          keyword,
          category: KEYWORD_CATEGORY_LABELS[category as KeywordCategory],
          count: matches.length,
        });
        categoryPresent++;
      } else {
        missing.push({
          keyword,
          category: KEYWORD_CATEGORY_LABELS[category as KeywordCategory],
          count: 0,
        });
      }
    }

    categoryBreakdown.push({
      category,
      label: KEYWORD_CATEGORY_LABELS[category as KeywordCategory],
      present: categoryPresent,
      total: keywords.length,
      percentage: Math.round((categoryPresent / keywords.length) * 100),
    });
  }

  return { present, missing, categoryBreakdown };
}
