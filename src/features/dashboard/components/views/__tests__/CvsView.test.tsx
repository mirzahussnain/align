// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CvsView from '../CvsView';
import type { CvRow } from '../../DashboardShell';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/features/cv-generation/components/CvGenerationWizard', () => ({
  default: () => null,
}));

const row: CvRow = {
  id: 'cv-1', createdAt: '2026-10-20T12:00:00.000Z', template: 'architect',
  title: 'Platform CV', jobMatchId: null, versionNumber: 1, sourceFileName: null,
  jobTitle: null, jobCompany: null, matchScore: null, profileLabel: 'Engineering',
  preview: {
    status: 'READY', failureCode: null, pageCount: 1,
    pages: ['/api/cv/cv-1/preview/pages/1'], pdfUrl: '/api/cv/cv-1/pdf', retryable: false,
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('CvsView', () => {
  it('renders projected previews directly without conversion, backfill, or viewport observers', () => {
    const fetchMock = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('IntersectionObserver', vi.fn(() => ({ observe, disconnect: vi.fn(), unobserve: vi.fn() })));
    render(<CvsView cvs={[row]} analyses={[]} profileComplete activeProfileId="profile-1" activeProfileLabel="Engineering" profileReasoning reasoningRemaining={3} />);
    expect(screen.getByRole('img', { name: 'Preview of Platform CV' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it('opens and closes the controlled viewer with focus restoration', async () => {
    const user = userEvent.setup();
    render(<CvsView cvs={[row]} analyses={[]} profileComplete activeProfileId="profile-1" activeProfileLabel="Engineering" profileReasoning reasoningRemaining={3} />);
    const opener = screen.getByRole('button', { name: 'Preview CV' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Platform CV preview' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Platform CV preview' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('retries only after an explicit user action', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'READY' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CvsView cvs={[{
      ...row,
      preview: {
        status: 'FAILED', failureCode: 'THUMBNAIL_RENDER_FAILED', pageCount: 1,
        pages: [], pdfUrl: '/api/cv/cv-1/pdf', retryable: true,
      },
    }]} analyses={[]} profileComplete activeProfileId="profile-1" activeProfileLabel="Engineering" profileReasoning reasoningRemaining={3} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retry thumbnail' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/cv/cv-1/preview', { method: 'POST' });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
