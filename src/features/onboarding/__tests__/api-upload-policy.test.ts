import { beforeEach, describe, expect, it, vi } from 'vitest';

const policy = vi.hoisted(() => ({
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
}));

vi.mock('@/shared/policies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/policies')>()),
  UPLOAD_POLICY: policy,
}));

import { onboardingApi } from '@/features/onboarding/api';

describe('onboarding upload format policy', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps a policy extension to its canonical MIME before creating an intent', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        intentId: 'intent-1',
        uploadUrl: 'https://storage.test/signed',
        contentType: 'application/vnd.oasis.opendocument.text',
        expiresAt: '2026-09-13T12:05:00.000Z',
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        duplicate: false,
        storedCv: { id: 'cv-1' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const file = new File([new Uint8Array([1, 2, 3])], 'resume.odt', {
      type: 'application/vnd.oasis.opendocument.text',
    });

    await onboardingApi.upload(file);

    const intentInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(intentInit.body as string)).toEqual({
      filename: 'resume.odt',
      mimeType: 'application/vnd.oasis.opendocument.text',
      sizeBytes: 3,
    });
  });
});
