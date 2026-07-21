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
  loadProfileData: vi.fn(async () => ({ profileId: 'profile-abc' })),
  isProfileComplete: vi.fn(() => true),
}));
vi.mock('@/shared/services/cv-generation', () => ({
  renderCvDocx: vi.fn(async () => Buffer.from('docx-bytes')),
  persistAndArchiveCv: vi.fn(async () => 'cv-1'),
  profileToRewrittenData: vi.fn(() => ({ fullName: 'A. Candidate' })),
  DOCX_CONTENT_TYPE: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}));

import { POST } from '@/app/api/cv/from-profile/route';
import { auth } from '@/shared/lib/auth';
import { checkQuota, recordUsage } from '@/shared/services/usage-meter';
import { isProfileComplete } from '@/features/dashboard/data/load-profile';
import { persistAndArchiveCv } from '@/shared/services/cv-generation';

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

  it('labels the CV as profile-derived: persists a profileId and no analysisId', async () => {
    await POST(fromProfileRequest());

    expect(persistAndArchiveCv).toHaveBeenCalledTimes(1);
    const args = vi.mocked(persistAndArchiveCv).mock.calls[0][0];
    expect(args.profileId).toBe('profile-abc');
    expect(args.analysisId ?? null).toBeNull();
    expect(args.provenance).toBeUndefined();
  });

  it('refuses to build from an incomplete profile', async () => {
    vi.mocked(isProfileComplete).mockReturnValue(false);

    const res = await POST(fromProfileRequest());

    expect(res.status).toBe(400);
    expect(persistAndArchiveCv).not.toHaveBeenCalled();
  });
});
