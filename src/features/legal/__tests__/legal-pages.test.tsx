// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LegalDocument from '../components/LegalDocument';
import Footer from '@/shared/components/layout/Footer';

vi.mock('@/shared/components/layout/Navbar', () => ({
  default: () => <nav aria-label="Primary navigation" />,
}));

describe('public legal pages', () => {
  it('renders an accessible legal document with a section index', () => {
    render(
      <LegalDocument
        title="Privacy Policy"
        summary="How Align handles your information."
        lastUpdated="21 September 2026"
        sections={[
          { id: 'collection', title: 'Information we collect', content: <p>Account information.</p> },
          { id: 'rights', title: 'Your privacy rights', content: <p>Your rights.</p> },
        ]}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    const sectionNav = screen.getByRole('navigation', { name: 'Legal document sections' });
    expect(sectionNav).toBeVisible();
    expect(within(sectionNav).getByRole('link', { name: 'Information we collect' })).toHaveAttribute('href', '#collection');
    expect(screen.getByRole('heading', { level: 2, name: 'Your privacy rights' })).toBeVisible();
  });

  it('exposes both legal routes from the shared footer', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });
});
