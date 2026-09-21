// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LegalSectionNav from '../components/LegalSectionNav';

const sections = [
  { id: 'agreement', title: 'Your agreement with Align' },
  { id: 'service', title: 'What Align provides' },
] as const;

describe('LegalSectionNav', () => {
  it('marks the current section and updates immediately when a tab is selected', () => {
    render(<LegalSectionNav sections={sections} ariaLabel="Legal document sections" />);

    const first = screen.getByRole('link', { name: 'Your agreement with Align' });
    const second = screen.getByRole('link', { name: 'What Align provides' });

    expect(first).toHaveAttribute('aria-current', 'location');
    expect(first).toHaveClass('border-cyan-500', 'text-slate-950');
    expect(second).toHaveClass('hover:border-cyan-400', 'hover:text-slate-950');

    fireEvent.click(second);

    expect(first).not.toHaveAttribute('aria-current');
    expect(second).toHaveAttribute('aria-current', 'location');
  });
});
