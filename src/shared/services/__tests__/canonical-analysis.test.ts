import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { jobMatch: { findFirst: vi.fn() } },
}));
vi.mock('@/shared/schemas/analysis-result', () => ({
  parseStoredAnalysisResult: vi.fn(),
}));
vi.mock('@/shared/schemas/ai-output', () => ({
  parseStoredJobMatchData: vi.fn(),
}));

import { loadCanonicalAnalysis } from '../canonical-analysis';
import { prisma } from '@/shared/lib/prisma';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';

const ledger = { schemaVersion: 2, requirements: [{ id: 'r1', text: 'SQL', status: 'not_met' }] };
const storedResult = { rawText: 'CV body', categories: [], recommendations: [], keywords: { present: [], missing: [] }, jobMatchData: ledger };
const row = () => ({
  id: 'match-1',
  userId: 'u1',
  resultJson: storedResult,
  cvRevisionId: 'cv-1',
  jobRevisionId: 'job-1',
  profileSnapshotId: 'profile-snapshot-1',
  cvRevision: { extractedText: 'Exact CV body' },
  jobRevision: { description: 'Exact vacancy description' },
  profileSnapshot: { sourceProfileId: 'profile-1' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseStoredAnalysisResult).mockReturnValue({ result: storedResult, legacy: false } as never);
  vi.mocked(parseStoredJobMatchData).mockReturnValue(ledger as never);
});

describe('loadCanonicalAnalysis', () => {
  it('returns the exact three immutable inputs for an owned Job Match', async () => {
    vi.mocked(prisma.jobMatch.findFirst).mockResolvedValue(row() as never);
    const result = await loadCanonicalAnalysis({ userId: 'u1', analysisId: 'match-1', requireJobMatch: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.cvText).toBe('Exact CV body');
    expect(result.analysis.jobDescription).toBe('Exact vacancy description');
    expect(result.analysis.cvRevisionId).toBe('cv-1');
    expect(result.analysis.jobRevisionId).toBe('job-1');
    expect(result.analysis.profileSnapshotId).toBe('profile-snapshot-1');
    expect(result.analysis.jobMatchData).toEqual(ledger);
  });

  it('fails closed when ownership lookup finds no row', async () => {
    vi.mocked(prisma.jobMatch.findFirst).mockResolvedValue(null);
    await expect(loadCanonicalAnalysis({ userId: 'u1', analysisId: 'other' })).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it('rejects an invalid stored result', async () => {
    vi.mocked(prisma.jobMatch.findFirst).mockResolvedValue(row() as never);
    vi.mocked(parseStoredAnalysisResult).mockReturnValue(null);
    await expect(loadCanonicalAnalysis({ userId: 'u1', analysisId: 'match-1' })).resolves.toEqual({ ok: false, error: 'invalid_result' });
  });

  it('rejects an invalid requirement ledger', async () => {
    vi.mocked(prisma.jobMatch.findFirst).mockResolvedValue(row() as never);
    vi.mocked(parseStoredJobMatchData).mockReturnValue(null);
    await expect(loadCanonicalAnalysis({ userId: 'u1', analysisId: 'match-1' })).resolves.toEqual({ ok: false, error: 'invalid_job_match' });
  });
});
