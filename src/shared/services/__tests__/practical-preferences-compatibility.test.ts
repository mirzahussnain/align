import { describe, expect, it } from 'vitest';

import { extractVacancyRequirements } from '@/shared/services/job-intelligence';
import {
  assessLocationCompatibility,
  comparePracticalCompatibility,
} from '@/shared/services/practical-compatibility';
import type { ConfirmedCandidateFacts } from '@/shared/types/practical-compatibility';

const facts = (overrides: Partial<ConfirmedCandidateFacts> = {}): ConfirmedCandidateFacts => ({
  professionalRegistrations: [],
  ...overrides,
});

describe('relocation and work-style preferences', () => {
  it('never infers a relocation conflict from a different city', () => {
    const result = assessLocationCompatibility(
      facts({ homeCity: 'Birmingham', relocationPreference: 'NO' }),
      { city: 'Glasgow', locationText: 'Glasgow' },
    );

    expect(result.state).toBe('UNKNOWN');
    expect(result.explanation).toMatch(/journey|location/i);
  });

  it('compares every explicit vacancy work style with the selected set', () => {
    const remote = comparePracticalCompatibility([], facts({ preferredWorkStyles: ['REMOTE', 'HYBRID'] }), {
      workStyle: 'REMOTE',
    });
    const onsite = comparePracticalCompatibility([], facts({ preferredWorkStyles: ['REMOTE'] }), {
      workStyle: 'ONSITE',
    });
    const unselected = comparePracticalCompatibility([], facts(), { workStyle: 'HYBRID' });

    expect(remote.items.find((item) => item.category === 'REMOTE_ONSITE')?.state).toBe('CONFIRMED');
    expect(onsite.items.find((item) => item.category === 'REMOTE_ONSITE')).toMatchObject({
      state: 'CONFLICT',
      source: 'BOTH',
    });
    expect(onsite.items.find((item) => item.category === 'REMOTE_ONSITE')?.explanation).toMatch(
      /preference mismatch/i,
    );
    expect(unselected.items.find((item) => item.category === 'REMOTE_ONSITE')?.state).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('extracts only explicit mandatory relocation requirements', () => {
    expect(extractVacancyRequirements('Relocation is required before your start date.')).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'RELOCATION', requirement: 'REQUIRED' })]),
    );
    expect(extractVacancyRequirements('You must relocate to Glasgow for this role.')).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'RELOCATION', requirement: 'REQUIRED' })]),
    );
    expect(extractVacancyRequirements('Relocation assistance is available.')).toEqual([]);
    expect(extractVacancyRequirements('Optional relocation may be considered.')).toEqual([]);
    expect(extractVacancyRequirements('This position is based in another city.')).toEqual([]);
  });

  it('compares explicit mandatory relocation with YES, NO, CONSIDER and unknown', () => {
    const requirements = extractVacancyRequirements('Relocation is mandatory for this position.');
    const item = (preference?: 'YES' | 'NO' | 'CONSIDER') =>
      comparePracticalCompatibility(
        requirements,
        facts(preference ? { relocationPreference: preference } : {}),
      ).items.find((candidate) => candidate.category === 'RELOCATION');

    expect(item('YES')?.state).toBe('CONFIRMED');
    expect(item('NO')).toMatchObject({ state: 'CONFLICT', source: 'BOTH' });
    expect(item('NO')?.explanation).toMatch(/preference mismatch/i);
    expect(item('CONSIDER')?.state).toBe('UNKNOWN');
    expect(item()?.state).toBe('UNKNOWN');
  });
});
