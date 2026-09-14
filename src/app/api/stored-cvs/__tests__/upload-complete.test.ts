import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), finalize: vi.fn() }));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/services/cv-upload-intent', () => ({ finalizeCvUpload: mocks.finalize }));

import { POST } from '@/app/api/stored-cvs/upload-complete/route';

const request = (body: unknown) => new Request('http://test/api/stored-cvs/upload-complete', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/stored-cvs/upload-complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.finalize.mockResolvedValue({ kind: 'created', storedCv: { id: 'cv-1' } });
  });

  it('finalizes only the authenticated owner intent', async () => {
    const response = await POST(request({ intentId: 'intent-1' }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ duplicate: false, storedCv: { id: 'cv-1' } });
    expect(mocks.finalize).toHaveBeenCalledWith({ userId: 'user-1', intentId: 'intent-1' });
  });

  it('rejects unknown fields before finalization', async () => {
    const response = await POST(request({ intentId: 'intent-1', objectKey: 'forged' }));
    expect(response.status).toBe(400);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
