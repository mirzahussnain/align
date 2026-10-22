import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_LEASE_MS,
  PreviewRepositoryError,
  createPreviewRepository,
  previewLeaseExpired,
} from '../preview-repository';
import type { PreviewRecord } from '../types';

const NOW = new Date('2026-10-13T20:00:00.000Z');

function row(overrides: Partial<PreviewRecord> = {}): PreviewRecord {
  return {
    id: 'preview-1', generatedCvId: 'cv-1', userId: 'user-1', documentHash: 'hash-1',
    rendererVersion: 'renderer-1', status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED',
    pageCount: 2, pdfKey: 'users/user-1/cv-1/previews/hash-1/document.pdf',
    pageImageKeys: [], pdfSize: 1200, pageImageSizes: [], attemptCount: 1,
    leaseExpiresAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function harness(initial: ReturnType<typeof row> | null) {
  let current = initial;
  const findFirst = vi.fn(async ({ where }: { where: { id?: string; generatedCvId?: string; userId: string } }) => {
    if (!current || current.userId !== where.userId) return null;
    if (where.id && current.id !== where.id) return null;
    if (where.generatedCvId && current.generatedCvId !== where.generatedCvId) return null;
    return { ...current };
  });
  const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (!current || current.id !== where.id || current.userId !== where.userId) return { count: 0 };
    if (where.documentHash && current.documentHash !== where.documentHash) return { count: 0 };
    if (where.status && typeof where.status === 'string' && current.status !== where.status) return { count: 0 };
    if (typeof where.attemptCount === 'number' && current.attemptCount !== where.attemptCount) return { count: 0 };
    current = {
      ...current,
      ...data,
      attemptCount: data.attemptCount && typeof data.attemptCount === 'object'
        ? current.attemptCount + 1
        : current.attemptCount,
    };
    return { count: 1 };
  });
  return {
    repository: createPreviewRepository({ generatedCvPreview: { findFirst, updateMany } }),
    findFirst, updateMany, current: () => current,
  };
}

describe('preview persistence contract', () => {
  it('keeps the additive one-to-one owner-scoped schema without cross-user hash uniqueness', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('enum GeneratedCvPreviewStatus');
    expect(schema).toContain('enum GeneratedCvPreviewFailureCode');
    expect(schema).toMatch(/preview\s+GeneratedCvPreview\?/u);
    expect(schema).toMatch(/generatedCvId\s+String\s+@unique/u);
    expect(schema).toContain('@@index([userId, documentHash])');
    expect(schema).not.toContain('@@unique([userId, documentHash])');
    expect(schema).toContain('generationLeaseToken');
    expect(schema).toContain('validatedAiCheckpoint');
  });

  it('reuses an immutable READY preview without claiming work', async () => {
    const ready = row({ status: 'READY', failureCode: null, pageImageKeys: ['page-1.png', 'page-2.png'] });
    const h = harness(ready);
    await expect(h.repository.claimThumbnailRetry({
      userId: 'user-1', generatedCvId: 'cv-1', documentHash: 'hash-1', now: NOW,
    })).resolves.toEqual({ status: 'ready', preview: ready });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('claims recoverable failure and increments the bounded retry attempt', async () => {
    const h = harness(row());
    await expect(h.repository.claimThumbnailRetry({
      userId: 'user-1', generatedCvId: 'cv-1', documentHash: 'hash-1', now: NOW,
    })).resolves.toEqual({ status: 'claimed', previewId: 'preview-1', attemptCount: 2 });
    expect(h.current()).toMatchObject({
      status: 'RENDERING', failureCode: null, attemptCount: 2,
      leaseExpiresAt: new Date(NOW.getTime() + PREVIEW_LEASE_MS),
    });
  });

  it('returns contention for an unexpired render and reclaims an expired render', async () => {
    const active = harness(row({ status: 'RENDERING', failureCode: null, leaseExpiresAt: new Date(NOW.getTime() + 1) }));
    await expect(active.repository.claimThumbnailRetry({ userId: 'user-1', generatedCvId: 'cv-1', documentHash: 'hash-1', now: NOW }))
      .resolves.toEqual({ status: 'in_progress' });
    expect(active.updateMany).not.toHaveBeenCalled();

    const expired = harness(row({ status: 'RENDERING', failureCode: null, leaseExpiresAt: new Date(NOW.getTime() - 1) }));
    await expect(expired.repository.claimThumbnailRetry({ userId: 'user-1', generatedCvId: 'cv-1', documentHash: 'hash-1', now: NOW }))
      .resolves.toEqual({ status: 'claimed', previewId: 'preview-1', attemptCount: 2 });
    expect(expired.current()?.attemptCount).toBe(2);
  });

  it('rejects hash mismatch, terminal failure, missing metadata, and cross-owner reads', async () => {
    const h = harness(row());
    await expect(h.repository.claimThumbnailRetry({ userId: 'user-1', generatedCvId: 'cv-1', documentHash: 'wrong', now: NOW }))
      .rejects.toMatchObject({ code: 'PREVIEW_HASH_MISMATCH' });
    await expect(h.repository.loadOwnedPreview('user-2', 'cv-1')).resolves.toBeNull();

    const terminal = harness(row({ failureCode: 'PREVIEW_LEASE_EXPIRED' }));
    await expect(terminal.repository.claimThumbnailRetry({ userId: 'user-1', generatedCvId: 'cv-1', documentHash: 'hash-1', now: NOW }))
      .rejects.toBeInstanceOf(PreviewRepositoryError);

    const missing = harness(null);
    await expect(missing.repository.claimThumbnailRetry({ userId: 'user-1', generatedCvId: 'cv-1', documentHash: 'hash-1', now: NOW }))
      .rejects.toMatchObject({ code: 'PREVIEW_NOT_FOUND' });
    expect(missing.updateMany).not.toHaveBeenCalled();
  });

  it('allows identical hashes for separate owner-scoped rows', async () => {
    const first = harness(row({ userId: 'user-1', generatedCvId: 'cv-1' }));
    const second = harness(row({ id: 'preview-2', userId: 'user-2', generatedCvId: 'cv-2' }));
    await expect(first.repository.loadOwnedPreview('user-1', 'cv-1')).resolves.toMatchObject({ id: 'preview-1' });
    await expect(second.repository.loadOwnedPreview('user-2', 'cv-2')).resolves.toMatchObject({ id: 'preview-2' });
    await expect(first.repository.loadOwnedPreview('user-2', 'cv-1')).resolves.toBeNull();
  });

  it('uses strict lease expiry semantics', () => {
    expect(previewLeaseExpired(null, NOW)).toBe(true);
    expect(previewLeaseExpired(NOW, NOW)).toBe(true);
    expect(previewLeaseExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it('completes or fails only an owner-scoped rendering row', async () => {
    const ready = harness(row({
      status: 'RENDERING', failureCode: null,
      leaseExpiresAt: new Date(NOW.getTime() + PREVIEW_LEASE_MS),
    }));
    await expect(ready.repository.completePreview({
      userId: 'user-1', previewId: 'preview-1', documentHash: 'hash-1',
      attemptCount: 1,
      pageImageKeys: ['page-1.png', 'page-2.png'], pageImageSizes: [100, 110],
    })).resolves.toBe(true);
    expect(ready.current()).toMatchObject({
      status: 'READY', failureCode: null, leaseExpiresAt: null,
      pageImageKeys: ['page-1.png', 'page-2.png'],
    });

    const failed = harness(row({ status: 'RENDERING', failureCode: null }));
    await expect(failed.repository.failPreview({
      userId: 'user-1', previewId: 'preview-1', documentHash: 'hash-1',
      attemptCount: 1,
      failureCode: 'PREVIEW_STORAGE_FAILED',
    })).resolves.toBe(true);
    expect(failed.current()).toMatchObject({
      status: 'FAILED', failureCode: 'PREVIEW_STORAGE_FAILED', leaseExpiresAt: null,
    });

    await expect(failed.repository.completePreview({
      userId: 'user-2', previewId: 'preview-1', documentHash: 'hash-1',
      attemptCount: 1,
      pageImageKeys: ['page-1.png'], pageImageSizes: [100],
    })).resolves.toBe(false);
  });

  it('fences stale thumbnail workers after an expired lease is reclaimed', async () => {
    const h = harness(row({
      status: 'RENDERING', failureCode: null, attemptCount: 2,
      leaseExpiresAt: new Date(NOW.getTime() + PREVIEW_LEASE_MS),
    }));

    await expect(h.repository.completePreview({
      userId: 'user-1', previewId: 'preview-1', documentHash: 'hash-1',
      attemptCount: 1, pageImageKeys: ['stale.png'], pageImageSizes: [50],
    })).resolves.toBe(false);
    await expect(h.repository.failPreview({
      userId: 'user-1', previewId: 'preview-1', documentHash: 'hash-1',
      attemptCount: 1, failureCode: 'THUMBNAIL_RENDER_FAILED',
    })).resolves.toBe(false);
    expect(h.current()).toMatchObject({ status: 'RENDERING', attemptCount: 2 });

    await expect(h.repository.completePreview({
      userId: 'user-1', previewId: 'preview-1', documentHash: 'hash-1',
      attemptCount: 2, pageImageKeys: ['page-1.png'], pageImageSizes: [100],
    })).resolves.toBe(true);
    expect(h.current()).toMatchObject({ status: 'READY', attemptCount: 2 });
  });
});
