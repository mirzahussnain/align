import { describe, expect, it } from 'vitest';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';

const storedAtsResult = {
  overallScore: 75,
  categories: [],
  keywords: { present: [], missing: [], categoryBreakdown: [] },
  sectionOrder: { currentOrder: [], recommendedOrder: [], isOptimal: true, suggestions: [] },
  formatting: { issues: [], estimatedReadTime: '1 min' },
  compliance: [],
  recommendations: [],
  rawText: 'CV text',
  pageCount: 1,
  scoringVersion: 2,
};

describe('stored rawResult contract', () => {
  it('keeps ATS-only stored results valid', () => {
    const parsed = parseStoredAnalysisResult(storedAtsResult);

    expect(parsed?.result.rawText).toBe('CV text');
    expect(parsed?.result.jobMatchData).toBeUndefined();
  });

  it('strips a nested jobMatchData copy instead of exposing it', () => {
    const parsed = parseStoredAnalysisResult({
      ...storedAtsResult,
      jobMatchData: { schemaVersion: 2, matchScore: 1 },
    });

    expect(parsed?.result.jobMatchData).toBeUndefined();
  });
});
