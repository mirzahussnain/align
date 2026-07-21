import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { analysis: { findUnique: vi.fn() } },
}));
vi.mock('@/shared/schemas/analysis-result', () => ({
  parseStoredAnalysisResult: vi.fn(),
}));

import { GET } from '@/app/api/analyses/[id]/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';

const v2JobMatch = {
  schemaVersion: 2,
  requirements: [
    {
      id: 'requirement-001',
      text: 'SQL',
      importance: 'mandatory',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'met',
      evidence: [{ source: 'cv', text: 'Five years of SQL' }],
      confidence: 0.95,
      deduction: { points: 0, reason: 'Evidenced', rubric: 'met' },
    },
  ],
  domainFit: {
    roleDomain: 'Data engineering',
    candidateDomain: 'Data engineering',
    status: 'aligned',
    overlapAreas: ['SQL'],
    detail: 'Aligned',
    confidence: 0.9,
    deduction: { points: 0, reason: 'Aligned' },
  },
  matchScore: 100,
  matchFeedback: 'Strong fit',
  experienceGap: '',
  tailoredRewrites: [],
  cv_build_spec: {
    recommended_template: 'sharp_minimal',
    template_rationale: '',
    section_order: ['Experience'],
    lead_project: '',
    summary_angle: '',
    skills_to_surface: ['SQL'],
    skills_to_deprioritise: [],
    bullets_to_rewrite: [],
    visa_note_required: false,
    cover_letter_angle: '',
  },
} as const;

function request() {
  return new Request('http://test/api/analyses/an-7');
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'an-7',
    userId: 'u1',
    mode: 'job_match',
    overallScore: 100,
    rawResult: {},
    jobMatchData: v2JobMatch,
    sourceFileName: 'cv.pdf',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(prisma.analysis.findUnique).mockResolvedValue(storedRow() as never);
  vi.mocked(parseStoredAnalysisResult).mockReturnValue({
    result: { mode: 'job_match', rawText: 'CV text' } as never,
    legacy: false,
  });
});

describe('GET /api/analyses/[id]', () => {
  it('reopens canonical v2 data and stamps the analysis id', async () => {
    const res = await GET(request(), { params: Promise.resolve({ id: 'an-7' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.analysisId).toBe('an-7');
    expect(body.result.jobMatchData.schemaVersion).toBe(2);
    expect(body.result.jobMatchData.matchScore).toBe(100);
  });

  it('ignores a nested rawResult job-match copy', async () => {
    vi.mocked(parseStoredAnalysisResult).mockReturnValue({
      result: { mode: 'job_match', rawText: 'CV text', jobMatchData: { matchScore: 3 } } as never,
      legacy: false,
    });

    const res = await GET(request(), { params: Promise.resolve({ id: 'an-7' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.jobMatchData.matchScore).toBe(100);
  });

  it('returns an explicit integrity error for versionless canonical data', async () => {
    const versionless: { schemaVersion?: number } & Record<string, unknown> = { ...v2JobMatch };
    delete versionless.schemaVersion;
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(
      storedRow({ jobMatchData: versionless }) as never
    );

    const res = await GET(request(), { params: Promise.resolve({ id: 'an-7' }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('schemaVersion 2');
  });

  it('rejects nested-only job-match data instead of using it', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(
      storedRow({ jobMatchData: null }) as never
    );
    vi.mocked(parseStoredAnalysisResult).mockReturnValue({
      result: { mode: 'job_match', rawText: 'CV text', jobMatchData: v2JobMatch } as never,
      legacy: false,
    });

    const res = await GET(request(), { params: Promise.resolve({ id: 'an-7' }) });

    expect(res.status).toBe(409);
  });

  it('keeps ATS-only analyses valid with a null canonical job match', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(
      storedRow({ mode: 'ats', jobMatchData: null, overallScore: 75 }) as never
    );
    vi.mocked(parseStoredAnalysisResult).mockReturnValue({
      result: { mode: 'ats', rawText: 'CV text' } as never,
      legacy: false,
    });

    const res = await GET(request(), { params: Promise.resolve({ id: 'an-7' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.jobMatchData).toBeUndefined();
  });
});
