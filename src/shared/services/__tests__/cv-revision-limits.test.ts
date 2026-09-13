import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ validate: vi.fn(), extract: vi.fn(), upload: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: { cvRevision: { create: mocks.create, update: mocks.update, delete: vi.fn() } } }));
vi.mock('@/shared/lib/storage', () => ({ storage: { upload: mocks.upload }, keyFor: { upload: vi.fn(() => 'key') } }));
vi.mock('@/shared/services/stored-cv', () => ({
  checksumOf: vi.fn(() => 'checksum'), loadOwnedStoredCv: vi.fn(), extractStoredCvRecord: vi.fn(),
}));
vi.mock('@/shared/services/cv-extraction', async (load) => {
  const actual = await load<typeof import('@/shared/services/cv-extraction')>();
  return { ...actual, validateUploadBytes: mocks.validate, extractStoredCv: mocks.extract };
});

import { resolveCvRevision } from '@/shared/services/cv-revision';

describe('direct multipart CV revision size', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validate.mockImplementation((_name, bytes) => ({ bytes, sizeBytes: bytes.length, format: 'pdf', mimeType: 'application/pdf' }));
    mocks.extract.mockResolvedValue({ text: 'x'.repeat(100), pageCount: 1, parserVersion: 'test' });
    mocks.create.mockImplementation(async ({ data }) => ({ ...data }));
    mocks.update.mockResolvedValue({});
    mocks.upload.mockResolvedValue('key');
  });

  it('accepts 4 MiB and rejects one byte more before validation or extraction', async () => {
    const exact = new File([new Uint8Array(4 * 1024 * 1024)], 'cv.pdf', { type: 'application/pdf' });
    await expect(resolveCvRevision({ userId: 'user-1', plan: 'FREE', file: exact })).resolves.toMatchObject({ byteSize: exact.size });
    expect(mocks.extract).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const over = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'cv.pdf', { type: 'application/pdf' });
    await expect(resolveCvRevision({ userId: 'user-1', plan: 'FREE', file: over })).rejects.toMatchObject({ statusCode: 413 });
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
  });
});
