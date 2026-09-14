import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRawUnsafe: vi.fn(),
    storedCv: { count: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    cvUploadIntent: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return {
    tx,
    getUserPlan: vi.fn(),
    createUploadUrl: vi.fn(),
    stat: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
  };
});

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { $transaction: vi.fn((work) => work(mocks.tx)), cvUploadIntent: mocks.tx.cvUploadIntent },
}));
vi.mock('@/shared/lib/storage', () => ({
  storage: {
    createUploadUrl: mocks.createUploadUrl,
    stat: mocks.stat,
    download: mocks.download,
    delete: mocks.delete,
  },
}));
vi.mock('@/shared/entitlements/server', async (load) => {
  const actual = await load<typeof import('@/shared/entitlements/server')>();
  return { ...actual, getUserPlan: mocks.getUserPlan };
});

import {
  countReservedStoredCvSlots,
  createCvUploadIntent,
  finalizeCvUpload,
} from '@/shared/services/cv-upload-intent';
import { minimalPdf } from '@/shared/services/cv-extraction/__tests__/fixtures';

describe('CV upload intent lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserPlan.mockResolvedValue('FREE');
    mocks.tx.storedCv.count.mockResolvedValue(0);
    mocks.tx.cvUploadIntent.count.mockResolvedValue(0);
    mocks.createUploadUrl.mockResolvedValue('https://signed.test/put');
    mocks.delete.mockResolvedValue(true);
  });

  it('counts only unexpired PENDING and VALIDATING reservations', async () => {
    const now = new Date('2026-09-13T12:00:00.000Z');
    await countReservedStoredCvSlots('user-1', mocks.tx as never, now);

    expect(mocks.tx.cvUploadIntent.count).toHaveBeenCalledWith({ where: {
      userId: 'user-1',
      status: { in: ['PENDING', 'VALIDATING'] },
      expiresAt: { gt: now },
    } });
  });

  it('reserves a random server key and five-minute upload URL under the lock', async () => {
    mocks.tx.cvUploadIntent.create.mockImplementation(async ({ data }) => ({ id: 'intent-1', ...data }));

    const result = await createCvUploadIntent({
      userId: 'user-1',
      filename: '../resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 123,
      now: new Date('2026-09-13T12:00:00.000Z'),
    });

    expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledBefore(mocks.tx.cvUploadIntent.create);
    expect(result).toMatchObject({ intentId: 'intent-1', uploadUrl: 'https://signed.test/put' });
    expect(result.expiresAt.toISOString()).toBe('2026-09-13T12:05:00.000Z');
    expect(result.objectKey).toMatch(/^users\/user-1\/stored-cv\/intents\/[a-f0-9-]+\.pdf$/);
    expect(result.objectKey).not.toContain('resume');
    expect(mocks.createUploadUrl).toHaveBeenCalledWith({
      key: result.objectKey,
      contentType: 'application/pdf',
      contentLength: 123,
    });
  });

  it('claims once, validates bytes, and completes the intent atomically', async () => {
    const bytes = minimalPdf(['Candidate', 'Experience']);
    const intent = {
      id: 'intent-1', userId: 'user-1', objectKey: 'users/user-1/stored-cv/intents/random.pdf',
      originalFilename: 'resume.pdf', expectedMimeType: 'application/pdf', expectedSizeBytes: bytes.length,
      status: 'VALIDATING', expiresAt: new Date('2026-09-13T12:10:00.000Z'), storedCvId: null,
    };
    mocks.tx.cvUploadIntent.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.cvUploadIntent.findFirst.mockResolvedValue(intent);
    mocks.stat.mockResolvedValue({ sizeBytes: bytes.length, contentType: 'application/pdf', etag: 'etag' });
    mocks.download.mockResolvedValue(bytes);
    mocks.tx.storedCv.findUnique.mockResolvedValue(null);
    mocks.tx.storedCv.upsert.mockImplementation(async ({ create }) => ({
      ...create, createdAt: new Date(), objectDeletedAt: null,
    }));

    const result = await finalizeCvUpload({
      userId: 'user-1',
      intentId: 'intent-1',
      now: new Date('2026-09-13T12:00:00.000Z'),
    });

    expect(result.kind).toBe('created');
    expect(mocks.tx.cvUploadIntent.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'intent-1', userId: 'user-1', status: 'VALIDATING' }),
      data: expect.objectContaining({ status: 'COMPLETED', storedCvId: expect.any(String) }),
    });
  });
});
