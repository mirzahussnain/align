// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeneratedCvCard from '../GeneratedCvCard';
import type { CvRow } from '../../DashboardShell';

const cv = (preview: CvRow['preview']): CvRow => ({
  id: 'cv-1', createdAt: '2026-10-20T12:00:00.000Z', template: 'architect',
  title: 'Platform Engineer CV', jobMatchId: null, versionNumber: 1,
  sourceFileName: null, jobTitle: null, jobCompany: null, matchScore: null,
  profileLabel: 'Software Engineering', preview,
});

afterEach(cleanup);

describe('GeneratedCvCard', () => {
  it('shows the real lazy thumbnail, metadata, and all verified actions', async () => {
    const onPreview = vi.fn();
    const user = userEvent.setup();
    render(<GeneratedCvCard cv={cv({
      status: 'READY', failureCode: null, pageCount: 2,
      pages: ['/api/cv/cv-1/preview/pages/1', '/api/cv/cv-1/preview/pages/2'],
      pdfUrl: '/api/cv/cv-1/pdf', retryable: false,
    })} onPreview={onPreview} onRetryPreview={vi.fn()} />);

    const image = screen.getByRole('img', { name: 'Preview of Platform Engineer CV' });
    expect(image).toHaveAttribute('src', '/api/cv/cv-1/preview/pages/1');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('Classic ATS')).toBeVisible();
    expect(screen.getByText('20 Oct 2026')).toBeVisible();
    expect(screen.getByText('Ready · 2 pages')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download DOCX' })).toHaveAttribute('href', '/api/cv/cv-1/download');
    expect(screen.getByRole('link', { name: 'Download verified PDF' })).toHaveAttribute('href', '/api/cv/cv-1/pdf');
    await user.click(screen.getByRole('button', { name: 'Preview CV' }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'cv-1' }), expect.any(HTMLElement));
  });

  it.each([
    ['missing', null],
    ['pending', { status: 'PENDING', failureCode: null, pageCount: null, pages: [], pdfUrl: null, retryable: false }],
    ['corrupt ready', { status: 'READY', failureCode: null, pageCount: 2, pages: [], pdfUrl: '/api/cv/cv-1/pdf', retryable: false }],
  ] satisfies Array<[string, CvRow['preview']]>)('uses an inert A4 placeholder for %s metadata', (_label, preview) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<GeneratedCvCard cv={cv(preview)} onPreview={vi.fn()} onRetryPreview={vi.fn()} />);
    expect(screen.getByTestId('cv-preview-placeholder')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Preview CV' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers manual retry only for a recoverable thumbnail failure with verified PDF', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<GeneratedCvCard cv={cv({
      status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED', pageCount: 1,
      pages: [], pdfUrl: '/api/cv/cv-1/pdf', retryable: true,
    })} onPreview={vi.fn()} onRetryPreview={retry} />);
    await user.click(screen.getByRole('button', { name: 'Retry thumbnail' }));
    expect(retry).toHaveBeenCalledWith('cv-1');
    expect(screen.getByRole('link', { name: 'Download verified PDF' })).toBeVisible();
  });
});
