// Validation for stored CVAnalysisResult blobs (Analysis.rawResult). Stored
// JSON is a trust boundary like AI output: rows written by older code have a
// different shape, and a cast tells the compiler a lie the runtime pays for.
//
// The schema validates only the spine every reader depends on — categories,
// keywords, rawText — and passes everything else through. `scoringVersion`
// discriminates: null/absent means a pre-rebuild (v1) row, which readers may
// render with graceful fallbacks but must never crash on.

import { z } from 'zod';
import type { CVAnalysisResult } from '@/shared/types/cv';

const categoryScore = z.looseObject({
  id: z.string(),
  label: z.string().catch(''),
  score: z.coerce.number(),
  maxScore: z.coerce.number().catch(10),
  status: z.enum(['excellent', 'good', 'needs-improvement', 'critical']).catch('good'),
  details: z.string().catch(''),
});

const keywordMatch = z.looseObject({
  keyword: z.string(),
  category: z.string().catch(''),
  count: z.coerce.number().catch(0),
});

export const StoredAnalysisResultSchema = z.looseObject({
  overallScore: z.coerce.number(),
  categories: z.array(categoryScore),
  keywords: z.looseObject({
    present: z.array(keywordMatch).catch([]),
    missing: z.array(keywordMatch).catch([]),
    categoryBreakdown: z.array(z.looseObject({})).catch([]),
  }),
  sectionOrder: z.looseObject({
    currentOrder: z.array(z.string()).catch([]),
    recommendedOrder: z.array(z.string()).catch([]),
    isOptimal: z.boolean().catch(true),
    suggestions: z.array(z.string()).catch([]),
  }),
  formatting: z.looseObject({
    issues: z.array(z.looseObject({ type: z.string(), message: z.string(), fix: z.string().catch('') })).catch([]),
    estimatedReadTime: z.string().catch(''),
  }),
  compliance: z
    .array(z.looseObject({ rule: z.string(), passed: z.boolean(), description: z.string().catch('') }))
    .catch([]),
  recommendations: z
    .array(
      z.looseObject({
        priority: z.enum(['critical', 'high', 'medium', 'low']).catch('medium'),
        title: z.string(),
        description: z.string().catch(''),
        timeEstimate: z.string().catch(''),
        kind: z.string().optional(),
      })
    )
    .catch([]),
  rawText: z.string(),
  pageCount: z.coerce.number().catch(1),
  scoringVersion: z.number().optional(),
});

export interface ParsedStoredAnalysis {
  result: CVAnalysisResult;
  /** True when the row predates the occupation-aware rebuild (scoring v1). */
  legacy: boolean;
}

/**
 * Parse a stored rawResult blob. Returns null when the blob is unusable —
 * callers surface a "re-analyse to get a current report" state instead of
 * crashing the dashboard on a missing field.
 */
export function parseStoredAnalysisResult(raw: unknown): ParsedStoredAnalysis | null {
  const parsed = StoredAnalysisResultSchema.safeParse(raw);
  if (!parsed.success) return null;

  return {
    // The loose schema keeps unknown fields (classification, credentials,
    // jobMatchData, ai* extras) intact on the object it returns.
    result: parsed.data as unknown as CVAnalysisResult,
    legacy: parsed.data.scoringVersion === undefined,
  };
}
