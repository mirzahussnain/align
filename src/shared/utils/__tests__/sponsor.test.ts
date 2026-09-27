import { describe, expect, it } from 'vitest';
import { filterSponsors, summarizeSponsorRegister } from '@/shared/utils/sponsor';
import type { Sponsor } from '@/shared/types/job';

const sponsors: Sponsor[] = [
  {
    organisationName: 'Acme Software Limited',
    townCity: 'London',
    county: '',
    rating: 'Worker (A rating)',
    route: 'Skilled Worker',
    industry: 'Technology & Software',
  },
  {
    organisationName: 'Fixture Care Limited',
    townCity: 'Leeds',
    county: '',
    rating: 'Worker (A rating)',
    route: 'Skilled Worker',
    industry: 'Healthcare & Life Sciences',
  },
];

describe('filterSponsors', () => {
  it('matches mixed-case industry select values', () => {
    expect(filterSponsors(sponsors, {
      query: '',
      route: 'all',
      industry: 'Technology & Software',
    })).toEqual([sponsors[0]]);
  });

  it('treats free-text and route filters case-insensitively', () => {
    expect(filterSponsors(sponsors, {
      query: 'ACME',
      route: 'SKILLED WORKER',
      industry: 'all',
    })).toEqual([sponsors[0]]);
  });
});

describe('summarizeSponsorRegister', () => {
  it('derives distributions from the complete indexed register', () => {
    const fullRegister: Sponsor[] = [
      ...sponsors,
      {
        organisationName: 'North Research Institute',
        townCity: 'Leeds',
        county: '',
        rating: 'Worker (A rating)',
        route: 'Global Business Mobility, Skilled Worker',
        industry: 'Education & Research',
      },
    ];

    expect(summarizeSponsorRegister(fullRegister)).toEqual({
      totalEntries: 3,
      sectorCount: 3,
      locationCount: 2,
      routeCount: 2,
      topSectors: [
        { label: 'Education & Research', count: 1, share: 33.3 },
        { label: 'Healthcare & Life Sciences', count: 1, share: 33.3 },
        { label: 'Technology & Software', count: 1, share: 33.3 },
      ],
      topLocations: [
        { label: 'Leeds', count: 2, share: 66.7 },
        { label: 'London', count: 1, share: 33.3 },
      ],
      routeDistribution: [
        { label: 'Skilled Worker', count: 3, share: 100 },
        { label: 'Global Business Mobility', count: 1, share: 33.3 },
      ],
    });
  });

  it('combines sponsor locations that differ only by casing', () => {
    const summary = summarizeSponsorRegister([
      sponsors[0],
      { ...sponsors[1], townCity: 'LONDON' },
      { ...sponsors[1], organisationName: 'Third sponsor', townCity: ' london ' },
    ]);

    expect(summary.locationCount).toBe(1);
    expect(summary.topLocations).toEqual([
      { label: 'London', count: 3, share: 100 },
    ]);
  });

  it('keeps every genuine route in the distribution instead of truncating the chart data', () => {
    const manyRoutes = Array.from({ length: 8 }, (_, index): Sponsor => ({
      organisationName: `Sponsor ${index + 1}`,
      townCity: 'London',
      county: '',
      rating: 'Worker (A rating)',
      route: `Route ${index + 1}`,
      industry: 'General Business Services',
    }));

    expect(summarizeSponsorRegister(manyRoutes).routeDistribution).toHaveLength(8);
  });
});
