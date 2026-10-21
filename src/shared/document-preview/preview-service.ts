import 'server-only';
import { storage } from '@/shared/lib/storage';
import {
  claimThumbnailRetry,
  completePreview,
  failPreview,
  loadOwnedPreview,
} from './preview-repository';
import { inspectPdf, renderPdfPages } from './pdf-preview';
import { storeRenderedPages } from './preview-storage';
import type { PreviewFailureCode, PreviewRecord } from './types';

export interface RetryDependencies {
  loadOwnedPreview(userId: string, generatedCvId: string): Promise<PreviewRecord | null>;
  claimThumbnailRetry(input: {
    userId: string; generatedCvId: string; documentHash: string; now: Date;
  }): Promise<
    | { status: 'claimed'; previewId: string }
    | { status: 'ready'; preview: PreviewRecord }
    | { status: 'in_progress' }
  >;
  completePreview(input: {
    userId: string; previewId: string; documentHash: string;
    pageImageKeys: string[]; pageImageSizes: number[];
  }): Promise<boolean>;
  failPreview(input: {
    userId: string; previewId: string; documentHash: string;
    failureCode: PreviewFailureCode;
  }): Promise<boolean>;
  download(bucket: 'rewrites', key: string): Promise<Buffer>;
  inspect(pdf: Buffer): Promise<{ pageCount: number }>;
  renderPages(pdf: Buffer, pageCount: 1 | 2): Promise<Buffer[]>;
  storePages(input: {
    userId: string; generatedCvId: string; documentHash: string; pages: Buffer[];
  }): Promise<{ pageImageKeys: string[]; pageImageSizes: number[] }>;
}

export type PreviewRetryResult =
  | { status: 'ready'; preview?: PreviewRecord }
  | { status: 'in_progress' }
  | { status: 'failed'; failureCode: PreviewFailureCode }
  | { status: 'unavailable' };

function canonicalPreview(preview: PreviewRecord): preview is PreviewRecord & {
  pageCount: 1 | 2;
  pdfKey: string;
} {
  return Boolean(
    (preview.pageCount === 1 || preview.pageCount === 2) &&
    preview.pdfKey &&
    preview.pdfSize &&
    preview.pdfSize > 0,
  );
}

export function createPreviewService(dependencies: RetryDependencies) {
  async function terminal(
    preview: PreviewRecord,
    previewId: string,
  ): Promise<PreviewRetryResult> {
    await dependencies.failPreview({
      userId: preview.userId,
      previewId,
      documentHash: preview.documentHash,
      failureCode: 'PREVIEW_LEASE_EXPIRED',
    });
    return { status: 'failed', failureCode: 'PREVIEW_LEASE_EXPIRED' };
  }

  async function retryOwnedThumbnail(input: {
    userId: string;
    generatedCvId: string;
    now?: Date;
  }): Promise<PreviewRetryResult> {
    const preview = await dependencies.loadOwnedPreview(input.userId, input.generatedCvId);
    if (!preview || !canonicalPreview(preview)) return { status: 'unavailable' };
    if (preview.status === 'READY') return { status: 'ready', preview };
    if (
      preview.status === 'FAILED' &&
      preview.failureCode !== 'THUMBNAIL_RENDER_FAILED' &&
      preview.failureCode !== 'PREVIEW_STORAGE_FAILED'
    ) {
      return preview.failureCode
        ? { status: 'failed', failureCode: preview.failureCode }
        : { status: 'unavailable' };
    }

    let claim;
    try {
      claim = await dependencies.claimThumbnailRetry({
        userId: input.userId,
        generatedCvId: input.generatedCvId,
        documentHash: preview.documentHash,
        now: input.now ?? new Date(),
      });
    } catch {
      return { status: 'unavailable' };
    }
    if (claim.status === 'ready') return { status: 'ready', preview: claim.preview };
    if (claim.status === 'in_progress') return { status: 'in_progress' };

    let pdf: Buffer;
    try {
      pdf = await dependencies.download('rewrites', preview.pdfKey);
    } catch {
      return terminal(preview, claim.previewId);
    }
    try {
      const inspected = await dependencies.inspect(pdf);
      if (inspected.pageCount !== preview.pageCount) return terminal(preview, claim.previewId);
    } catch {
      return terminal(preview, claim.previewId);
    }

    let pages: Buffer[];
    try {
      pages = await dependencies.renderPages(pdf, preview.pageCount);
    } catch {
      await dependencies.failPreview({
        userId: input.userId, previewId: claim.previewId,
        documentHash: preview.documentHash, failureCode: 'THUMBNAIL_RENDER_FAILED',
      });
      return { status: 'failed', failureCode: 'THUMBNAIL_RENDER_FAILED' };
    }

    let stored: { pageImageKeys: string[]; pageImageSizes: number[] };
    try {
      stored = await dependencies.storePages({
        userId: input.userId,
        generatedCvId: input.generatedCvId,
        documentHash: preview.documentHash,
        pages,
      });
    } catch {
      await dependencies.failPreview({
        userId: input.userId, previewId: claim.previewId,
        documentHash: preview.documentHash, failureCode: 'PREVIEW_STORAGE_FAILED',
      });
      return { status: 'failed', failureCode: 'PREVIEW_STORAGE_FAILED' };
    }
    const completed = await dependencies.completePreview({
      userId: input.userId,
      previewId: claim.previewId,
      documentHash: preview.documentHash,
      ...stored,
    });
    return completed ? { status: 'ready' } : { status: 'in_progress' };
  }

  return { retryOwnedThumbnail };
}

const service = createPreviewService({
  loadOwnedPreview,
  claimThumbnailRetry,
  completePreview,
  failPreview,
  download: (bucket, key) => storage.download(bucket, key),
  inspect: inspectPdf,
  renderPages: renderPdfPages,
  storePages: storeRenderedPages,
});

export const retryOwnedThumbnail = service.retryOwnedThumbnail;

export interface PreviewArtifactRecord {
  pdfKey: string | null;
  pageImageKeys: string[];
}

export async function deletePreviewArtifacts(
  userId: string,
  preview: PreviewArtifactRecord,
  objectStorage: Pick<typeof storage, 'delete'> = storage,
) {
  const keys = [preview.pdfKey, ...preview.pageImageKeys]
    .filter((key): key is string => Boolean(key));
  const prefix = `users/${userId}/`;
  if (keys.some((key) => !key.startsWith(prefix) || key.includes('..') || key.includes('\\'))) {
    return false;
  }
  const unique = [...new Set(keys)];
  const deleted = await Promise.all(unique.map((key) => objectStorage.delete('rewrites', key)));
  return deleted.every(Boolean);
}
