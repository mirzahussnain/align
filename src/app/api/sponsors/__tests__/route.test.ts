import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Sponsor } from '@/shared/types/job';

const mocks = vi.hoisted(() => ({
  getSponsors: vi.fn(),
  getMetadata: vi.fn(),
  applyRateLimit: vi.fn(),
}));

vi.mock('@/shared/services/sponsor-registry', () => ({
  getSponsors: mocks.getSponsors,
  getSponsorRegisterMetadata: mocks.getMetadata,
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  sponsorsLimiter: {},
  applyRateLimit: mocks.applyRateLimit,
}));

import { GET } from '../route';

const indexedSponsors: Sponsor[] = [
  { organisationName: 'Acme Software', townCity: 'London', county: '', rating: 'Worker (A rating)', route: 'Skilled Worker', industry: 'Technology & Software' },
  { organisationName: 'North Care', townCity: 'Leeds', county: '', rating: 'Worker (A rating)', route: 'Skilled Worker', industry: 'Healthcare & Life Sciences' },
  { organisationName: 'Leeds Research', townCity: 'Leeds', county: '', rating: 'Worker (A rating)', route: 'Global Business Mobility', industry: 'Education & Research' },
];

describe('GET /api/sponsors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyRateLimit.mockResolvedValue(null);
    mocks.getSponsors.mockResolvedValue(indexedSponsors);
    mocks.getMetadata.mockResolvedValue({ releaseVersion: '2', registerVersion: 'v2-test', rowCount: 3, source: 'BUNDLED_RELEASE' });
  });

  it('summarizes the full indexed register before filtering and pagination', async () => {
    const response = await GET(new Request('https://align.test/api/sponsors?query=Acme&page=1&perPage=1') as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      sponsors: [{ organisationName: 'Acme Software' }],
      summary: {
        totalEntries: 3,
        locationCount: 2,
        topLocations: [
          { label: 'Leeds', count: 2, share: 66.7 },
          { label: 'London', count: 1, share: 33.3 },
        ],
      },
    });
  });
});
