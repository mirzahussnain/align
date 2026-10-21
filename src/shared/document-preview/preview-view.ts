import type { PreviewFailureCode, PreviewStatus } from './types';

export interface CvPreviewView {
  status: PreviewStatus;
  failureCode: PreviewFailureCode | null;
  pageCount: 1 | 2 | null;
  pages: string[];
  pdfUrl: string | null;
  retryable: boolean;
}

interface PreviewProjection {
  status: PreviewStatus;
  failureCode: PreviewFailureCode | null;
  pageCount: number | null;
  pdfKey: string | null;
  pageImageKeys: string[];
}

export function toCvPreviewView(generatedCvId: string, preview: PreviewProjection): CvPreviewView {
  const pageCount = preview.pageCount === 1 || preview.pageCount === 2
    ? preview.pageCount
    : null;
  const ready = preview.status === 'READY' &&
    pageCount !== null &&
    preview.pageImageKeys.length === pageCount;
  return {
    status: ready ? 'READY' : preview.status,
    failureCode: preview.failureCode,
    pageCount,
    pages: ready
      ? Array.from({ length: pageCount }, (_, index) =>
        `/api/cv/${encodeURIComponent(generatedCvId)}/preview/pages/${index + 1}`)
      : [],
    pdfUrl: pageCount !== null && preview.pdfKey
      ? `/api/cv/${encodeURIComponent(generatedCvId)}/pdf`
      : null,
    retryable: preview.status === 'FAILED' &&
      (preview.failureCode === 'THUMBNAIL_RENDER_FAILED' ||
        preview.failureCode === 'PREVIEW_STORAGE_FAILED'),
  };
}
