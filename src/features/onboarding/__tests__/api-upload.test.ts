import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardingApi } from '@/features/onboarding/api';

describe('onboarding direct CV upload', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('creates an intent, PUTs bytes to storage, then finalizes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        intentId: 'intent-1', uploadUrl: 'https://storage.test/signed',
        contentType: 'application/pdf', expiresAt: '2026-09-13T12:05:00.000Z',
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ duplicate: false, storedCv: { id: 'cv-1' } }), {
        status: 201, headers: { 'content-type': 'application/json' },
      }));
    const file = new File([new Uint8Array([1, 2, 3])], 'resume.pdf', { type: 'application/pdf' });

    await expect(onboardingApi.upload(file)).resolves.toMatchObject({ storedCv: { id: 'cv-1' } });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/stored-cvs/upload-intent', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://storage.test/signed', {
      method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/stored-cvs/upload-complete', expect.objectContaining({ method: 'POST' }));
  });

  it('does not finalize when object storage rejects the PUT', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        intentId: 'intent-1', uploadUrl: 'https://storage.test/signed', contentType: 'application/pdf',
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const file = new File([new Uint8Array([1])], 'resume.pdf', { type: 'application/pdf' });

    await expect(onboardingApi.upload(file)).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
