import 'server-only';
import { storage as defaultStorage } from '@/shared/lib/storage';

const safeIdentifier = /^[A-Za-z0-9_-]{1,128}$/u;
const documentHashPattern = /^[a-f0-9]{64}$/u;

interface PreviewStorage {
  upload(input: {
    bucket: 'rewrites';
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<string>;
  delete(bucket: 'rewrites', key: string): Promise<boolean>;
}

export interface StoredPdfArtifact {
  key: string;
  size: number;
}

export async function storeValidatedPdf(input: {
  userId: string;
  generatedCvId: string;
  documentHash: string;
  pageCount: 1 | 2;
  pdf: Buffer;
  storage?: PreviewStorage;
}): Promise<StoredPdfArtifact> {
  const { pdfKey } = previewArtifactKeys(
    input.userId,
    input.generatedCvId,
    input.documentHash,
    input.pageCount,
  );
  try {
    await (input.storage ?? defaultStorage).upload({
      bucket: 'rewrites', key: pdfKey, body: input.pdf, contentType: 'application/pdf',
    });
  } catch {
    throw new PreviewArtifactStorageError('PDF_STORAGE_FAILED', null);
  }
  return { key: pdfKey, size: input.pdf.byteLength };
}

export class PreviewArtifactStorageError extends Error {
  constructor(
    readonly code: 'PDF_STORAGE_FAILED' | 'PREVIEW_STORAGE_FAILED',
    readonly pdfArtifact: StoredPdfArtifact | null,
  ) {
    super(code === 'PDF_STORAGE_FAILED'
      ? 'The verified PDF could not be stored'
      : 'The document preview images could not be stored');
    this.name = 'PreviewArtifactStorageError';
  }
}

export function previewArtifactKeys(
  userId: string,
  generatedCvId: string,
  documentHash: string,
  pageCount: 1 | 2,
) {
  if (
    !safeIdentifier.test(userId) ||
    !safeIdentifier.test(generatedCvId) ||
    !documentHashPattern.test(documentHash) ||
    (pageCount !== 1 && pageCount !== 2)
  ) {
    throw new Error('Invalid preview artifact identity');
  }
  const prefix = `users/${userId}/${generatedCvId}/previews/${documentHash}`;
  return {
    pdfKey: `${prefix}/document.pdf`,
    pageImageKeys: Array.from(
      { length: pageCount },
      (_, index) => `${prefix}/page-${index + 1}.png`,
    ),
  };
}

export async function storeValidatedArtifacts(input: {
  userId: string;
  generatedCvId: string;
  documentHash: string;
  pdf: Buffer;
  pages: Buffer[];
  storage?: PreviewStorage;
}) {
  if (input.pages.length !== 1 && input.pages.length !== 2) {
    throw new Error('Validated previews require exactly one or two pages');
  }
  const pageCount = input.pages.length as 1 | 2;
  const keys = previewArtifactKeys(
    input.userId,
    input.generatedCvId,
    input.documentHash,
    pageCount,
  );
  const objectStorage = input.storage ?? defaultStorage;
  const pdfArtifact = await storeValidatedPdf({
    ...input,
    pageCount,
    storage: objectStorage,
  });
  const uploadedPages: string[] = [];
  try {
    for (let index = 0; index < input.pages.length; index += 1) {
      const key = keys.pageImageKeys[index];
      await objectStorage.upload({
        bucket: 'rewrites', key, body: input.pages[index], contentType: 'image/png',
      });
      uploadedPages.push(key);
    }
  } catch {
    await Promise.all(uploadedPages.map((key) => objectStorage.delete('rewrites', key)));
    throw new PreviewArtifactStorageError('PREVIEW_STORAGE_FAILED', pdfArtifact);
  }

  return {
    pdfKey: keys.pdfKey,
    pageImageKeys: keys.pageImageKeys,
    sizes: {
      pdf: input.pdf.byteLength,
      pages: input.pages.map((page) => page.byteLength),
    },
  };
}

export async function storeRenderedPages(input: {
  userId: string;
  generatedCvId: string;
  documentHash: string;
  pages: Buffer[];
  storage?: PreviewStorage;
}) {
  if (input.pages.length !== 1 && input.pages.length !== 2) {
    throw new Error('Validated previews require exactly one or two pages');
  }
  const keys = previewArtifactKeys(
    input.userId,
    input.generatedCvId,
    input.documentHash,
    input.pages.length as 1 | 2,
  );
  const objectStorage = input.storage ?? defaultStorage;
  const uploaded: string[] = [];
  try {
    for (let index = 0; index < input.pages.length; index += 1) {
      const key = keys.pageImageKeys[index];
      await objectStorage.upload({
        bucket: 'rewrites', key, body: input.pages[index], contentType: 'image/png',
      });
      uploaded.push(key);
    }
  } catch {
    await Promise.all(uploaded.map((key) => objectStorage.delete('rewrites', key)));
    throw new PreviewArtifactStorageError('PREVIEW_STORAGE_FAILED', null);
  }
  return {
    pageImageKeys: keys.pageImageKeys,
    pageImageSizes: input.pages.map((page) => page.byteLength),
  };
}
