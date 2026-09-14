import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSnapshotDetails: vi.fn(),
  persistTrustedProviderJob: vi.fn(),
}));

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/services/job-snapshot', () => ({
  getSnapshotDetails: mocks.getSnapshotDetails,
  persistTrustedProviderJob: mocks.persistTrustedProviderJob,
}));

import { POST } from '@/app/api/jobs/snapshots/route';

function request(body: unknown) {
  return new Request('http://test/api/jobs/snapshots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/jobs/snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.getSnapshotDetails.mockResolvedValue({ id: 'snapshot-1', importedByUserId: null });
  });

  it('accepts only a trusted snapshot ID already materialised by the server', async () => {
    const response = await POST(request({ jobSnapshotId: 'snapshot-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ jobSnapshotId: 'snapshot-1' });
    expect(mocks.getSnapshotDetails).toHaveBeenCalledWith('snapshot-1', 'user-1');
    expect(mocks.persistTrustedProviderJob).not.toHaveBeenCalled();
  });

  it.each([
    'title',
    'company',
    'description',
    'canonicalJobId',
    'sourceJobId',
    'providerReferences',
  ])('rejects browser-authored %s', async (field) => {
    const response = await POST(request({ jobSnapshotId: 'snapshot-1', [field]: 'forged' }));

    expect(response.status).toBe(400);
    expect(mocks.getSnapshotDetails).not.toHaveBeenCalled();
    expect(mocks.persistTrustedProviderJob).not.toHaveBeenCalled();
  });

  it('rejects unknown and foreign-private snapshot IDs', async () => {
    mocks.getSnapshotDetails.mockResolvedValue(null);

    const response = await POST(request({ jobSnapshotId: 'foreign-private' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_JOB_REFERENCE' },
    });
  });

  it('rejects legacy client-authored jobs without invoking a writer', async () => {
    const response = await POST(request({
      job: {
        source: 'ADZUNA',
        sourceJobId: 'forged-provider-id',
        canonicalUrl: 'https://example.test/forged',
        dedupeFingerprint: 'forged',
        title: 'Forged title',
        company: 'Forged employer',
        locationText: 'London',
      },
    }));

    expect(response.status).toBe(400);
    expect(mocks.persistTrustedProviderJob).not.toHaveBeenCalled();
  });
});
