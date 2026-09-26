// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/components/layout/Navbar', () => ({ default: () => <nav>Navigation</nav> }));
vi.mock('@/features/immigration/components/VisaRouteDetails', () => ({ default: () => <div>Visa route details</div> }));
vi.mock('@/features/immigration/hooks/useSponsors', () => ({
  useSponsors: () => ({
    query: '', setQuery: vi.fn(), route: 'all', setRoute: vi.fn(), industry: 'all', setIndustry: vi.fn(),
    sponsors: [{ organisationName: 'Acme Ltd', townCity: 'London', industry: 'Technology & Software', route: 'Skilled Worker' }],
    total: 1, isLoading: false, page: 1, error: undefined,
    register: { publishedAt: '2026-09-01', releaseVersion: '1', rowCount: 1, source: 'BUNDLED_RELEASE' },
    summary: { totalEntries: 12_000, locationCount: 1, routeCount: 2, topSectors: [], topLocations: [], routeDistribution: [
      { label: 'Skilled Worker', count: 10_000, share: 83.3 },
      { label: 'Global Business Mobility: Senior or Specialist Worker', count: 2_000, share: 16.7 },
    ] },
    handlePageChange: vi.fn(),
  }),
}));

import SponsorshipVisasPage from '../page';

afterEach(cleanup);

describe('Sponsorship & Visas page', () => {
  it('uses distinct restrained gradients for the overview cards', () => {
    render(<SponsorshipVisasPage />);

    const cards = [
      screen.getByTestId('visas-overview-card'),
      screen.getByTestId('visas-indexed-card'),
      screen.getByTestId('visas-breadth-card'),
    ];

    cards.forEach((card) => {
      expect(card.className).toContain('linear-gradient');
      expect(card).not.toHaveClass('bg-white');
    });
    expect(new Set(cards.map((card) => card.className)).size).toBe(3);
  });

  it('does not offer a role-keyword job search as an employer action', () => {
    render(<SponsorshipVisasPage />);

    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /action/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view jobs/i })).not.toBeInTheDocument();
  });

  it('keeps every route accessible and exposes persistent details through keyboard-equivalent controls', async () => {
    const user = userEvent.setup();
    render(<SponsorshipVisasPage />);

    const routeControl = screen.getByRole('combobox', { name: /all routes/i });
    expect(screen.getAllByText('Skilled Worker').length).toBeGreaterThan(0);
    expect(screen.queryByText(/hover, tap, or choose a category/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /10,000 sponsors.*83.3%/i })).not.toBeInTheDocument();

    await user.selectOptions(routeControl, 'Global Business Mobility: Senior or Specialist Worker');
    expect(screen.getByRole('status')).toHaveTextContent('Global Business Mobility: Senior or Specialist Worker');
    expect(screen.getByRole('status')).toHaveTextContent('2,000 sponsors');
    expect(screen.getByRole('status')).toHaveTextContent('16.7% of indexed sponsors');
  });
});
