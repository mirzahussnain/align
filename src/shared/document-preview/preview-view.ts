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

export interface PreviewSummaryProjection {
  status: PreviewStatus;
  failureCode: PreviewFailureCode | null;
  pageCount: number | null;
}

export function toCvPreviewSummary(
  generatedCvId: string,
  preview: PreviewSummaryProjection | null,
): CvPreviewView | null {
  if (!preview) return null;
  const pageCount = preview.pageCount === 1 || preview.pageCount === 2
    ? preview.pageCount
    : null;
  const ready = preview.status === 'READY' && pageCount !== null;
  const verifiedPdf = pageCount !== null &&
    (preview.status === 'READY' || preview.status === 'FAILED');
  return {
    status: ready ? 'READY' : preview.status,
    failureCode: preview.failureCode,
    pageCount,
    pages: ready
      ? Array.from({ length: pageCount }, (_, index) =>
        `/api/cv/${encodeURIComponent(generatedCvId)}/preview/pages/${index + 1}`)
      : [],
    pdfUrl: verifiedPdf ? `/api/cv/${encodeURIComponent(generatedCvId)}/pdf` : null,
    retryable: verifiedPdf && preview.status === 'FAILED' &&
      (preview.failureCode === 'THUMBNAIL_RENDER_FAILED' ||
        preview.failureCode === 'PREVIEW_STORAGE_FAILED'),
  };
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
