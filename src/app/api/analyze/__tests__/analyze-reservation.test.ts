import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stage 2: the analyze route's reservation lifecycle. Deterministic rule-based
// ATS is never metered; the AI enhancement layer reserves before the provider,
// commits once on success, releases on failure, degrades honestly on exhaustion,
// and recovers a committed analysis without rerunning the model. The ledger is
// mocked so this drives the route's control flow only.
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
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
      findUnique: vi.fn(),
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
vi.mock('@/shared/services/capability-reservation', () => ({
  reserveCapability: vi.fn(async () => ({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } })),
  commitCapability: vi.fn(async () => ({ status: 'committed', reservation: { resultRef: 'an-99' } })),
  releaseCapability: vi.fn(async () => ({ status: 'released' })),
  markOperation: vi.fn(async () => {}),
  reservationFingerprint: vi.fn(() => 'fingerprint'),
  hashContent: vi.fn(() => 'hash'),
  countActiveUsage: vi.fn(async () => 0),
  consumeCapability: vi.fn(async () => true),
}));
vi.mock('@/shared/utils/pdf-parser', () => ({
  extractTextFromPDF: vi.fn(async () => ({ text: 'A'.repeat(400), pageCount: 1 })),
}));
vi.mock('@/shared/services/classifier', () => ({
  classifyCV: vi.fn(async () => ({ occupation: 'software_engineer', sector: 'technology', confidence: 0.9, source: 'ai', applicationWorkflow: 'standard', reasonCodes: [] })),
  scoreOccupationEvidence: vi.fn(() => ({ occupation: 'generic', confidence: 0.2, reasonCodes: [] })),
  classifyAsGeneric: vi.fn(() => ({ occupation: 'generic', sector: 'general', confidence: 1, source: 'fallback', applicationWorkflow: 'cv_led', reasonCodes: [] })),
}));
vi.mock('@/shared/occupations/registry', () => ({
  getOccupationProfile: vi.fn(() => ({})),
  isKnownOccupation: vi.fn(() => true),
}));
vi.mock('@/shared/constants/sector-keywords', () => ({
  getIndustryDictionary: vi.fn(() => ({ label: 'technology' })),
}));
vi.mock('@/shared/utils/scoring-engine', () => ({
  analyzeCV: vi.fn(() => ({
    overallScore: 50,
    categories: [
      { id: 'professionalSummary', score: 5, maxScore: 10, status: 'ok' },
      { id: 'impactStatements', score: 5, maxScore: 10, status: 'ok' },
      { id: 'evidenceCoverage', score: 5, maxScore: 10, status: 'ok' },
    ],
    keywords: { present: [], missing: [] },
    recommendations: [],
    rawText: 'A'.repeat(400),
    pageCount: 1,
  })),
  computeOverallScore: vi.fn(() => 55),
  evidenceCoverageScore: vi.fn(() => 5),
}));
vi.mock('@/shared/services/ai-analyser', () => ({
  getJobMatchFeedback: vi.fn(),
  getSemanticCVFeedback: vi.fn(),
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  resolveProfileId: vi.fn(async () => null),
  loadProfileTarget: vi.fn(async () => null),
}));
// Only committed-recovery reads stored blobs, so these default to null; the
// recovery test overrides them. JobMatchDataV2Schema stays real for the live
// job-match integrity gate.
vi.mock('@/shared/schemas/analysis-result', () => ({
  parseStoredAnalysisResult: vi.fn(() => null),
}));
vi.mock('@/shared/schemas/ai-output', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/schemas/ai-output')>();
  return { ...actual, parseStoredJobMatchData: vi.fn(() => null) };
});

import { POST } from '@/app/api/analyze/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { getJobMatchFeedback, getSemanticCVFeedback } from '@/shared/services/ai-analyser';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
} from '@/shared/services/capability-reservation';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

const semanticFeedback = {
  summaryScore: 8,
  summaryFeedback: 'Good summary',
  impactScore: 7,
  impactFeedback: 'Solid impact',
  rewrites: [],
  alignmentNote: '',
  additionalKeywords: [],
  detectedRole: 'Software Engineer',
  riskFlags: [],
  clichés: [],
};

const v2JobMatchData = {
  schemaVersion: 2,
  jobTitle: 'Engineer',
  jobCompany: 'Co',
  requirements: [
    { id: 'requirement-001', text: 'SQL', importance: 'mandatory', category: 'skill', sourceSection: 'job_description', evidenceRequired: true, status: 'met', evidence: [{ source: 'cv', text: 'SQL' }], confidence: 0.95, deduction: { points: 0, reason: 'Evidenced', rubric: 'met' } },
  ],
  domainFit: { roleDomain: 'Engineering', candidateDomain: 'Engineering', status: 'aligned', overlapAreas: ['SQL'], detail: 'Aligned', confidence: 0.9, deduction: { points: 0, reason: 'Aligned' } },
  matchScore: 100,
  matchFeedback: 'Strong fit',
  experienceGap: '',
  tailoredRewrites: [],
  cv_build_spec: { recommended_template: 'sharp_minimal', template_rationale: '', section_order: ['Experience'], lead_project: '', summary_angle: '', skills_to_surface: ['SQL'], skills_to_deprioritise: [], bullets_to_rewrite: [], visa_note_required: false, cover_letter_angle: '' },
};

function analyzeRequest(mode: 'ats' | 'job_match', jobDescription = '', operationId?: string) {
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'cv.pdf', { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);
  if (jobDescription) form.append('jobDescription', jobDescription);
  return new Request('http://test/api/analyze', {
    method: 'POST',
    headers: operationId ? { 'x-operation-id': operationId } : {},
    body: form,
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(reserveCapability).mockResolvedValue({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } } as never);
  vi.mocked(commitCapability).mockResolvedValue({ status: 'committed', reservation: { resultRef: 'an-99' } } as never);
  vi.mocked(getSemanticCVFeedback).mockResolvedValue(semanticFeedback as never);
  vi.mocked(getJobMatchFeedback).mockResolvedValue(v2JobMatchData as never);
});

describe('POST /api/analyze — reservation lifecycle', () => {
  it('AI-enhanced ATS reserves before the provider and commits exactly once', async () => {
    const res = await POST(analyzeRequest('ats'));

    expect(res.status).toBe(200);
    expect(reserveCapability).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reserveCapability).mock.calls[0][0]).toMatchObject({ capability: 'ai_enhanced_ats_analysis' });
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitCapability).mock.calls[0][0]).toMatchObject({ resultRef: 'an-99' });
    expect(releaseCapability).not.toHaveBeenCalled();
    expect(vi.mocked(reserveCapability).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getSemanticCVFeedback).mock.invocationCallOrder[0]
    );
  });

  it('quota-degraded ATS holds no unit and serves the rule-based score', async () => {
    vi.mocked(reserveCapability).mockResolvedValue({
      status: 'exhausted',
      decision: { capability: 'ai_enhanced_ats_analysis', plan: 'FREE', mode: 'quota', allowed: false, reason: 'quota_exhausted', limit: 5, used: 5, remaining: 0, period: 'month' },
    } as never);

    const res = await POST(analyzeRequest('ats'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiSkipped).toBe('quota');
    expect(getSemanticCVFeedback).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
    expect(releaseCapability).not.toHaveBeenCalled();
  });

  it('job match reserves its own independent capability', async () => {
    const res = await POST(analyzeRequest('job_match', 'Senior Data Engineer with streaming experience required.'));

    expect(res.status).toBe(200);
    expect(vi.mocked(reserveCapability).mock.calls[0][0]).toMatchObject({ capability: 'job_match_analysis' });
    expect(commitCapability).toHaveBeenCalledTimes(1);
  });

  it('releases the reservation and returns 502 on a job-match provider failure', async () => {
    vi.mocked(getJobMatchFeedback).mockResolvedValue(null as never);

    const res = await POST(analyzeRequest('job_match', 'Senior Data Engineer with streaming experience required.'));

    expect(res.status).toBe(502);
    expect(releaseCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(prisma.analysis.create).not.toHaveBeenCalled();
  });

  it('releases the reservation on a job-match integrity failure', async () => {
    const versionless = { ...v2JobMatchData } as Record<string, unknown>;
    delete versionless.schemaVersion;
    vi.mocked(getJobMatchFeedback).mockResolvedValue(versionless as never);

    const res = await POST(analyzeRequest('job_match', 'Senior Data Engineer with streaming experience required.'));

    expect(res.status).toBe(502);
    expect(releaseCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(prisma.analysis.create).not.toHaveBeenCalled();
  });

  it('degrades an ATS provider failure to the rule-based score and releases the unit', async () => {
    vi.mocked(getSemanticCVFeedback).mockResolvedValue(null as never);

    const res = await POST(analyzeRequest('ats'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiSkipped).toBe('error');
    expect(releaseCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('recovers a committed analysis without rerunning the model or persisting again', async () => {
    vi.mocked(reserveCapability).mockResolvedValue({ status: 'recovered', reservation: { resultRef: 'an-77', operationStatus: 'SUCCEEDED' } } as never);
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue({
      id: 'an-77',
      userId: 'u1',
      mode: 'job_match',
      rawResult: {},
      jobMatchData: v2JobMatchData,
    } as never);
    vi.mocked(parseStoredAnalysisResult).mockReturnValueOnce({ result: { rawText: 'x'.repeat(120), categories: [], recommendations: [], keywords: { present: [], missing: [] } }, legacy: false } as never);
    vi.mocked(parseStoredJobMatchData).mockReturnValueOnce(v2JobMatchData as never);

    const res = await POST(analyzeRequest('job_match', 'Senior Data Engineer with streaming experience required.'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysisId).toBe('an-77');
    expect(getJobMatchFeedback).not.toHaveBeenCalled();
    expect(prisma.analysis.create).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('rejects a reused operation id with conflicting content as 409', async () => {
    vi.mocked(reserveCapability).mockResolvedValue({ status: 'conflict', reservation: { operationStatus: 'PENDING' } } as never);

    const res = await POST(analyzeRequest('ats', '', 'op-1'));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('OPERATION_CONFLICT');
    expect(getSemanticCVFeedback).not.toHaveBeenCalled();
  });
});
