import { beforeEach, describe, expect, it, vi } from 'vitest';

// The canonical loader is the single trusted, UNPROJECTED read for internal
// workflows. These tests prove it verifies ownership, validates the stored
// blobs, returns the full ledger, and maps failures precisely — and never
// applies plan projection.
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { analysis: { findUnique: vi.fn() } },
}));
vi.mock('@/shared/schemas/analysis-result', () => ({
  parseStoredAnalysisResult: vi.fn(),
}));
vi.mock('@/shared/schemas/ai-output', () => ({
  parseStoredJobMatchData: vi.fn(),
}));

import { loadCanonicalAnalysis } from '../canonical-analysis';
import { prisma } from '@/shared/lib/prisma';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

const jobMatch = { schemaVersion: 2, requirements: [{ id: 'r1', text: 'SQL', status: 'not_met' }], matchScore: 40 };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'an-1',
    userId: 'u1',
    mode: 'job_match',
    profileId: 'p1',
    rawResult: { some: 'blob' },
    jobDescription: 'JD text long enough',
    jobMatchData: jobMatch,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseStoredAnalysisResult).mockReturnValue({ result: { rawText: 'CV body', categories: [], recommendations: [], keywords: { present: [], missing: [] } }, legacy: false } as never);
  vi.mocked(parseStoredJobMatchData).mockReturnValue(jobMatch as never);
});

describe('loadCanonicalAnalysis', () => {
  it('returns the complete canonical analysis for the owner, including the full ledger', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(row() as never);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'an-1', requireJobMatch: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analysis.jobMatchData).toEqual(jobMatch);
      expect(result.analysis.cvText).toBe('CV body');
      expect(result.analysis.jobDescription).toBe('JD text long enough');
      // The full requirement ledger is present — nothing projected/stripped.
      expect(result.analysis.jobMatchData?.requirements).toHaveLength(1);
    }
  });

  it('treats an unowned row as not_found (never leaks another user\'s result)', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(row({ userId: 'someone_else' }) as never);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'an-1' });
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('returns not_found for a missing row', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(null as never);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'missing' });
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('rejects a non-job-match analysis when a job match is required', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(row({ mode: 'ats' }) as never);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'an-1', requireJobMatch: true });
    expect(result).toEqual({ ok: false, error: 'wrong_mode' });
  });

  it('rejects an unparseable stored result', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(row() as never);
    vi.mocked(parseStoredAnalysisResult).mockReturnValue(null);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'an-1' });
    expect(result).toEqual({ ok: false, error: 'invalid_result' });
  });

  it('rejects a job match whose ledger fails schemaVersion-2 validation', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(row() as never);
    vi.mocked(parseStoredJobMatchData).mockReturnValue(null);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'an-1', requireJobMatch: true });
    expect(result).toEqual({ ok: false, error: 'invalid_job_match' });
  });

  it('allows an ATS analysis with no ledger when a job match is not required', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(row({ mode: 'ats', jobMatchData: null }) as never);
    vi.mocked(parseStoredJobMatchData).mockReturnValue(null);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'an-1' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.analysis.jobMatchData).toBeNull();
  });
});
