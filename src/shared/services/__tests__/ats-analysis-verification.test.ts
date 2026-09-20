import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reserveCapability: vi.fn(),
  semantic: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({ prisma: { atsAnalysis: { create: mocks.create, findFirst: vi.fn() } } }));
vi.mock('@/shared/entitlements/server', () => ({ assertCapability: vi.fn(), getUserPlan: vi.fn(async () => 'FREE') }));
vi.mock('../cv-revision', () => ({ resolveCvRevision: vi.fn(async () => ({ id: 'cv1', checksum: 'sum', text: 'CV text', pageCount: 1, filename: 'cv.pdf' })) }));
vi.mock('@/features/dashboard/data/load-profile', () => ({ loadProfileTarget: vi.fn(async () => null) }));
vi.mock('../capability-reservation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capability-reservation')>();
  return {
    ...actual,
    reserveCapability: mocks.reserveCapability,
    commitCapability: vi.fn(),
    releaseCapability: vi.fn(),
    reservationFingerprint: vi.fn(() => 'fingerprint'),
  };
});
vi.mock('../analysis-context', () => ({
  resolveAnalysisContext: vi.fn(async () => ({
    context: { evidenceSource: { type: 'cv_only' } },
    classification: {
      occupation: 'software_developer',
      sector: 'technology',
      confidence: 0.9,
      source: 'cv',
      applicationWorkflow: 'standard',
    },
  })),
}));
vi.mock('@/shared/occupations/registry', () => ({ getOccupationProfile: vi.fn(() => ({})) }));
vi.mock('@/shared/constants/sector-keywords', () => ({ getIndustryDictionary: vi.fn(() => null) }));
vi.mock('@/shared/utils/scoring-engine', () => ({
  analyzeCV: vi.fn(() => ({
    overallScore: 60,
    categories: [],
    keywords: { present: [], missing: [], categoryBreakdown: [] },
    sectionOrder: { currentOrder: [], recommendedOrder: [], isOptimal: true, suggestions: [] },
    formatting: { fontConsistency: true, fontCount: 1, hasImages: false, hasSpecialCharacters: false, pageCount: 1, estimatedReadTime: '1 min', issues: [] },
    compliance: [],
    recommendations: [],
    rawText: 'CV text',
    pageCount: 1,
    aiApplied: false,
  })),
  computeOverallScore: vi.fn(() => 60),
  evidenceCoverageScore: vi.fn(() => 0),
}));
vi.mock('@/shared/constants/scoring-config', () => ({ statusFor: vi.fn(() => 'good') }));
vi.mock('../ai-analyser', () => ({ getSemanticCVFeedbackWithProvenance: mocks.semantic }));

import { EmailVerificationRequiredError } from '../email-verification-guard';
import { runAtsAnalysis } from '../ats-analysis-service';

describe('ATS verification fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveCapability.mockRejectedValue(new EmailVerificationRequiredError());
    mocks.create.mockResolvedValue({ id: 'analysis1' });
  });

  it('persists deterministic ATS without reserving or invoking AI for an unverified user', async () => {
    await expect(runAtsAnalysis({ userId: 'u1', operationId: 'op1' })).resolves.toMatchObject({
      aiApplied: false,
      aiSkipped: 'verification_required',
      analysisId: 'analysis1',
    });
    expect(mocks.semantic).not.toHaveBeenCalled();
  });
});
