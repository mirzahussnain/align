// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/components/layout/Navbar', () => ({ default: () => <nav>Navigation</nav> }));
vi.mock('@/features/immigration/components/VisaRouteDetails', () => ({ default: () => <div>Visa route details</div> }));
vi.mock('@/features/immigration/hooks/useSponsors', () => ({
  useSponsors: () => ({
    query: '', setQuery: vi.fn(), route: 'all', setRoute: vi.fn(), industry: 'all', setIndustry: vi.fn(),
    sponsors: [{ organisationName: 'Acme Ltd', townCity: 'London', industry: 'Technology & Software', route: 'Skilled Worker' }],
    total: 1, isLoading: false, page: 1, error: undefined,
    register: { publishedAt: '2026-09-01', releaseVersion: '1', rowCount: 1, source: 'BUNDLED_RELEASE' },
    summary: { totalEntries: 1, locationCount: 1, routeCount: 1, topSectors: [], topLocations: [], routeDistribution: [] },
    handlePageChange: vi.fn(),
  }),
}));

import SponsorshipVisasPage from '../page';

afterEach(cleanup);

describe('Sponsorship & Visas page', () => {
  it('does not offer a role-keyword job search as an employer action', () => {
    render(<SponsorshipVisasPage />);

    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /action/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view jobs/i })).not.toBeInTheDocument();
  });
});
