import { describe, expect, it } from 'vitest';

import { buildMatchPracticalCompatibility } from '@/shared/services/job-match-practical-compatibility';

describe('match-time practical compatibility', () => {
  it('uses only the supplied profile snapshot facts and vacancy revision metadata', () => {
    const revision = {
      description: 'Relocation is required. This is a hybrid role.',
      providerMetadataJson: {
        city: 'Glasgow',
        region: 'Scotland',
        country: 'United Kingdom',
        locationText: 'Glasgow',
        workStyle: 'HYBRID',
      },
      sponsorshipMetadataJson: { vacancySponsorshipSignal: 'NOT_MENTIONED' },
    };

    const stored = buildMatchPracticalCompatibility({
      jobRevision: revision,
      practicalFacts: {
        professionalRegistrations: [],
        homeCity: 'Birmingham',
        relocationPreference: 'NO',
        preferredWorkStyles: ['REMOTE'],
      },
    });
    const laterPreferences = buildMatchPracticalCompatibility({
      jobRevision: revision,
      practicalFacts: {
        professionalRegistrations: [],
        homeCity: 'Birmingham',
        relocationPreference: 'YES',
        preferredWorkStyles: ['HYBRID'],
      },
    });

    expect(stored.items.find((item) => item.category === 'RELOCATION')?.state).toBe('CONFLICT');
    expect(stored.items.find((item) => item.category === 'REMOTE_ONSITE')?.state).toBe('CONFLICT');
    expect(stored.items.find((item) => item.category === 'LOCATION')?.state).toBe('UNKNOWN');
    expect(laterPreferences.items.find((item) => item.category === 'RELOCATION')?.state).toBe('CONFIRMED');
    expect(laterPreferences.items.find((item) => item.category === 'REMOTE_ONSITE')?.state).toBe('CONFIRMED');
  });
});
