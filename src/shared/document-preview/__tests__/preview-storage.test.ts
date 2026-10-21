import { describe, expect, it, vi } from 'vitest';
import {
  PreviewArtifactStorageError,
  previewArtifactKeys,
  storeValidatedArtifacts,
} from '../preview-storage';

const HASH = 'a'.repeat(64);

describe('private preview artifact storage', () => {
  it('builds deterministic owner/version/hash-scoped keys', () => {
    expect(previewArtifactKeys('user_1', 'cv-1', HASH, 2)).toEqual({
      pdfKey: `users/user_1/cv-1/previews/${HASH}/document.pdf`,
      pageImageKeys: [
        `users/user_1/cv-1/previews/${HASH}/page-1.png`,
        `users/user_1/cv-1/previews/${HASH}/page-2.png`,
      ],
    });
  });

  it.each([
    ['../user', 'cv-1', HASH],
    ['user-1', 'cv/1', HASH],
    ['user-1', 'cv-1', '../hash'],
  ])('rejects unsafe key input %#', (userId, generatedCvId, documentHash) => {
    expect(() => previewArtifactKeys(userId, generatedCvId, documentHash, 1)).toThrow('Invalid preview artifact identity');
  });

  it('uploads verified PDF before PNG pages with narrow content types', async () => {
    const upload = vi.fn(async ({ key }: { key: string; contentType: string }) => key);
    const remove = vi.fn(async () => true);
    const result = await storeValidatedArtifacts({
      userId: 'user-1', generatedCvId: 'cv-1', documentHash: HASH,
      pdf: Buffer.from('%PDF-valid'), pages: [Buffer.from('png-1'), Buffer.from('png-2')],
      storage: { upload, delete: remove },
    });
    expect(upload.mock.calls.map(([value]) => value.contentType)).toEqual([
      'application/pdf', 'image/png', 'image/png',
    ]);
    expect(upload.mock.calls.map(([value]) => value.key)).toEqual([
      result.pdfKey, ...result.pageImageKeys,
    ]);
    expect(result.sizes).toEqual({ pdf: 10, pages: [5, 5] });
    expect(remove).not.toHaveBeenCalled();
  });

  it('preserves a durable verified PDF and removes partial PNGs after page upload failure', async () => {
    const upload = vi.fn(async ({ contentType, key }: { contentType: string; key: string }) => {
      if (contentType === 'image/png' && key.endsWith('page-2.png')) throw new Error('R2 unavailable');
      return key;
    });
    const remove = vi.fn(async () => true);
    const promise = storeValidatedArtifacts({
      userId: 'user-1', generatedCvId: 'cv-1', documentHash: HASH,
      pdf: Buffer.from('%PDF-valid'), pages: [Buffer.from('png-1'), Buffer.from('png-2')],
      storage: { upload, delete: remove },
    });
    await expect(promise).rejects.toMatchObject({
      code: 'PREVIEW_STORAGE_FAILED',
      pdfArtifact: {
        key: `users/user-1/cv-1/previews/${HASH}/document.pdf`, size: 10,
      },
    });
    await expect(promise).rejects.toBeInstanceOf(PreviewArtifactStorageError);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(
      'rewrites', `users/user-1/cv-1/previews/${HASH}/page-1.png`,
    );
  });

  it('does not claim a durable artifact when the required PDF upload fails', async () => {
    const upload = vi.fn(async () => { throw new Error('R2 unavailable'); });
    const remove = vi.fn(async () => true);
    const promise = storeValidatedArtifacts({
      userId: 'user-1', generatedCvId: 'cv-1', documentHash: HASH,
      pdf: Buffer.from('%PDF-valid'), pages: [Buffer.from('png-1')],
      storage: { upload, delete: remove },
    });
    await expect(promise).rejects.toMatchObject({ code: 'PDF_STORAGE_FAILED', pdfArtifact: null });
    expect(remove).not.toHaveBeenCalled();
  });
});
