// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CvPreviewViewer from '../CvPreviewViewer';

const preview = (pages: 1 | 2) => ({
  status: 'READY' as const, failureCode: null, pageCount: pages,
  pages: Array.from({ length: pages }, (_, index) => `/page/${index + 1}`),
  pdfUrl: '/document.pdf', retryable: false,
});

afterEach(cleanup);

describe('CvPreviewViewer', () => {
  it('renders exactly the verified pages in order with navigation and downloads', async () => {
    const user = userEvent.setup();
    render(<CvPreviewViewer title="Platform CV" preview={preview(2)} docxUrl="/document.docx" onClose={vi.fn()} returnFocus={createRef()} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', '/page/1');
    expect(images[1]).toHaveAttribute('src', '/page/2');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText(/Page 2 of 2/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download DOCX' })).toHaveAttribute('href', '/document.docx');
    expect(screen.getByRole('link', { name: 'Download verified PDF' })).toHaveAttribute('href', '/document.pdf');
    expect(screen.getByTestId('cv-viewer-scroll')).toHaveClass('max-w-full', 'overflow-auto');
  });

  it('bounds zoom, reports loading/error states, closes, and restores focus', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const returnFocus = { current: opener };
    const user = userEvent.setup();
    render(<CvPreviewViewer title="One page" preview={preview(1)} docxUrl="/docx" onClose={onClose} returnFocus={returnFocus} />);
    expect(screen.getByText('Loading document preview…')).toBeVisible();
    fireEvent.load(screen.getByRole('img'));
    expect(screen.queryByText('Loading document preview…')).not.toBeInTheDocument();
    for (let index = 0; index < 10; index += 1) await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('keeps keyboard focus inside the modal', () => {
    render(<CvPreviewViewer title="One page" preview={preview(1)} docxUrl="/docx" onClose={vi.fn()} returnFocus={createRef()} />);
    const dialog = screen.getByRole('dialog', { name: 'One page preview' });
    const buttons = dialog.querySelectorAll<HTMLElement>('button, a[href]');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(buttons[0]).toHaveFocus();
  });
});
