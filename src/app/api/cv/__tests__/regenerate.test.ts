import { describe, it, expect, beforeEach, vi } from 'vitest';

// The route pulls in auth, prisma, the AI rewriter, storage and the usage meter.
// Each is mocked so the test exercises the route's own control flow — quota
// gating, usage accounting, and provenance — without a DB, a model, or a bucket.
vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(async () => null),
  rewriteLimiter: {},
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ subscriptionTier: null })) },
    analysis: { findUnique: vi.fn() },
  },
}));
vi.mock('@/shared/lib/entitlements', () => ({
  entitlementsFor: vi.fn(() => ({ monthlyLimits: { cvGenerations: 10 } })),
}));
vi.mock('@/shared/services/usage-meter', () => ({
  checkQuota: vi.fn(),
  recordUsage: vi.fn(async () => {}),
}));
vi.mock('@/shared/services/cv-rewriter', () => ({
  rewriteCV: vi.fn(),
}));
vi.mock('@/shared/services/profile-reconciler', () => ({
  resolveApprovedProfileEvidence: vi.fn(() => []),
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  loadOwnedProfileData: vi.fn(async () => ({ profileId: 'profile-123' })),
  resolveProfileId: vi.fn(async () => 'profile-123'),
}));
vi.mock('@/shared/services/cv-generation', () => ({
  renderCvDocx: vi.fn(async () => Buffer.from('docx-bytes')),
  persistAndArchiveCv: vi.fn(async () => 'cv-1'),
  DOCX_CONTENT_TYPE: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}));
vi.mock('@/shared/schemas/analysis-result', () => ({
  parseStoredAnalysisResult: vi.fn(() => ({
    result: {
      rawText: 'x'.repeat(120),
      categories: [],
      recommendations: [],
      keywords: { present: [{ keyword: 'react' }] },
      aiClichés: [],
    },
    legacy: false,
  })),
}));

import { POST } from '@/app/api/cv/regenerate/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { checkQuota, recordUsage } from '@/shared/services/usage-meter';
import { rewriteCV } from '@/shared/services/cv-rewriter';
import { persistAndArchiveCv } from '@/shared/services/cv-generation';
import { resolveApprovedProfileEvidence } from '@/shared/services/profile-reconciler';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { ProfileEvidenceValidationError } from '@/shared/types/profile-reasoning';

const USER = { id: 'u1' };

const cvBuildSpec = {
  recommended_template: 'technical_precision',
  template_rationale: '',
  section_order: ['Experience'],
  lead_project: '',
  summary_angle: '',
  skills_to_surface: [],
  skills_to_deprioritise: [],
  bullets_to_rewrite: [],
  visa_note_required: false,
  cover_letter_angle: '',
};

const v2JobMatchData = {
  schemaVersion: 2,
  requirements: [
    {
      id: 'requirement-001',
      text: 'Kafka experience',
      importance: 'mandatory',
      category: 'tool',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.95,
      deduction: {
        points: 8,
        reason: 'Not evidenced',
        rubric: 'mandatory_supporting_missing',
      },
    },
  ],
  domainFit: {
    roleDomain: 'Data engineering',
    candidateDomain: 'Data engineering',
    status: 'aligned',
    overlapAreas: ['SQL'],
    detail: 'Aligned discipline',
    confidence: 0.9,
    deduction: { points: 0, reason: 'Aligned' },
  },
  matchScore: 92,
  matchFeedback: 'Good fit with one gap',
  experienceGap: 'Kafka',
  tailoredRewrites: [],
  cv_build_spec: cvBuildSpec,
};

function regenRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/cv/regenerate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A stored job-match analysis with everything a rebuild needs. */
function storedJobMatchAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER.id,
    mode: 'job_match',
    rawResult: {},
    jobDescription: 'Senior Data Engineer with strong streaming experience required.',
    jobMatchData: v2JobMatchData,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: USER } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ subscriptionTier: null } as never);
  vi.mocked(prisma.analysis.findUnique).mockResolvedValue(storedJobMatchAnalysis() as never);
  vi.mocked(checkQuota).mockResolvedValue({ allowed: true, used: 0, limit: 10, remaining: 10 });
  vi.mocked(rewriteCV).mockResolvedValue({ fullName: 'A. Candidate', tagline: 'Data Engineer' } as never);
  vi.mocked(resolveApprovedProfileEvidence).mockReturnValue([]);
});

describe('POST /api/cv/regenerate', () => {
  it('rebuilds a stored job-match analysis into a DOCX and consumes one generation after success', async () => {
    const res = await POST(regenRequest({ analysisId: 'an-1', templateId: 'architect' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('wordprocessingml');

    // Exactly one generation counted, and only after the rewrite came back.
    expect(rewriteCV).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(USER.id, 'cvGenerations');
    expect(
      vi.mocked(rewriteCV).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(recordUsage).mock.invocationCallOrder[0]);
  });

  it('persists the generated CV linked to its analysis and career track', async () => {
    await POST(regenRequest({ analysisId: 'an-1' }));

    expect(persistAndArchiveCv).toHaveBeenCalledTimes(1);
    const args = vi.mocked(persistAndArchiveCv).mock.calls[0][0];
    expect(args.analysisId).toBe('an-1');
    expect(args.profileId).toBe('profile-123');
  });

  it('re-resolves approved requirement/evidence pairs and persists their provenance', async () => {
    const approval = {
      requirementId: 'requirement-001',
      evidenceRef: { type: 'certification' as const, id: 'cert-123' },
      rationale: 'The named credential supports this requirement.',
    };
    const overlay = {
      requirementId: approval.requirementId,
      evidenceRef: approval.evidenceRef,
      requirementText: 'Kafka experience',
      sourceProfileId: 'profile-123',
      resolvedEvidenceText: 'Kafka Fundamentals — Confluent — 2025',
      evidenceLocation: 'Kafka Fundamentals — Certification or licence',
      userApproved: true as const,
      rationale: approval.rationale,
    };
    vi.mocked(resolveApprovedProfileEvidence).mockReturnValue([overlay]);

    const before = structuredClone(v2JobMatchData);
    const response = await POST(
      regenRequest({
        analysisId: 'an-1',
        profileId: 'profile-123',
        approvedProfileEvidence: [approval],
      })
    );

    expect(response.status).toBe(200);
    expect(loadOwnedProfileData).toHaveBeenCalledWith(USER.id, 'profile-123');
    expect(resolveApprovedProfileEvidence).toHaveBeenCalledWith(
      { profileId: 'profile-123' },
      [approval],
      v2JobMatchData.requirements
    );
    expect(JSON.parse(vi.mocked(rewriteCV).mock.calls[0][2] as string).approvedProfileEvidence)
      .toEqual([overlay]);
    expect(vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance).toEqual({
      approvedProfileEvidence: [overlay],
    });
    expect(v2JobMatchData).toEqual(before);
  });

  it('rejects a stale or invalid approved evidence reference before rewriting', async () => {
    vi.mocked(resolveApprovedProfileEvidence).mockImplementation(() => {
      throw new ProfileEvidenceValidationError('Unknown requirement id: requirement-999.');
    });

    const response = await POST(
      regenRequest({
        analysisId: 'an-1',
        profileId: 'profile-123',
        approvedProfileEvidence: [
          {
            requirementId: 'requirement-999',
            evidenceRef: { type: 'skill', id: 'deleted-skill' },
          },
        ],
      })
    );

    expect(response.status).toBe(400);
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it('adapts a canonical v2 ledger to the unchanged legacy rewrite input', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(
      storedJobMatchAnalysis({ jobMatchData: v2JobMatchData }) as never
    );

    const res = await POST(regenRequest({ analysisId: 'an-1' }));
    const rewriteInput = JSON.parse(vi.mocked(rewriteCV).mock.calls[0][2] as string);

    expect(res.status).toBe(200);
    expect(rewriteInput.mandatorySkills.missing).toEqual(['Kafka experience']);
    expect(rewriteInput).not.toHaveProperty('matchScore');
    expect(rewriteInput.cv_build_spec).toEqual(cvBuildSpec);
  });

  it('rejects versionless canonical data and never falls back to a nested rawResult copy', async () => {
    const versionless: { schemaVersion?: number } & Record<string, unknown> = { ...v2JobMatchData };
    delete versionless.schemaVersion;
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(
      storedJobMatchAnalysis({
        jobMatchData: versionless,
        rawResult: { jobMatchData: v2JobMatchData },
      }) as never
    );

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(409);
    expect(rewriteCV).not.toHaveBeenCalled();
  });

  it('refuses when the CV-generation quota is spent, without calling the model', async () => {
    vi.mocked(checkQuota).mockResolvedValue({ allowed: false, used: 10, limit: 10, remaining: 0 });

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(429);
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('does not consume a generation when the model returns nothing', async () => {
    vi.mocked(rewriteCV).mockResolvedValue(null as never);

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(500);
    expect(rewriteCV).toHaveBeenCalledTimes(1);
    expect(recordUsage).not.toHaveBeenCalled();
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it('rejects an analysis that belongs to another user', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(
      storedJobMatchAnalysis({ userId: 'someone-else' }) as never
    );

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(404);
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
