import { describe, it, expect, beforeEach, vi } from 'vitest';

// The analyze route orchestrates PDF extraction, classification, scoring and the
// AI layer before persisting. All of that is mocked; the point under test is the
// new contract only — that the persisted analysis id is handed back on the
// response so the fresh results screen can rebuild a CV from it.
vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(async () => null),
  analysisLimiter: {},
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ subscriptionTier: null })) },
    analysis: {
      create: vi.fn(async () => ({ id: 'an-99' })),
      update: vi.fn(async () => ({})),
    },
    profile: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('@/shared/lib/entitlements', () => ({
  entitlementsFor: vi.fn(() => ({ monthlyLimits: { aiAnalyses: 10 } })),
  sourceExpiryFrom: vi.fn(() => new Date()),
}));
vi.mock('@/shared/lib/storage', () => ({
  storage: { upload: vi.fn(async () => {}) },
  keyFor: { upload: vi.fn(() => 'uploads/u1/an-99/cv.pdf') },
}));
vi.mock('@/shared/services/storage-quota', () => ({
  pruneAnalyses: vi.fn(async () => {}),
  sweepExpiredSources: vi.fn(async () => {}),
}));
vi.mock('@/shared/services/usage-meter', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, used: 0, limit: 10, remaining: 10 })),
  recordUsage: vi.fn(async () => {}),
}));
vi.mock('@/shared/utils/pdf-parser', () => ({
  extractTextFromPDF: vi.fn(async () => ({ text: 'A'.repeat(400), pageCount: 1 })),
}));
vi.mock('@/shared/services/classifier', () => ({
  classifyCV: vi.fn(async () => ({
    occupation: 'software_engineer',
    sector: 'technology',
    confidence: 0.9,
    source: 'ai',
    applicationWorkflow: 'standard',
  })),
}));
vi.mock('@/shared/occupations/registry', () => ({
  getOccupationProfile: vi.fn(() => ({})),
}));
vi.mock('@/shared/constants/sector-keywords', () => ({
  getIndustryDictionary: vi.fn(() => ({ label: 'technology' })),
}));
vi.mock('@/shared/utils/scoring-engine', () => ({
  analyzeCV: vi.fn(() => ({
    overallScore: 50,
    categories: [],
    keywords: { present: [], missing: [] },
    recommendations: [],
    rawText: 'A'.repeat(400),
    pageCount: 1,
  })),
  computeOverallScore: vi.fn(() => 50),
  evidenceCoverageScore: vi.fn(() => 5),
}));
vi.mock('@/shared/services/ai-analyser', () => ({
  getJobMatchFeedback: vi.fn(async () => ({ matchScore: 80, jobTitle: 'Engineer', jobCompany: 'Co' })),
  getSemanticCVFeedback: vi.fn(async () => null),
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  resolveProfileId: vi.fn(async () => null),
}));

import { POST } from '@/app/api/analyze/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { getJobMatchFeedback } from '@/shared/services/ai-analyser';
import { NextRequest } from 'next/server';

function analyzeRequest(mode: 'ats' | 'job_match', jobDescription = '') {
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'cv.pdf', { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);
  if (jobDescription) form.append('jobDescription', jobDescription);
  return new NextRequest('http://test/api/analyze', { method: 'POST', body: form });
}

const v2JobMatchData = {
  schemaVersion: 2,
  jobTitle: 'Engineer',
  jobCompany: 'Co',
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
    roleDomain: 'Engineering',
    candidateDomain: 'Engineering',
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(getJobMatchFeedback).mockResolvedValue(v2JobMatchData as never);
});

describe('POST /api/analyze', () => {
  it('returns the persisted analysis id so a fresh job-match result can be rebuilt into a CV', async () => {
    const res = await POST(
      analyzeRequest('job_match', 'Senior Data Engineer with streaming experience required.')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysisId).toBe('an-99');
    expect(body.jobMatchData?.matchScore).toBe(100);
    expect(body.jobMatchData?.schemaVersion).toBe(2);

    const persisted = vi.mocked(prisma.analysis.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(persisted.jobMatchData).toMatchObject({ schemaVersion: 2, matchScore: 100 });
    expect(persisted.rawResult).not.toHaveProperty('jobMatchData');
  });

  it('stores ATS-only analyses with no job-match payload', async () => {
    const res = await POST(analyzeRequest('ats'));

    expect(res.status).toBe(200);
    const persisted = vi.mocked(prisma.analysis.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(persisted.mode).toBe('ats');
    expect(persisted.jobMatchData).toBeUndefined();
    expect(persisted.rawResult).not.toHaveProperty('jobMatchData');
  });

  it('does not persist a job match when the provider returns versionless data', async () => {
    const versionless: { schemaVersion?: number } & Record<string, unknown> = { ...v2JobMatchData };
    delete versionless.schemaVersion;
    vi.mocked(getJobMatchFeedback).mockResolvedValue(versionless as never);

    const res = await POST(
      analyzeRequest('job_match', 'Senior Data Engineer with streaming experience required.')
    );

    expect(res.status).toBe(502);
    expect(prisma.analysis.create).not.toHaveBeenCalled();
  });
});
