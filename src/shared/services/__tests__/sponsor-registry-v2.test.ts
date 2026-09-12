import { describe, expect, it } from 'vitest';
import {
  getSponsorRegisterMetadata,
  getSponsors,
} from '@/shared/services/sponsor-registry';
import { filterSponsors } from '@/shared/utils/sponsor';

describe('bundled sponsor register release 2', () => {
  it('loads the complete pinned CSV and returns technology sponsors', async () => {
    const sponsors = await getSponsors();
    const metadata = await getSponsorRegisterMetadata();
    const technology = filterSponsors(sponsors, {
      query: '',
      route: 'all',
      industry: 'Technology & Software',
    });

    expect(sponsors).toHaveLength(142_644);
    expect(technology.length).toBeGreaterThan(0);
    expect(metadata).toMatchObject({
      releaseVersion: '2',
      publishedAt: '2026-07-29',
      rowCount: 142_644,
      source: 'BUNDLED_RELEASE',
    });
    expect(metadata.registerVersion).toMatch(/^v2-2026-07-29-[a-f0-9]{16}$/);
  });
});
