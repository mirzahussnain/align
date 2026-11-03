// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TemplateCarousel from '../TemplateCarousel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TemplateCarousel', () => {
  it('wraps with labelled controls and supports thumbnail and keyboard selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<TemplateCarousel template="architect" onTemplateChange={onChange} />);

    expect(screen.getByRole('heading', { name: 'Classic ATS' })).toBeVisible();
    expect(screen.getByText(/conservative single-column CV/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Previous template' }));
    expect(onChange).toHaveBeenLastCalledWith('academic_latex');
    await user.click(screen.getByRole('button', { name: 'Next template' }));
    expect(onChange).toHaveBeenLastCalledWith('editorial_refined');
    await user.click(screen.getByRole('button', { name: /Select Project-Focused template/i }));
    expect(onChange).toHaveBeenLastCalledWith('technical_precision');

    const carousel = screen.getByRole('region', { name: 'CV template selection' });
    fireEvent.keyDown(carousel, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('academic_latex');
    fireEvent.keyDown(carousel, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('architect');
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('academic_latex');
    fireEvent.keyDown(carousel, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('editorial_refined');

    rerender(<TemplateCarousel template="technical_precision" onTemplateChange={onChange} />);
    expect(screen.getByRole('button', { name: /Select Project-Focused template/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a larger preview, closes it with Escape, and restores opener focus', async () => {
    const user = userEvent.setup();
    render(<TemplateCarousel template="architect" onTemplateChange={vi.fn()} />);
    const opener = screen.getByRole('button', { name: 'View larger preview of Classic ATS' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Classic ATS preview' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close template preview' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Classic ATS preview' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('uses a deliberate horizontal swipe and ignores vertical movement', () => {
    const onChange = vi.fn();
    render(<TemplateCarousel template="architect" onTemplateChange={onChange} />);
    const preview = screen.getByTestId('template-preview-swipe-area');
    fireEvent.pointerDown(preview, { clientX: 180, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(preview, { clientX: 80, clientY: 88, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith('editorial_refined');
    onChange.mockClear();
    fireEvent.pointerDown(preview, { clientX: 100, clientY: 40, pointerId: 2 });
    fireEvent.pointerUp(preview, { clientX: 90, clientY: 150, pointerId: 2 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes transform motion when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    render(<TemplateCarousel template="architect" onTemplateChange={vi.fn()} />);
    expect(screen.getByTestId('template-preview-image')).toHaveAttribute('data-motion', 'reduced');
    expect(screen.getByTestId('template-preview-image')).not.toHaveStyle({ transform: expect.any(String) });
  });
});
