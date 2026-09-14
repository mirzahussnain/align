import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadFixtureCV } from '@/__fixtures__/load-cv';

// The detect endpoint is deterministic and free: it must run the real evidence
// scorer and never touch the AI classifier or any usage meter. Only IO
// boundaries (auth, rate-limit, PDF, profile queries) are mocked.
vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(async () => null),
  analysisLimiter: {},
}));
vi.mock('@/shared/utils/pdf-parser', () => ({
  extractTextFromPDF: vi.fn(),
}));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  resolveProfileId: vi.fn(async () => 'p1'),
  listProfileTargets: vi.fn(async () => [
    {
      profileId: 'p1',
      label: 'Software track',
      isDefault: true,
      targetOccupation: 'software_engineer',
      targetRoleTitle: 'Backend Engineer',
      targetSeniority: 'mid',
      targetIndustry: 'technology',
    },
    {
      profileId: 'p2',
      label: 'Warehouse track',
      isDefault: false,
      targetOccupation: 'warehouse_operative',
      targetRoleTitle: '',
      targetSeniority: '',
      targetIndustry: 'logistics',
    },
  ]),
}));

import { POST } from '@/app/api/analyze/detect/route';
import { auth } from '@/shared/lib/auth';
import { extractTextFromPDF } from '@/shared/utils/pdf-parser';

function detectRequest() {
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'cv.pdf', { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', file);
  return new Request('http://test/api/analyze/detect', { method: 'POST', body: form }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
});

describe('POST /api/analyze/detect', () => {
  it('detects the CV occupation and flags the mismatch against the active Profile', async () => {
    // Warehouse CV while the active Profile targets software → a mismatch the UI
    // must surface before continuing.
    vi.mocked(extractTextFromPDF).mockResolvedValue({
      text: loadFixtureCV('warehouse-flt-no-projects'),
      pageCount: 1,
    } as never);

    const res = await POST(detectRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.detected.occupation).toBe('warehouse_operative');
    expect(body.detected.label).toBeTruthy();
    // Neither warehouse nor software is a regulated profession, so the picker
    // shows no regulated notice for them.
    expect(body.detected.regulated).toBe(false);
    expect(body.activeProfile).toMatchObject({
      profileId: 'p1',
      occupation: 'software_engineer',
      regulated: false,
    });
    expect(body.savedProfiles).toHaveLength(2);
    expect(body.savedProfiles.every((p: { regulated: boolean }) => p.regulated === false)).toBe(true);
    expect(body.mismatch).toMatchObject({
      detectedOccupation: 'warehouse_operative',
      profileOccupation: 'software_engineer',
    });
    expect(body.mismatch.detectedLabel).toBeTruthy();
    expect(body.mismatch.profileLabel).toBeTruthy();
  });

  it('reports no mismatch when the CV agrees with the active Profile', async () => {
    vi.mocked(extractTextFromPDF).mockResolvedValue({
      text: loadFixtureCV('junior-dev-with-projects'),
      pageCount: 1,
    } as never);

    const res = await POST(detectRequest());
    const body = await res.json();

    expect(body.detected.occupation).toBe('software_engineer');
    expect(body.mismatch).toBeNull();
  });

  it('rejects a PDF with no extractable text', async () => {
    vi.mocked(extractTextFromPDF).mockResolvedValue({ text: '   ', pageCount: 1 } as never);

    const res = await POST(detectRequest());
    expect(res.status).toBe(400);
  });
});
