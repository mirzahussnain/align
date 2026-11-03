// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PricingSection from '../PricingSection';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...props }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => {
      void initial;
      void whileInView;
      void viewport;
      void transition;
      return <div {...props}>{children}</div>;
    },
    article: ({ children, initial, whileInView, viewport, transition, ...props }: React.HTMLAttributes<HTMLElement> & Record<string, unknown>) => {
      void initial;
      void whileInView;
      void viewport;
      void transition;
      return <article {...props}>{children}</article>;
    },
  },
}));

describe('PricingSection', () => {
  it('shows concise plan cards with immediately available signup actions', () => {
    render(<PricingSection />);

    expect(screen.getByRole('heading', { name: 'Simple pricing for your job search' })).toBeInTheDocument();
    const free = screen.getByRole('article', { name: 'Free plan' });
    const pro = screen.getByRole('article', { name: 'Pro plan' });

    expect(within(free).getAllByRole('listitem')).toHaveLength(4);
    expect(within(pro).getAllByRole('listitem')).toHaveLength(5);
    expect(within(free).getByRole('link', { name: /get started free/i })).toHaveAttribute('href', '/signup');
    expect(within(pro).getByRole('link', { name: /upgrade to pro/i })).toHaveAttribute('href', '/signup');
  });

  it('keeps the complete comparison collapsed by default', () => {
    const { container } = render(<PricingSection />);
    const comparison = container.querySelector('details');

    expect(comparison).not.toBeNull();
    if (!comparison) throw new Error('Expected pricing comparison details');
    expect(comparison).not.toHaveAttribute('open');
    expect(within(comparison).getByText('CV Analysis & Tailoring')).toBeInTheDocument();
    expect(within(comparison).getByText('Career Profiles & Storage')).toBeInTheDocument();
    expect(within(comparison).getByText('Uploaded CV retention')).toBeInTheDocument();
  });
});
