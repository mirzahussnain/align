import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ count: vi.fn(), create: vi.fn(), validate: vi.fn(), extract: vi.fn() }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: { anonymousAtsResult: {
  findUnique: vi.fn(), count: mocks.count, create: mocks.create,
} } }));
vi.mock('@/shared/services/cv-extraction', async (load) => {
  const actual = await load<typeof import('@/shared/services/cv-extraction')>();
  return { ...actual, validateUploadBytes: mocks.validate, extractStoredCv: mocks.extract };
});

import { createPublicAtsDemo } from '@/shared/services/public-ats-service';

describe('public ATS multipart size', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.validate.mockImplementation((_name, bytes) => ({ bytes, sizeBytes: bytes.length, format: 'pdf', mimeType: 'application/pdf' }));
    mocks.extract.mockResolvedValue({ text: 'Software engineer '.repeat(20), pageCount: 1 });
    mocks.create.mockResolvedValue({});
  });

  it('accepts 4 MiB and rejects one byte more before extraction', async () => {
    const exact = new File([new Uint8Array(4 * 1024 * 1024)], 'cv.pdf', { type: 'application/pdf' });
    await expect(createPublicAtsDemo({ file: exact, ip: '203.0.113.1' })).resolves.toMatchObject({ token: expect.any(String) });
    expect(mocks.extract).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const over = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'cv.pdf', { type: 'application/pdf' });
    await expect(createPublicAtsDemo({ file: over, ip: '203.0.113.1' })).rejects.toMatchObject({ statusCode: 413 });
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
  });
});
