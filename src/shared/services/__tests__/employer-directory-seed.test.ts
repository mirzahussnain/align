import { describe, expect, it } from 'vitest';
import { EMPLOYER_DIRECTORY_SEED } from '@/shared/services/employer-directory-seed';

describe('production employer directory seed', () => {
  it('contains only the approved initial ATS catalogue', () => {
    const catalogue = EMPLOYER_DIRECTORY_SEED.flatMap((employer) =>
      employer.sources.map((source) => ({
        employer: employer.displayName,
        industry: employer.industry,
        provider: source.provider,
        identifier: source.providerIdentifier,
      })),
    );

    expect(catalogue).toEqual([
      { employer: 'Deliveroo', industry: 'Food delivery and logistics', provider: 'GREENHOUSE', identifier: 'deliveroo' },
      { employer: 'Gymshark', industry: 'Consumer apparel and retail', provider: 'GREENHOUSE', identifier: 'gymshark' },
      { employer: 'Ogilvy UK', industry: 'Advertising and communications', provider: 'GREENHOUSE', identifier: 'ogilvyuk' },
      { employer: 'Pay.UK', industry: 'Payments infrastructure', provider: 'GREENHOUSE', identifier: 'payuk' },
      { employer: 'Octopus Energy Group', industry: 'Energy and utilities', provider: 'LEVER', identifier: 'octoenergy' },
      { employer: 'Avalere Health', industry: 'Healthcare consulting', provider: 'LEVER', identifier: 'avalerehealth' },
      { employer: 'Airalo', industry: 'Travel connectivity', provider: 'LEVER', identifier: 'airalo' },
      { employer: 'Pattern', industry: 'E-commerce', provider: 'LEVER', identifier: 'pattern' },
      { employer: 'Neko Health', industry: 'Preventative healthcare', provider: 'ASHBY', identifier: 'neko-health' },
      { employer: 'Checkatrade', industry: 'Home-services marketplace', provider: 'ASHBY', identifier: 'checkatrade' },
      { employer: 'Ashby', industry: 'Recruiting software', provider: 'ASHBY', identifier: 'Ashby' },
      { employer: 'CUBE', industry: 'Regulatory technology', provider: 'ASHBY', identifier: 'CUBE' },
    ]);
  });
});
