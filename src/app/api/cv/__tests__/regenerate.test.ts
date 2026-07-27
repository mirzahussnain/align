import { describe, it, expect, beforeEach, vi } from 'vitest';

// The route pulls in auth, prisma, the AI rewriter, storage and the usage meter.
// Each is mocked so the test exercises the route's own control flow — quota
// gating, usage accounting, truthfulness validation, and provenance — without a
// DB, a model, or a bucket. The ledger projection and the truthfulness validator
// run for real: they are pure and are exactly what we want to exercise here.
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
    profileEvidenceApproval: { findMany: vi.fn() },
    generatedCV: { findUnique: vi.fn() },
  },
}));
vi.mock('@/shared/lib/storage', () => ({
  storage: { download: vi.fn(async () => Buffer.from('archived-docx-bytes')) },
}));
vi.mock('@/shared/lib/entitlements', () => ({
  entitlementsFor: vi.fn(() => ({ monthlyLimits: { cvGenerations: 10 } })),
}));
// The route gates on assertCapability and drives the reservation ledger
// (reserve → commit / release). assertCapability is stubbed to allow by default;
// the real EntitlementRequiredError is kept so an exhausted decision still maps to
// 429. The ledger module is mocked so this route test exercises the route's own
// control flow (canonical ordering, release-on-failure, commit-once); the ledger's
// atomic behaviour is proven in capability-reservation's own suites.
vi.mock('@/shared/entitlements/server', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/entitlements/server')>();
  return {
    ...actual,
    assertCapability: vi.fn(async () => ({ allowed: true, capability: 'cv_regeneration', plan: 'FREE', mode: 'quota' })),
  };
});
vi.mock('@/shared/services/capability-reservation', () => ({
  reserveCapability: vi.fn(async () => ({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } })),
  commitCapability: vi.fn(async () => ({ status: 'committed', reservation: { resultRef: 'cv-1' } })),
  releaseCapability: vi.fn(async () => ({ status: 'released' })),
  markOperation: vi.fn(async () => {}),
  reservationFingerprint: vi.fn(() => 'fingerprint'),
  hashContent: vi.fn(() => 'hash'),
  checkRepairEligibility: vi.fn(async () => ({ status: 'not_committed' })),
  commitRepair: vi.fn(async () => ({ status: 'committed', reservation: { resultRef: 'cv-1' } })),
}));
// The route calls rewriteCVWithProvenance; keep the `rewriteCV` spy the tests use
// by having the provenance wrapper delegate to it and attach coarse provenance.
vi.mock('@/shared/services/cv-rewriter', () => {
  const rewriteCV = vi.fn();
  return {
    rewriteCV,
    rewriteCVWithProvenance: vi.fn(async (input: unknown) => {
      const output = await rewriteCV(input);
      return output
        ? { output, provenance: { provider: 'gemini', model: 'gemini-3.5-flash', attempt: 1, fallbackUsed: false } }
        : null;
    }),
  };
});
vi.mock('@/shared/services/profile-reconciler', () => ({
  resolveApprovedProfileEvidence: vi.fn(() => []),
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  loadOwnedProfileData: vi.fn(async () => ({ profileId: 'profile-123' })),
  resolveProfileId: vi.fn(async () => 'profile-123'),
  // The tailored path now loads the canonical profile for its trusted context.
  // A structurally-complete, experience-free profile keeps the derived duration
  // `insufficient` unless a test says otherwise.
  loadProfileData: vi.fn(async () => ({
    profileId: 'profile-123',
    label: 'Default',
    targetIndustry: '',
    personal: {
      label: 'Default', fullName: 'A Candidate', tagline: '', professionalSummary: '',
      targetOccupation: '', targetRoleTitle: '', targetSeniority: '', targetIndustry: '',
      email: '', phoneDialCode: '', phoneNumber: '', phoneCountry: '', city: '', state: '',
      country: '', website: '', linkedin: '', github: '', visaStatus: '', visaExpiry: '',
    },
    experience: [], projects: [], education: [], skills: [], certifications: [],
    trainings: [], licences: [], professionalRegistrations: [], languages: [],
    volunteering: [], otherEvidence: [],
  })),
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
import { assertCapability } from '@/shared/entitlements/server';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  checkRepairEligibility,
} from '@/shared/services/capability-reservation';
import { APIError } from '@/shared/utils/api-error';
import { rewriteCV } from '@/shared/services/cv-rewriter';
import { persistAndArchiveCv } from '@/shared/services/cv-generation';
import { storage } from '@/shared/lib/storage';
import { commitRepair } from '@/shared/services/capability-reservation';
import { resolveApprovedProfileEvidence } from '@/shared/services/profile-reconciler';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { ProfileEvidenceValidationError } from '@/shared/types/profile-reasoning';
import { TRUTHFULNESS_FAILURE_MESSAGE } from '@/shared/services/cv-rewrite-validation';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import {
  invalidStructuredVariants,
  makeExperience,
  makeStructuredRewriteOutput,
  sourceCvRef,
} from '@/shared/services/__tests__/fixtures/structured-rewrite';

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
  vi.mocked(prisma.profileEvidenceApproval.findMany).mockResolvedValue([] as never);
  vi.mocked(assertCapability).mockResolvedValue({ allowed: true, capability: 'cv_regeneration', plan: 'FREE', mode: 'quota' } as never);
  vi.mocked(reserveCapability).mockResolvedValue({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } } as never);
  vi.mocked(commitCapability).mockResolvedValue({ status: 'committed', reservation: { resultRef: 'cv-1' } } as never);
  vi.mocked(releaseCapability).mockResolvedValue({ status: 'released' } as never);
  vi.mocked(rewriteCV).mockResolvedValue(makeStructuredRewriteOutput());
  vi.mocked(resolveApprovedProfileEvidence).mockReturnValue([]);
});

describe('POST /api/cv/regenerate', () => {
  it('rebuilds a stored job-match analysis into a DOCX and consumes one generation after success', async () => {
    const res = await POST(regenRequest({ analysisId: 'an-1', templateId: 'architect' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('wordprocessingml');

    // Reserved before the provider, committed exactly once after it returned.
    expect(rewriteCV).toHaveBeenCalledTimes(1);
    expect(reserveCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitCapability).mock.calls[0][0]).toMatchObject({
      userId: USER.id,
      capability: 'cv_regeneration',
      resultRef: 'cv-1',
    });
    expect(releaseCapability).not.toHaveBeenCalled();
    // reserve → provider → commit, in that order.
    expect(vi.mocked(reserveCapability).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rewriteCV).mock.invocationCallOrder[0]
    );
    expect(vi.mocked(rewriteCV).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(commitCapability).mock.invocationCallOrder[0]
    );
  });

  it('feeds the rewriter a single ledger-native input object', async () => {
    await POST(regenRequest({ analysisId: 'an-1', templateId: 'architect' }));

    const calls = vi.mocked(rewriteCV).mock.calls[0];
    expect(calls).toHaveLength(1);
    const input = calls[0];
    expect(input.template).toBe('architect');
    expect(input.cvText.length).toBeGreaterThan(0);
    expect(input.rewriteContext.requirements[0].id).toBe('requirement-001');
  });

  it('projects the canonical v2 ledger into a compact context with no scoring fields', async () => {
    const res = await POST(regenRequest({ analysisId: 'an-1' }));
    const input = vi.mocked(rewriteCV).mock.calls[0][0];

    expect(res.status).toBe(200);
    const req = input.rewriteContext.requirements[0];
    expect(req.id).toBe('requirement-001');
    expect(req.status).toBe('not_met');
    expect(req).not.toHaveProperty('deduction');
    expect(req).not.toHaveProperty('confidence');
    expect(input.rewriteContext).not.toHaveProperty('matchScore');
    expect(input.rewriteContext.cvBuildSpec).toEqual(cvBuildSpec);
  });

  it('persists the generated CV linked to its analysis and career track, with full provenance', async () => {
    await POST(regenRequest({ analysisId: 'an-1' }));

    expect(persistAndArchiveCv).toHaveBeenCalledTimes(1);
    const args = vi.mocked(persistAndArchiveCv).mock.calls[0][0];
    expect(args.analysisId).toBe('an-1');
    expect(args.profileId).toBe('profile-123');
    expect(args.provenance).toEqual(
      expect.objectContaining({
        analysisId: 'an-1',
        profileId: 'profile-123',
        requirementSchemaVersion: 2,
        requirementIds: ['requirement-001'],
        userContext: [],
        promptContextVersion: expect.any(Number),
        truthfulnessValidationVersion: expect.any(Number),
        truthfulnessValidationResult: 'passed',
        estimatedPromptTokens: expect.any(Number),
      })
    );
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

    const resolveCall = vi.mocked(resolveApprovedProfileEvidence).mock.calls[0];
    expect(resolveCall[0]).toEqual({ profileId: 'profile-123' });
    expect(resolveCall[1]).toEqual([approval]);
    expect(resolveCall[2][0].id).toBe('requirement-001');

    // The rewriter's input carries the verified overlay, tied to its requirement.
    const input = vi.mocked(rewriteCV).mock.calls[0][0];
    expect(input.approvedProfileEvidence).toEqual([overlay]);
    expect(
      input.rewriteContext.requirements.find((r) => r.id === 'requirement-001')?.approvedProfileEvidence
    ).toEqual(['Kafka Fundamentals — Confluent — 2025']);

    expect(vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance).toEqual(
      expect.objectContaining({ approvedProfileEvidence: [overlay] })
    );

    // The stored ledger is never mutated by generation.
    expect(v2JobMatchData).toEqual(before);
  });

  it('uses the durable approval snapshot after its live skill and project facts have changed', async () => {
    const snapshot = { schemaVersion: 1, evidenceType: 'skill', evidenceId: 'skill-123', displayTitle: 'Original spreadsheet skill — Skills', displaySummary: 'Original spreadsheet skill — advanced: Original outcome', capturedAt: '2026-07-22T00:00:00.000Z', kind: 'skill', id: 'skill-123', name: 'Original spreadsheet skill', skillGroupLabel: 'Tools', taxonomy: { id: 'esco-1', preferredLabel: 'spreadsheet software' }, linkedProjects: [{ id: 'project-123', name: 'Original project', evidenceLines: ['Original evidence'], startDate: '2023', endDate: '2024-12', liveUrl: 'https://example.com/live', repositoryUrl: 'https://github.com/example/repo' }] };
    vi.mocked(prisma.profileEvidenceApproval.findMany).mockResolvedValue([
      { id: 'approval-123', requirementId: 'requirement-001', evidenceType: 'skill', evidenceId: 'skill-123', profileId: 'profile-123', snapshot },
    ] as never);

    const response = await POST(regenRequest({
      analysisId: 'an-1',
      profileId: 'profile-123',
      approvedProfileEvidence: [{ requirementId: 'requirement-001', evidenceRef: { type: 'skill', id: 'skill-123' }, approvalId: 'approval-123' }],
    }));

    expect(response.status).toBe(200);
    expect(loadOwnedProfileData).not.toHaveBeenCalled();
    expect(vi.mocked(rewriteCV).mock.calls[0][0].approvedProfileEvidence[0]).toMatchObject({
      resolvedEvidenceText: snapshot.displaySummary,
      evidenceLocation: snapshot.displayTitle,
      evidenceSnapshot: snapshot,
    });
    expect(vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance).toEqual(
      expect.objectContaining({ approvedProfileEvidence: [expect.objectContaining({ evidenceSnapshot: snapshot })] })
    );
  });
  it('persists user-provided context in provenance, kept separate from evidence', async () => {
    await POST(
      regenRequest({
        analysisId: 'an-1',
        hitlContext: { Kafka: 'I ran a Kafka cluster in a side project.', Blank: '   ' },
      })
    );

    const input = vi.mocked(rewriteCV).mock.calls[0][0];
    expect(input.userContext).toEqual([
      { label: 'Kafka', text: 'I ran a Kafka cluster in a side project.' },
    ]);
    expect(vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance).toEqual(
      expect.objectContaining({
        userContext: [{ label: 'Kafka', text: 'I ran a Kafka cluster in a side project.' }],
      })
    );
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
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('does not consume a generation when the draft fails truthfulness validation', async () => {
    vi.mocked(rewriteCV).mockResolvedValue(
      makeStructuredRewriteOutput({
        experience: [
          makeExperience({ jobTitle: 'Engineer', company: 'Globex Fabrications' }),
        ],
      })
    );

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe(TRUTHFULNESS_FAILURE_MESSAGE);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it('rejects an unsupported-claim draft after a failed correction attempt, without charging', async () => {
    // Passes truthfulness (no new employer/metric) but asserts unearned seniority.
    vi.mocked(rewriteCV).mockResolvedValue(makeStructuredRewriteOutput({
      identity: {
        name: 'A. Candidate',
        professionalTitle: 'Senior Data Engineer',
        contact: {},
        sourceRefs: [sourceCvRef()],
      },
    }));

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(422);
    // One controlled correction attempt was made, then it failed safely.
    expect(rewriteCV).toHaveBeenCalledTimes(2);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it('accepts a draft once a controlled correction attempt returns clean output', async () => {
    vi.mocked(rewriteCV)
      .mockResolvedValueOnce(makeStructuredRewriteOutput({
        identity: {
          name: 'A. Candidate',
          professionalTitle: 'Senior Data Engineer',
          contact: {},
          sourceRefs: [sourceCvRef()],
        },
      }))
      .mockResolvedValueOnce(
        makeStructuredRewriteOutput({
          generationNotes: { unsupportedRequirementsNotAdded: ['requirement-001'] },
        })
      );

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(200);
    expect(rewriteCV).toHaveBeenCalledTimes(2);
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance).toEqual(
      expect.objectContaining({
        correctionAttempts: 1,
        unsupportedClaimValidationResult: 'passed',
        unsupportedRequirementsNotAdded: ['requirement-001'],
      })
    );
  });

  it('records trusted-context and unsupported-claim safety provenance on success', async () => {
    await POST(regenRequest({ analysisId: 'an-1' }));

    const provenance = vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance as Record<string, unknown>;
    expect(provenance).toEqual(
      expect.objectContaining({
        trustedContextVersion: expect.any(Number),
        trustedContextProfileId: 'profile-123',
        unsupportedClaimValidationVersion: expect.any(Number),
        unsupportedClaimValidationResult: 'passed',
        correctionAttempts: 0,
      })
    );
    expect(provenance.derivedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'professional_experience_duration' }),
      ])
    );
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
    // An exhausted quota surfaces as an entitlement error (429) from the gate,
    // before any provider work — the reservation is never even created.
    vi.mocked(assertCapability).mockRejectedValueOnce(
      new APIError('Quota exhausted', 429, { code: 'ENTITLEMENT_REQUIRED', capability: 'cv_regeneration' })
    );

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(429);
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('releases the reservation and returns a retryable provider error when the model returns nothing', async () => {
    vi.mocked(rewriteCV).mockResolvedValue(null as never);

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    // Provider failure after reservation: 502, retryable, uncharged, released.
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'AI_OPERATION_FAILED', reason: 'provider_unavailable', charged: false });
    expect(rewriteCV).toHaveBeenCalledTimes(1);
    expect(reserveCapability).toHaveBeenCalledTimes(1);
    expect(releaseCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it('rejects legacy provider output without charging or persisting', async () => {
    vi.mocked(rewriteCV).mockResolvedValue({
      fullName: 'A. Candidate',
      tagline: 'Data Engineer',
      contact: {},
      professionalSummary: '',
      experience: [],
      projects: [],
      education: [],
      coreSkills: [],
      certifications: [],
    } as never);

    const response = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(response.status).toBe(422);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it.each([
    ['missing provenance', invalidStructuredVariants.missingProvenance()],
    ['unknown source id', invalidStructuredVariants.unknownRequirement()],
    ['unapproved profile evidence', invalidStructuredVariants.unapprovedProfile()],
    ['stale application context', invalidStructuredVariants.staleApplicationContext()],
  ])('rejects structured output with %s without charging', async (_label, output) => {
    vi.mocked(rewriteCV).mockResolvedValue(output as never);

    const response = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(response.status).toBe(422);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it('charges exactly once only after structured and truthfulness validation succeeds', async () => {
    vi.mocked(rewriteCV).mockResolvedValue(makeStructuredRewriteOutput());

    const response = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(response.status).toBe(200);
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(persistAndArchiveCv).toHaveBeenCalledTimes(1);
  });

  it('salvages a repairable provenance defect and still consumes exactly one generation', async () => {
    // A draft whose skills group cites a comma-joined excerpt that is not
    // contiguous in the CV (the observed failure). The mocked CV text is a run of
    // "x"s, so "xx" is genuinely present while "kafka" is not: salvage keeps the
    // grounded skill, drops the unsupported one, and the draft persists.
    vi.mocked(rewriteCV).mockResolvedValue(
      makeStructuredRewriteOutput({
        skills: [
          // Two groups grounded in the (all-"x") CV, so the defect ratio stays low.
          { category: 'Core', text: 'xxx', sourceRefs: [sourceCvRef('xxx')] },
          { category: 'More', text: 'xxxx', sourceRefs: [sourceCvRef('xxxx')] },
          // The repairable defect: a comma-joined excerpt not contiguous in the CV.
          // "xx" is genuinely present; "kafka" is not, so it is dropped.
          { category: 'Data', text: 'xx, kafka', sourceRefs: [sourceCvRef('xx, kafka')] },
        ],
      })
    );

    const response = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(response.status).toBe(200);
    // A repaired success charges exactly once — the same as a first-pass success.
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(persistAndArchiveCv).toHaveBeenCalledTimes(1);
    const provenance = vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance as Record<string, unknown>;
    expect(provenance.generationOutcome).toBe('accepted_after_deterministic_repair');
    expect((provenance.salvageReport as { removedClaims: string[] }).removedClaims).toContain('skills[2]:kafka');
  });

  it('carries the analysis context into generation provenance (traceability only)', async () => {
    vi.mocked(parseStoredAnalysisResult).mockReturnValueOnce({
      result: {
        rawText: 'x'.repeat(120),
        categories: [],
        recommendations: [],
        keywords: { present: [{ keyword: 'react' }] },
        aiClichés: [],
        analysisContext: {
          mode: 'job_match',
          evidenceSource: { type: 'cv_only' },
          targetSource: 'job_description',
          resolvedTargetOccupation: 'software_engineer',
          resolvedTargetRole: 'Senior Data Engineer',
          confidence: 'high',
        },
      },
      legacy: false,
    } as never);

    await POST(regenRequest({ analysisId: 'an-1' }));

    expect(vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance).toEqual(
      expect.objectContaining({
        analysisContext: {
          targetSource: 'job_description',
          resolvedTargetOccupation: 'software_engineer',
          resolvedTargetRole: 'Senior Data Engineer',
          evidenceSource: 'cv_only',
          targetProfileId: null,
        },
      })
    );
  });

  it('records a null analysis context when the stored analysis predates the contract', async () => {
    await POST(regenRequest({ analysisId: 'an-1' }));

    expect(vi.mocked(persistAndArchiveCv).mock.calls[0][0].provenance).toEqual(
      expect.objectContaining({ analysisContext: null })
    );
  });

  it('rejects an analysis that belongs to another user', async () => {
    vi.mocked(prisma.analysis.findUnique).mockResolvedValue(
      storedJobMatchAnalysis({ userId: 'someone-else' }) as never
    );

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(404);
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
  });

  // ── Stage 2: reservation lifecycle ────────────────────────────────────────

  it('reserves before the provider is ever called', async () => {
    await POST(regenRequest({ analysisId: 'an-1' }));
    expect(vi.mocked(reserveCapability).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rewriteCV).mock.invocationCallOrder[0]
    );
  });

  it('fails closed (503, uncharged) and never calls the provider when the ledger read fails', async () => {
    vi.mocked(reserveCapability).mockRejectedValueOnce(new Error('db down'));

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'AI_OPERATION_FAILED', reason: 'reservation_failure', retryable: true, charged: false });
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('returns 429 without provider work when the reservation is exhausted', async () => {
    vi.mocked(reserveCapability).mockResolvedValueOnce({
      status: 'exhausted',
      decision: { capability: 'cv_regeneration', plan: 'FREE', mode: 'quota', allowed: false, reason: 'quota_exhausted', limit: 1, used: 1, remaining: 0, period: 'month' },
    } as never);

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(429);
    expect(rewriteCV).not.toHaveBeenCalled();
  });

  it('rejects a reused operation id with conflicting content as 409', async () => {
    vi.mocked(reserveCapability).mockResolvedValueOnce({
      status: 'conflict',
      reservation: { operationStatus: 'PENDING' },
    } as never);

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('OPERATION_CONFLICT');
    expect(rewriteCV).not.toHaveBeenCalled();
  });

  it('returns 409 OPERATION_IN_PROGRESS for a live duplicate, never rerunning the provider', async () => {
    vi.mocked(reserveCapability).mockResolvedValueOnce({
      status: 'reserved',
      reservation: { operationStatus: 'RUNNING', resultRef: null },
    } as never);

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('OPERATION_IN_PROGRESS');
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('re-streams the stored DOCX for a committed retry without regenerating', async () => {
    vi.mocked(reserveCapability).mockResolvedValueOnce({
      status: 'recovered',
      reservation: { resultRef: 'cv-1', operationStatus: 'SUCCEEDED' },
    } as never);
    vi.mocked(prisma.generatedCV.findUnique).mockResolvedValue({
      userId: USER.id,
      analysisId: 'an-1',
      fileKey: 'users/u1/cv-1/Tailored_CV.docx',
    } as never);

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('wordprocessingml');
    expect(storage.download).toHaveBeenCalledWith('rewrites', 'users/u1/cv-1/Tailored_CV.docx');
    // Recovery reruns nothing and charges nothing further.
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('returns RESULT_UNAVAILABLE (charged) when a committed result row is missing', async () => {
    vi.mocked(reserveCapability).mockResolvedValueOnce({
      status: 'recovered',
      reservation: { resultRef: 'cv-1', operationStatus: 'SUCCEEDED' },
    } as never);
    vi.mocked(prisma.generatedCV.findUnique).mockResolvedValue(null as never);

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'RESULT_UNAVAILABLE', charged: true, repairable: true });
    expect(rewriteCV).not.toHaveBeenCalled();
  });

  it('returns RESULT_UNAVAILABLE when the archived object is gone', async () => {
    vi.mocked(reserveCapability).mockResolvedValueOnce({
      status: 'recovered',
      reservation: { resultRef: 'cv-1', operationStatus: 'SUCCEEDED' },
    } as never);
    vi.mocked(prisma.generatedCV.findUnique).mockResolvedValue({
      userId: USER.id,
      analysisId: 'an-1',
      fileKey: 'users/u1/cv-1/Tailored_CV.docx',
    } as never);
    vi.mocked(storage.download).mockRejectedValueOnce(new Error('NoSuchKey'));

    const res = await POST(regenRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('RESULT_UNAVAILABLE');
  });

  it('runs a linked repair without consuming a second quota unit', async () => {
    vi.mocked(checkRepairEligibility).mockResolvedValueOnce({
      status: 'eligible',
      original: { resultRef: 'cv-old', operationStatus: 'SUCCEEDED' },
    } as never);

    const req = new Request('http://test/api/cv/regenerate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operation-id': 'repair-op', 'x-repair-of': 'original-op' },
      body: JSON.stringify({ analysisId: 'an-1', templateId: 'architect' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('wordprocessingml');
    // Regenerated (all gates run) but recorded via commitRepair, never commitCapability.
    expect(rewriteCV).toHaveBeenCalledTimes(1);
    expect(persistAndArchiveCv).toHaveBeenCalledTimes(1);
    expect(commitRepair).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitRepair).mock.calls[0][0]).toMatchObject({
      originalOperationId: 'original-op',
      repairOperationId: 'repair-op',
      resultRef: 'cv-1',
    });
    expect(commitCapability).not.toHaveBeenCalled();
    // A repair never asserts quota or reserves a fresh unit.
    expect(assertCapability).not.toHaveBeenCalled();
    expect(reserveCapability).not.toHaveBeenCalled();
  });

  it('rejects a repair whose original operation is not a committed charge', async () => {
    vi.mocked(checkRepairEligibility).mockResolvedValueOnce({ status: 'not_committed' } as never);

    const req = new Request('http://test/api/cv/regenerate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-repair-of': 'original-op' },
      body: JSON.stringify({ analysisId: 'an-1', templateId: 'architect' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(rewriteCV).not.toHaveBeenCalled();
    expect(commitRepair).not.toHaveBeenCalled();
  });
});
