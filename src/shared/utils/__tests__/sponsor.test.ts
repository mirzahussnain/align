import { describe, expect, it } from 'vitest';
import { filterSponsors } from '@/shared/utils/sponsor';
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
