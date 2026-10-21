import 'server-only';
import { prisma } from '@/shared/lib/prisma';
import type { PreviewFailureCode, PreviewRecord } from './types';

export const PREVIEW_LEASE_MS = 2 * 60 * 1_000;

type PreviewDelegate = {
  findFirst(args: unknown): Promise<PreviewRecord | null>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

interface PreviewDb {
  generatedCvPreview: PreviewDelegate;
}

export class PreviewRepositoryError extends Error {
  constructor(
    readonly code:
      | 'PREVIEW_NOT_FOUND'
      | 'PREVIEW_HASH_MISMATCH'
      | 'PREVIEW_NOT_RETRYABLE',
  ) {
    super(code);
    this.name = 'PreviewRepositoryError';
  }
}

export function previewLeaseExpired(expiresAt: Date | null, now: Date) {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

const retryableFailures = new Set<PreviewFailureCode>([
  'THUMBNAIL_RENDER_FAILED',
  'PREVIEW_STORAGE_FAILED',
]);

function hasVerifiedPdf(row: PreviewRecord) {
  return Boolean(
    row.pdfKey &&
      row.pdfSize &&
      row.pdfSize > 0 &&
      (row.pageCount === 1 || row.pageCount === 2),
  );
}

export function createPreviewRepository(db: PreviewDb) {
  async function loadOwnedPreview(userId: string, generatedCvId: string) {
    return db.generatedCvPreview.findFirst({
      where: { userId, generatedCvId },
    });
  }

  async function claimThumbnailRetry(input: {
    userId: string;
    generatedCvId: string;
    documentHash: string;
    now: Date;
  }): Promise<
    | { status: 'claimed'; previewId: string }
    | { status: 'ready'; preview: PreviewRecord }
    | { status: 'in_progress' }
  > {
    const row = await loadOwnedPreview(input.userId, input.generatedCvId);
    if (!row) throw new PreviewRepositoryError('PREVIEW_NOT_FOUND');
    if (row.documentHash !== input.documentHash) {
      throw new PreviewRepositoryError('PREVIEW_HASH_MISMATCH');
    }
    if (row.status === 'READY') return { status: 'ready', preview: row };
    if (!hasVerifiedPdf(row)) {
      throw new PreviewRepositoryError('PREVIEW_NOT_RETRYABLE');
    }
    if (
      row.status === 'RENDERING' &&
      !previewLeaseExpired(row.leaseExpiresAt, input.now)
    ) {
      return { status: 'in_progress' };
    }
    if (
      row.status === 'FAILED' &&
      (!row.failureCode || !retryableFailures.has(row.failureCode))
    ) {
      throw new PreviewRepositoryError('PREVIEW_NOT_RETRYABLE');
    }
    if (row.status !== 'FAILED' && row.status !== 'RENDERING' && row.status !== 'PENDING') {
      throw new PreviewRepositoryError('PREVIEW_NOT_RETRYABLE');
    }

    const leaseExpiresAt = new Date(input.now.getTime() + PREVIEW_LEASE_MS);
    const claimed = await db.generatedCvPreview.updateMany({
      where: {
        id: row.id,
        userId: input.userId,
        documentHash: input.documentHash,
        status: row.status,
        attemptCount: row.attemptCount,
        leaseExpiresAt: row.leaseExpiresAt,
      },
      data: {
        status: 'RENDERING',
        failureCode: null,
        attemptCount: { increment: 1 },
        leaseExpiresAt,
      },
    });
    return claimed.count === 1
      ? { status: 'claimed', previewId: row.id }
      : { status: 'in_progress' };
  }

  async function completePreview(input: {
    userId: string;
    previewId: string;
    documentHash: string;
    pageImageKeys: string[];
    pageImageSizes: number[];
  }) {
    if (input.pageImageKeys.length < 1 || input.pageImageKeys.length > 2) return false;
    if (input.pageImageKeys.length !== input.pageImageSizes.length) return false;
    const result = await db.generatedCvPreview.updateMany({
      where: {
        id: input.previewId,
        userId: input.userId,
        documentHash: input.documentHash,
        status: 'RENDERING',
      },
      data: {
        status: 'READY',
        failureCode: null,
        pageImageKeys: input.pageImageKeys,
        pageImageSizes: input.pageImageSizes,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async function failPreview(input: {
    userId: string;
    previewId: string;
    documentHash: string;
    failureCode: PreviewFailureCode;
  }) {
    const result = await db.generatedCvPreview.updateMany({
      where: {
        id: input.previewId,
        userId: input.userId,
        documentHash: input.documentHash,
        status: 'RENDERING',
      },
      data: {
        status: 'FAILED',
        failureCode: input.failureCode,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  return { claimThumbnailRetry, completePreview, failPreview, loadOwnedPreview };
}

const repository = createPreviewRepository(prisma as unknown as PreviewDb);
export const claimThumbnailRetry = repository.claimThumbnailRetry;
export const completePreview = repository.completePreview;
export const failPreview = repository.failPreview;
export const loadOwnedPreview = repository.loadOwnedPreview;
