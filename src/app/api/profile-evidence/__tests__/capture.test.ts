import { describe, it, expect, beforeEach, vi } from 'vitest';

// The HITL capture route is deterministic but quota-controlled: it reserves a
// human_evidence_capture unit after every validation/eligibility/entitlement gate
// and before the write, records the created record's reference on the reservation
// ATOMICALLY, commits against it, and releases on a write failure. A committed
// retry returns the existing record without a second write or charge; a
// commit-FAILURE retry (result recorded, commit lost) finalises without creating
// a duplicate. The ledger module is mocked; its atomicity is proven elsewhere.
const prismaMock = vi.hoisted(() => ({
  jobMatch: { findFirst: vi.fn() },
  applicationEvidenceContext: { create: vi.fn(), findFirst: vi.fn() },
}));

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  loadOwnedProfileData: vi.fn(async () => ({ profileId: 'profile-123' })),
}));
vi.mock('@/shared/services/profile-reconciler', () => ({
  buildProfileCandidates: vi.fn(() => []),
}));
vi.mock('@/shared/services/structured-evidence', () => ({
  STRUCTURED_EVIDENCE_KINDS: ['other'],
  validateStructuredEvidence: vi.fn(() => ({ kind: 'other', details: { title: 'T', description: 'D' } })),
  describeStructuredEvidence: vi.fn(() => ({ label: 'Other evidence', text: 'T: D' })),
  createCanonicalEvidence: vi.fn(async () => ({ type: 'other', id: 'ev-1' })),
  StructuredEvidenceValidationError: class extends Error {},
}));
vi.mock('@/shared/entitlements/server', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/entitlements/server')>();
  return {
    ...actual,
    assertCapability: vi.fn(async () => ({ allowed: true })),
    // Per-application approval cap: allowed by default; specific tests override it.
    assertApplicationApprovalLimit: vi.fn(async () => {}),
    // Reusable-evidence capacity: allowed by default. Its atomicity and counting
    // definition are proven in the real-Postgres entitlement suite; here we only
    // assert WHICH kinds reach it.
    assertStoredEvidenceLimit: vi.fn(async () => {}),
  };
});
vi.mock('@/shared/services/reservation-observability', () => ({
  logReservationEvent: vi.fn(),
}));
vi.mock('@/shared/services/capability-reservation', () => ({
  reserveCapability: vi.fn(async () => ({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } })),
  commitCapability: vi.fn(async () => ({ status: 'committed', reservation: {} })),
  releaseCapability: vi.fn(async () => ({ status: 'released' })),
  // Runs the creator against the mocked prisma (as the real one runs it against
  // a tx client), then reports it as freshly created.
  createResultForReservation: vi.fn(async ({ creator }: { creator: (tx: unknown) => Promise<{ resultRef: string; value: unknown }> }) => {
    const { resultRef, value } = await creator(prismaMock);
    return { status: 'created', resultRef, value };
  }),
  markOperation: vi.fn(async () => {}),
  markOperationRunning: vi.fn(async () => {}),
  reservationFingerprint: vi.fn(() => 'fingerprint'),
  hashContent: vi.fn(() => 'hash'),
  countActiveUsage: vi.fn(async () => 0),
  consumeCapability: vi.fn(async () => true),
}));
vi.mock('@/shared/schemas/ai-output', () => ({
  parseStoredJobMatchData: vi.fn(() => ({ requirements: [{ id: 'requirement-001', status: 'not_met' }] })),
}));

import { POST } from '@/app/api/profile-evidence/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  createResultForReservation,
} from '@/shared/services/capability-reservation';
import { createCanonicalEvidence, validateStructuredEvidence } from '@/shared/services/structured-evidence';
import { assertCapability, assertStoredEvidenceLimit } from '@/shared/entitlements/server';

const USER = { id: 'u1' };

function captureRequest(overrides: Record<string, unknown> = {}, operationId?: string) {
  return new Request('http://test/api/profile-evidence', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(operationId ? { 'x-operation-id': operationId } : {}),
    },
    body: JSON.stringify({
      analysisId: 'an-1',
      profileId: 'profile-123',
      requirementId: 'requirement-001',
      reuseInProfile: false,
      kind: 'other',
      details: { title: 'T', description: 'D' },
      confirmed: true,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: USER } as never);
  vi.mocked(prisma.jobMatch.findFirst).mockResolvedValue({ resultJson: { jobMatchData: { schemaVersion: 2 } } } as never);
  vi.mocked(prisma.applicationEvidenceContext.create).mockResolvedValue({ id: 'ctx-1' } as never);
  vi.mocked(reserveCapability).mockResolvedValue({ status: 'reserved', reservation: { operationStatus: 'PENDING', resultRef: null } } as never);
  vi.mocked(commitCapability).mockResolvedValue({ status: 'committed', reservation: {} } as never);
  // The factory implementation of createResultForReservation (runs the creator
  // against the mocked prisma) survives vi.clearAllMocks(), so it is not re-set here.
});

describe('POST /api/profile-evidence', () => {
  it('commits exactly once for a successful application-context capture', async () => {
    const res = await POST(captureRequest());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.applicationEvidenceContextId).toBe('ctx-1');
    expect(reserveCapability).toHaveBeenCalledTimes(1);
    expect(prisma.applicationEvidenceContext.create).toHaveBeenCalledTimes(1);
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitCapability).mock.calls[0][0]).toMatchObject({
      capability: 'human_evidence_capture',
      resultRef: 'context:ctx-1',
    });
    // Reserved before the write; committed after it.
    expect(vi.mocked(reserveCapability).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.applicationEvidenceContext.create).mock.invocationCallOrder[0]
    );
    expect(releaseCapability).not.toHaveBeenCalled();
  });

  it('commits a reuse-in-profile capture against the created evidence id', async () => {
    const res = await POST(captureRequest({ reuseInProfile: true }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.evidenceRef).toEqual({ type: 'other', id: 'ev-1' });
    expect(createCanonicalEvidence).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitCapability).mock.calls[0][0]).toMatchObject({ resultRef: 'evidence:other:ev-1' });
    // An `other` capture is a reusable evidence record, so it does consume the
    // allowance — checked inside the creator transaction.
    expect(assertStoredEvidenceLimit).toHaveBeenCalledTimes(1);
  });

  it('does not charge the evidence allowance when the capture is career history', async () => {
    // Saving employment evidence to the profile writes an Experience row — a
    // canonical Career Profile record, not commercial reusable evidence.
    vi.mocked(validateStructuredEvidence).mockReturnValueOnce({
      kind: 'employment',
      details: { employer: 'E', role: 'R' },
    } as never);

    const res = await POST(captureRequest({ reuseInProfile: true }));

    expect(res.status).toBe(201);
    expect(createCanonicalEvidence).toHaveBeenCalledTimes(1);
    expect(assertStoredEvidenceLimit).not.toHaveBeenCalled();
    expect(vi.mocked(assertCapability).mock.calls.map(([, capability]) => capability)).not.toContain(
      'profile_evidence_storage'
    );
  });

  it('returns the existing evidence on a committed retry, without a second write or charge', async () => {
    vi.mocked(reserveCapability).mockResolvedValue({ status: 'recovered', reservation: { resultRef: 'context:ctx-1', operationStatus: 'SUCCEEDED' } } as never);
    vi.mocked(prisma.applicationEvidenceContext.findFirst).mockResolvedValue({ id: 'ctx-1' } as never);

    const res = await POST(captureRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationEvidenceContextId).toBe('ctx-1');
    expect(createResultForReservation).not.toHaveBeenCalled();
    expect(prisma.applicationEvidenceContext.create).not.toHaveBeenCalled();
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('finalises WITHOUT re-creating when a prior attempt recorded a result but its commit failed', async () => {
    // The reservation is still held and carries the recorded resultRef of the
    // record created by the earlier attempt whose commit did not land.
    vi.mocked(reserveCapability).mockResolvedValue({ status: 'reserved', reservation: { operationStatus: 'RUNNING', resultRef: 'context:ctx-1' } } as never);
    vi.mocked(prisma.applicationEvidenceContext.findFirst).mockResolvedValue({ id: 'ctx-1' } as never);

    const res = await POST(captureRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationEvidenceContextId).toBe('ctx-1');
    // No duplicate: neither the creator wrapper nor a raw write ran again…
    expect(createResultForReservation).not.toHaveBeenCalled();
    expect(prisma.applicationEvidenceContext.create).not.toHaveBeenCalled();
    // …and the reservation was finalised exactly once (single charge).
    expect(commitCapability).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitCapability).mock.calls[0][0]).toMatchObject({ resultRef: 'context:ctx-1' });
  });

  it('persists the record then leaves the reservation intact when the commit fails (no un-charge, no duplicate)', async () => {
    vi.mocked(commitCapability).mockResolvedValue({ status: 'expired' } as never);

    await expect(POST(captureRequest())).resolves.toMatchObject({ status: 503 });
    // The record was created exactly once; the failed commit does NOT release it,
    // so a later retry finalises the SAME record rather than creating a new one.
    expect(prisma.applicationEvidenceContext.create).toHaveBeenCalledTimes(1);
    expect(releaseCapability).not.toHaveBeenCalled();
  });

  it('releases the reservation when the write fails', async () => {
    vi.mocked(prisma.applicationEvidenceContext.create).mockRejectedValue(new Error('db down'));

    await expect(POST(captureRequest())).resolves.toMatchObject({ status: 500 });
    expect(releaseCapability).toHaveBeenCalledTimes(1);
    expect(commitCapability).not.toHaveBeenCalled();
  });

  it('rejects a reused operation id with conflicting content as 409', async () => {
    vi.mocked(reserveCapability).mockResolvedValue({ status: 'conflict', reservation: { operationStatus: 'PENDING' } } as never);

    const res = await POST(captureRequest({}, 'op-1'));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('OPERATION_CONFLICT');
    expect(prisma.applicationEvidenceContext.create).not.toHaveBeenCalled();
  });
});
