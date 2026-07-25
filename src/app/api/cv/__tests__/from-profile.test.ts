import { describe, it, expect, beforeEach, vi } from 'vitest';

// The deterministic profile build shares the persist/render machinery with the
// AI paths, all mocked here. The usage meter is mocked too so the test can prove
// this path never touches the AI CV-generation allowance.
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
  },
}));
vi.mock('@/shared/lib/entitlements', () => ({
  entitlementsFor: vi.fn(() => ({ monthlyLimits: {} })),
}));
vi.mock('@/shared/services/usage-meter', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, used: 0, limit: null, remaining: null })),
  recordUsage: vi.fn(async () => {}),
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  // A structurally-complete ProfileData so the trusted-context builder and the
  // deterministic safety scan have the arrays they iterate.
  loadProfileData: vi.fn(async () => ({
    profileId: 'profile-abc',
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
  isProfileComplete: vi.fn(() => true),
}));
vi.mock('@/shared/services/cv-generation', () => ({
  renderCvDocx: vi.fn(async () => Buffer.from('docx-bytes')),
  persistAndArchiveCv: vi.fn(async () => 'cv-1'),
  // A benign, fully-supported CV shape by default; individual tests can override.
  profileToRewrittenData: vi.fn(() => ({
    fullName: 'A. Candidate',
    tagline: '',
    contact: { email: '', phone: '', location: '' },
    professionalSummary: '',
    education: [],
    projects: [],
    experience: [],
    coreSkills: [],
    certifications: [],
  })),
  DOCX_CONTENT_TYPE: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}));

import { POST } from '@/app/api/cv/from-profile/route';
import { auth } from '@/shared/lib/auth';
import { checkQuota, recordUsage } from '@/shared/services/usage-meter';
import { isProfileComplete } from '@/features/dashboard/data/load-profile';
import { persistAndArchiveCv, profileToRewrittenData } from '@/shared/services/cv-generation';

function fromProfileRequest(body: Record<string, unknown> = {}) {
  return new Request('http://test/api/cv/from-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(isProfileComplete).mockReturnValue(true);
});

describe('POST /api/cv/from-profile', () => {
  it('builds a DOCX from a complete profile without spending the AI generation quota', async () => {
    const res = await POST(fromProfileRequest({ templateId: 'architect' }));

    expect(res.status).toBe(200);
    // Deterministic render — no AI CV-generation allowance is checked or spent.
    expect(checkQuota).not.toHaveBeenCalledWith(expect.anything(), 'cvGenerations', expect.anything());
    expect(recordUsage).not.toHaveBeenCalledWith(expect.anything(), 'cvGenerations');
  });

  it('labels the CV as profile-derived: persists a profileId, no analysisId, and safety provenance', async () => {
    await POST(fromProfileRequest());

    expect(persistAndArchiveCv).toHaveBeenCalledTimes(1);
    const args = vi.mocked(persistAndArchiveCv).mock.calls[0][0];
    expect(args.profileId).toBe('profile-abc');
    expect(args.analysisId ?? null).toBeNull();
    // Deterministic path now records the trusted-context + unsupported-claim guarantees.
    expect(args.provenance).toEqual(
      expect.objectContaining({
        deterministic: true,
        trustedContextVersion: expect.any(Number),
        trustedContextProfileId: 'profile-abc',
        unsupportedClaimValidationResult: 'passed',
      })
    );
  });

  it('refuses to build from an incomplete profile', async () => {
    vi.mocked(isProfileComplete).mockReturnValue(false);

    const res = await POST(fromProfileRequest());

    expect(res.status).toBe(400);
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });

  it('refuses to render or persist when the deterministic output carries an unsupported claim', async () => {
    // The profile has no qualifying experience, but the reshaped CV asserts tenure.
    vi.mocked(profileToRewrittenData).mockReturnValueOnce({
      fullName: 'A. Candidate',
      tagline: 'Data Analyst · 2+ yrs',
      contact: { email: '', phone: '', location: '' },
      professionalSummary: '',
      education: [],
      projects: [],
      experience: [],
      coreSkills: [],
      certifications: [],
    });

    const res = await POST(fromProfileRequest());

    expect(res.status).toBe(422);
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });
});
