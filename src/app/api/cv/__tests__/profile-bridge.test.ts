import { describe, it, expect, beforeEach, vi } from 'vitest';

// The reconciliation route gates on assertCapability and drives the reservation
// ledger: it commits ONLY when the run actually reached a provider (usedAI), and
// releases the held unit otherwise so merely re-opening suggestions costs nothing.
// The ledger module is mocked; its atomic behaviour is proven separately.
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/shared/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(async () => null),
  rewriteLimiter: {},
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { analysis: { findUnique: vi.fn() } },
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  loadOwnedProfileData: vi.fn(async () => ({ profileId: 'profile-123', label: 'Default' })),
}));
vi.mock('@/shared/services/profile-reconciler', () => ({
  reconcileProfileWithCv: vi.fn(async () => ({ usedAI: true, suggestions: [{ id: 's1' }] })),
}));
vi.mock('@/shared/entitlements/server', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/entitlements/server')>();
  return { ...actual, assertCapability: vi.fn(async () => ({ allowed: true })) };
});
vi.mock('@/shared/services/capability-reservation', () => ({
  reserveCapability: vi.fn(async () => ({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } })),
  commitCapability: vi.fn(async () => ({ status: 'committed', reservation: {} })),
  releaseCapability: vi.fn(async () => ({ status: 'released' })),
  markOperation: vi.fn(async () => {}),
  reservationFingerprint: vi.fn(() => 'fingerprint'),
  hashContent: vi.fn(() => 'hash'),
  countActiveUsage: vi.fn(async () => 0),
  consumeCapability: vi.fn(async () => true),
}));
vi.mock('@/shared/schemas/analysis-result', () => ({
  parseStoredAnalysisResult: vi.fn(() => ({ result: { rawText: 'x'.repeat(120) }, legacy: false })),
}));
vi.mock('@/shared/schemas/ai-output', () => ({
  parseStoredJobMatchData: vi.fn(() => ({ schemaVersion: 2, requirements: [{ id: 'requirement-001' }] })),
}));

import { POST } from '@/app/api/cv/profile-bridge/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { reconcileProfileWithCv } from '@/shared/services/profile-reconciler';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
} from '@/shared/services/capability-reservation';

const USER = { id: 'u1' };

function bridgeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/cv/profile-bridge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: USER } as never);
  vi.mocked(prisma.analysis.findUnique).mockResolvedValue({
    userId: USER.id,
    mode: 'job_match',
    rawResult: {},
    jobDescription: 'Senior Data Engineer with streaming experience required.',
    jobMatchData: { schemaVersion: 2 },
  } as never);
  vi.mocked(reserveCapability).mockResolvedValue({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } } as never);
  vi.mocked(commitCapability).mockResolvedValue({ status: 'committed', reservation: {} } as never);
  vi.mocked(reconcileProfileWithCv).mockResolvedValue({ usedAI: true, suggestions: [{ id: 's1' }] } as never);
});

describe('POST /api/cv/profile-bridge', () => {
  it('commits exactly once for an AI-backed reconciliation', async () => {
    const res = await POST(bridgeRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(200);
    expect(reserveCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(releaseCapability).not.toHaveBeenCalled();
    // Reserved before the reconciler ran.
    expect(vi.mocked(reserveCapability).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(reconcileProfileWithCv).mock.invocationCallOrder[0]
    );
  });

  it('consumes zero when the reconciliation used no AI', async () => {
    vi.mocked(reconcileProfileWithCv).mockResolvedValue({ usedAI: false, suggestions: [] } as never);

    const res = await POST(bridgeRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(200);
    expect(reserveCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(releaseCapability).toHaveBeenCalledTimes(1);
  });

  it('releases the reservation on a provider failure', async () => {
    vi.mocked(reconcileProfileWithCv).mockRejectedValue(new Error('provider down'));

    await expect(POST(bridgeRequest({ analysisId: 'an-1' }))).resolves.toMatchObject({ status: 500 });
    expect(releaseCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('does not commit again for a committed retry (recovered), re-deriving suggestions', async () => {
    vi.mocked(reserveCapability).mockResolvedValue({ status: 'recovered', reservation: { resultRef: null, operationStatus: 'SUCCEEDED' } } as never);

    const res = await POST(bridgeRequest({ analysisId: 'an-1' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toEqual([{ id: 's1' }]);
    expect(commitCapability).not.toHaveBeenCalled();
    expect(releaseCapability).not.toHaveBeenCalled();
  });
});
