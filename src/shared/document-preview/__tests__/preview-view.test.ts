import { describe, expect, it } from 'vitest';
import { toCvPreviewSummary } from '../preview-view';

describe('toCvPreviewSummary', () => {
  it('projects application URLs without accepting or exposing storage keys', () => {
    expect(toCvPreviewSummary('cv/private id', {
      status: 'READY', failureCode: null, pageCount: 2,
    })).toEqual({
      status: 'READY', failureCode: null, pageCount: 2,
      pages: [
        '/api/cv/cv%2Fprivate%20id/preview/pages/1',
        '/api/cv/cv%2Fprivate%20id/preview/pages/2',
      ],
      pdfUrl: '/api/cv/cv%2Fprivate%20id/pdf', retryable: false,
    });
  });

  it('keeps missing metadata unavailable and exposes only explicit verified-PDF retry', () => {
    expect(toCvPreviewSummary('cv-1', null)).toBeNull();
    expect(toCvPreviewSummary('cv-1', {
      status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED', pageCount: 1,
    })).toMatchObject({ pages: [], pdfUrl: '/api/cv/cv-1/pdf', retryable: true });
    expect(toCvPreviewSummary('cv-1', {
      status: 'FAILED', failureCode: 'PREVIEW_LEASE_EXPIRED', pageCount: null,
    })).toMatchObject({ pages: [], pdfUrl: null, retryable: false });
  });
});
