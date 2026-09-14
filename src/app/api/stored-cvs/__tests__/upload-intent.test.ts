import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), create: vi.fn() }));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/lib/rate-limit', () => ({ applyRateLimit: vi.fn(async () => null), analysisLimiter: {} }));
vi.mock('@/shared/services/cv-upload-intent', () => ({ createCvUploadIntent: mocks.create }));

import { POST } from '@/app/api/stored-cvs/upload-intent/route';

const request = (body: unknown) => new Request('http://test/api/stored-cvs/upload-intent', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/stored-cvs/upload-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.create.mockResolvedValue({
      intentId: 'intent-1', uploadUrl: 'https://signed.test/put', objectKey: 'private-key',
      expiresAt: new Date('2026-09-13T12:05:00.000Z'),
    });
  });

  it('returns only the browser upload contract', async () => {
    const response = await POST(request({ filename: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 42 }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      intentId: 'intent-1', uploadUrl: 'https://signed.test/put',
      expiresAt: '2026-09-13T12:05:00.000Z', contentType: 'application/pdf',
    });
    expect(JSON.stringify(body)).not.toContain('private-key');
    expect(JSON.stringify(body)).not.toContain('S3_');
  });

  it('rejects unauthenticated, unknown, and malformed input', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request({}))).status).toBe(401);
    expect((await POST(request({ filename: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 42, key: 'forged' }))).status).toBe(400);
    expect((await POST(request({ filename: 'resume.exe', mimeType: 'application/octet-stream', sizeBytes: 42 }))).status).toBe(400);
    expect((await POST(request({ filename: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 10 * 1024 * 1024 + 1 }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
