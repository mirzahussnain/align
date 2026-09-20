import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  create: vi.fn(),
  policy: {
    cv: {
      formats: ['pdf', 'docx', 'odt'],
      maxBytes: 10 * 1024 * 1024,
      maxDirectMultipartBytes: 4 * 1024 * 1024,
      mimeTypes: {
        pdf: ['application/pdf'],
        docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        odt: ['application/vnd.oasis.opendocument.text'],
      },
      canonicalMimeTypes: {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        odt: 'application/vnd.oasis.opendocument.text',
      },
      extensions: { pdf: '.pdf', docx: '.docx', odt: '.odt' },
      acceptedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.oasis.opendocument.text',
      ],
      fileInputAccept: '.pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text',
    },
    avatar: { maxBytes: 5 * 1024 * 1024 },
  },
}));

vi.mock('@/shared/policies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/policies')>()),
  UPLOAD_POLICY: mocks.policy,
}));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(async () => null),
  analysisLimiter: {},
}));
vi.mock('@/shared/services/cv-upload-intent', () => ({ createCvUploadIntent: mocks.create }));

import { POST } from '@/app/api/stored-cvs/upload-intent/route';

const request = (body: unknown) => new Request('http://test/api/stored-cvs/upload-intent', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('stored CV upload-intent format policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.create.mockResolvedValue({
      intentId: 'intent-1',
      uploadUrl: 'https://signed.test/put',
      objectKey: 'private-key',
      expiresAt: new Date('2026-09-13T12:05:00.000Z'),
    });
  });

  it('accepts a MIME type added to the centralized upload policy', async () => {
    const response = await POST(request({
      filename: 'resume.odt',
      mimeType: 'application/vnd.oasis.opendocument.text',
      sizeBytes: 42,
    }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      userId: 'user-1',
      filename: 'resume.odt',
      mimeType: 'application/vnd.oasis.opendocument.text',
      sizeBytes: 42,
    });
  });
});
