import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewRecord } from '../types';
import {
  createPreviewService,
  deletePreviewArtifacts,
  type RetryDependencies,
} from '../preview-service';

const row = (overrides: Partial<PreviewRecord> = {}): PreviewRecord => ({
  id: 'preview-1', generatedCvId: 'cv-1', userId: 'user-1', documentHash: 'a'.repeat(64),
  rendererVersion: 'renderer', status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED',
  pageCount: 2, pdfKey: 'users/user-1/cv-1/previews/hash/document.pdf',
  pageImageKeys: [], pdfSize: 100, pageImageSizes: [], attemptCount: 1,
  leaseExpiresAt: null, createdAt: new Date(0), updatedAt: new Date(0), ...overrides,
});

function harness(preview: PreviewRecord | null = row()) {
  const claimThumbnailRetry = vi.fn<RetryDependencies['claimThumbnailRetry']>(
    async () => ({ status: 'claimed', previewId: 'preview-1' }),
  );
  const dependencies = {
    loadOwnedPreview: vi.fn(async () => preview),
    claimThumbnailRetry,
    completePreview: vi.fn(async () => true),
    failPreview: vi.fn(async () => true),
    download: vi.fn(async () => Buffer.from('%PDF-valid')),
    inspect: vi.fn(async () => ({ pageCount: preview?.pageCount ?? 2 })),
    renderPages: vi.fn(async (_pdf: Buffer, count: 1 | 2) =>
      Array.from({ length: count }, (_, index) => Buffer.from(`png-${index + 1}`))),
    storePages: vi.fn(async () => ({
      pageImageKeys: ['page-1.png', 'page-2.png'], pageImageSizes: [5, 5],
    })),
  };
  return { service: createPreviewService(dependencies), dependencies };
}

describe('verified-PDF thumbnail retry', () => {
  it('reuses READY metadata without storage or work', async () => {
    const ready = row({ status: 'READY', failureCode: null, pageImageKeys: ['page.png'] });
    const h = harness(ready);
    h.dependencies.claimThumbnailRetry.mockResolvedValue({ status: 'ready', preview: ready });
    await expect(h.service.retryOwnedThumbnail({ userId: 'user-1', generatedCvId: 'cv-1' }))
      .resolves.toMatchObject({ status: 'ready', preview: ready });
    expect(h.dependencies.download).not.toHaveBeenCalled();
    expect(h.dependencies.renderPages).not.toHaveBeenCalled();
  });

  it('returns in-progress for an active retry lease', async () => {
    const h = harness();
    h.dependencies.claimThumbnailRetry.mockResolvedValue({ status: 'in_progress' });
    await expect(h.service.retryOwnedThumbnail({ userId: 'user-1', generatedCvId: 'cv-1' }))
      .resolves.toEqual({ status: 'in_progress' });
    expect(h.dependencies.download).not.toHaveBeenCalled();
  });

  it.each([1, 2] as const)('renders and stores exactly %i page(s) from the verified PDF', async (pageCount) => {
    const preview = row({ pageCount });
    const h = harness(preview);
    h.dependencies.inspect.mockResolvedValue({ pageCount });
    h.dependencies.storePages.mockResolvedValue({
      pageImageKeys: Array.from({ length: pageCount }, (_, index) => `page-${index + 1}.png`),
      pageImageSizes: Array.from({ length: pageCount }, () => 5),
    });
    await expect(h.service.retryOwnedThumbnail({ userId: 'user-1', generatedCvId: 'cv-1' }))
      .resolves.toMatchObject({ status: 'ready' });
    expect(h.dependencies.download).toHaveBeenCalledWith('rewrites', preview.pdfKey);
    expect(h.dependencies.renderPages).toHaveBeenCalledWith(expect.any(Buffer), pageCount);
    expect(h.dependencies.completePreview).toHaveBeenCalledOnce();
  });

  it('returns unavailable without mutation for missing canonical metadata', async () => {
    const h = harness(null);
    await expect(h.service.retryOwnedThumbnail({ userId: 'user-1', generatedCvId: 'legacy-cv' }))
      .resolves.toEqual({ status: 'unavailable' });
    expect(h.dependencies.claimThumbnailRetry).not.toHaveBeenCalled();
    expect(h.dependencies.download).not.toHaveBeenCalled();
    expect(h.dependencies.completePreview).not.toHaveBeenCalled();
  });

  it('makes a missing or malformed verified PDF terminal without conversion', async () => {
    const missing = harness();
    missing.dependencies.download.mockRejectedValue(new Error('missing'));
    await expect(missing.service.retryOwnedThumbnail({ userId: 'user-1', generatedCvId: 'cv-1' }))
      .resolves.toEqual({ status: 'failed', failureCode: 'PREVIEW_LEASE_EXPIRED' });
    expect(missing.dependencies.failPreview).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: 'PREVIEW_LEASE_EXPIRED',
    }));

    const malformed = harness();
    malformed.dependencies.inspect.mockRejectedValue(new Error('malformed'));
    await malformed.service.retryOwnedThumbnail({ userId: 'user-1', generatedCvId: 'cv-1' });
    expect(malformed.dependencies.renderPages).not.toHaveBeenCalled();
    expect(malformed.dependencies.failPreview).toHaveBeenCalledWith(expect.objectContaining({
      failureCode: 'PREVIEW_LEASE_EXPIRED',
    }));
  });

  it('never accepts noncanonical page counts or preview metadata', async () => {
    const h = harness(row({ pageCount: 3 }));
    await expect(h.service.retryOwnedThumbnail({ userId: 'user-1', generatedCvId: 'cv-1' }))
      .resolves.toEqual({ status: 'unavailable' });
    expect(h.dependencies.claimThumbnailRetry).not.toHaveBeenCalled();
  });
});

describe('preview artifact deletion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes only deduplicated keys in the owning user namespace', async () => {
    const remove = vi.fn(async () => true);
    await expect(deletePreviewArtifacts('user-1', {
      pdfKey: 'users/user-1/cv-1/previews/hash/document.pdf',
      pageImageKeys: [
        'users/user-1/cv-1/previews/hash/page-1.png',
        'users/user-1/cv-1/previews/hash/page-1.png',
      ],
    }, { delete: remove })).resolves.toBe(true);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('rejects cross-owner keys without deleting anything', async () => {
    const remove = vi.fn(async () => true);
    await expect(deletePreviewArtifacts('user-1', {
      pdfKey: 'users/user-2/cv-1/previews/hash/document.pdf', pageImageKeys: [],
    }, { delete: remove })).resolves.toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
