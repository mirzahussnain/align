import { describe, it, expect, beforeEach, vi } from 'vitest';

// Exercises the analyze route's NEW analysis-context contract surface: the
// evidence-source feature gate, saved-profile-target ownership validation, that
// a validation failure never spends quota, and that the resolved occupation
// comes from server classification rather than any client-supplied value.
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
// Reservation ledger mocked (see analyze-exposes-id for rationale).
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
// classifyCV is the server's authority. It returns software regardless of any
// client-supplied target, so a test can prove the client cannot dictate the
// resolved occupation. scoreOccupationEvidence is only reached via the mismatch
// path (no profile here), so a stub keeps the resolver import happy.
vi.mock('@/shared/services/classifier', () => ({
  // Mirrors the real precedence enough for provenance: an explicitly passed
  // target resolves as `profile_target`, otherwise CV evidence decides. The
  // occupation is always software, so a client-supplied role can never dictate it.
  classifyCV: vi.fn(async (input: { profileTarget?: unknown }) => ({
    occupation: 'software_engineer',
    sector: 'technology',
    confidence: 0.9,
    source: input.profileTarget ? 'profile_target' : 'dictionary_evidence',
    applicationWorkflow: 'standard',
    reasonCodes: [],
  })),
  scoreOccupationEvidence: vi.fn(() => ({ occupation: 'generic', confidence: 0.2, reasonCodes: [] })),
  classifyAsGeneric: vi.fn(() => ({
    occupation: 'generic',
    sector: 'general',
    confidence: 1,
    source: 'fallback',
    applicationWorkflow: 'cv_led',
    reasonCodes: ['USER_SELECTED_GENERIC'],
  })),
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
  getJobMatchFeedback: vi.fn(async () => null),
  getSemanticCVFeedback: vi.fn(async () => null),
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  resolveProfileId: vi.fn(async () => null),
  loadProfileTarget: vi.fn(async () => null),
}));

import { POST } from '@/app/api/analyze/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { recordUsage } from '@/shared/services/usage-meter';
import { loadProfileTarget } from '@/features/dashboard/data/load-profile';

function analyzeRequest(fields: Record<string, string>) {
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'cv.pdf', { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', file);
  form.append('mode', fields.mode ?? 'ats');
  for (const [key, value] of Object.entries(fields)) {
    if (key !== 'mode') form.append(key, value);
  }
  return new Request('http://test/api/analyze', { method: 'POST', body: form }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
});

describe('POST /api/analyze — analysis-context contract', () => {
  it('rejects a non-cv_only evidence source before any quota or model work', async () => {
    const res = await POST(analyzeRequest({ evidenceSource: 'active_profile' }));

    expect(res.status).toBe(400);
    expect(prisma.analysis.create).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('rejects a saved-profile target the user does not own, without spending quota', async () => {
    vi.mocked(loadProfileTarget).mockResolvedValue(null);

    const res = await POST(
      analyzeRequest({ targetSelection: 'saved_profile', savedProfileId: 'not-mine' })
    );

    expect(res.status).toBe(403);
    expect(loadProfileTarget).toHaveBeenCalledWith('u1', 'not-mine');
    expect(recordUsage).not.toHaveBeenCalled();
    expect(prisma.analysis.create).not.toHaveBeenCalled();
  });

  it('resolves the occupation server-side, ignoring a client-supplied target string', async () => {
    // The client claims a nurse target; the server classifier says software, and
    // the persisted occupation follows the server, never the client's string.
    const res = await POST(
      analyzeRequest({ targetSelection: 'custom_role', targetRole: 'Registered Nurse' })
    );

    expect(res.status).toBe(200);
    const persisted = vi.mocked(prisma.analysis.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    const context = (persisted.rawResult as {
      analysisContext?: { targetSource?: string; resolvedTargetOccupation?: string };
    }).analysisContext;
    // The resolved occupation is the server classifier's, not the client's nurse.
    expect(context?.resolvedTargetOccupation).toBe('software_engineer');
    expect(context?.targetSource).toBe('user_selected_role');
  });

  it('persists the analysis context provenance inside rawResult', async () => {
    const res = await POST(analyzeRequest({}));

    expect(res.status).toBe(200);
    const persisted = vi.mocked(prisma.analysis.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    const context = (persisted.rawResult as { analysisContext?: Record<string, unknown> })
      .analysisContext;
    expect(context).toMatchObject({
      mode: 'ats',
      evidenceSource: { type: 'cv_only' },
      resolvedTargetOccupation: 'software_engineer',
    });
  });
});
