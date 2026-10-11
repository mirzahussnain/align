import { describe, expect, it } from 'vitest';

import {
  EMPTY_PRACTICAL_PREFERENCES,
  practicalPreferencesSchema,
} from '@/shared/schemas/practical-preferences';

describe('practicalPreferencesSchema', () => {
  it('accepts every supported relocation, commute and work-style value', () => {
    expect(practicalPreferencesSchema.parse({
      relocationPreference: 'CONSIDER',
      maxCommuteMinutes: 90,
      preferredWorkStyles: ['REMOTE', 'HYBRID', 'ONSITE'],
    })).toEqual({
      relocationPreference: 'CONSIDER',
      maxCommuteMinutes: 90,
      preferredWorkStyles: ['REMOTE', 'HYBRID', 'ONSITE'],
    });
  });

  it('normalises an omitted or empty preference set to no preference', () => {
    expect(practicalPreferencesSchema.parse({})).toEqual(EMPTY_PRACTICAL_PREFERENCES);
    expect(practicalPreferencesSchema.parse({
      relocationPreference: null,
      maxCommuteMinutes: null,
      preferredWorkStyles: [],
    })).toEqual(EMPTY_PRACTICAL_PREFERENCES);
  });

  it.each([0, 20, 120, -15, 30.5])('rejects unsupported commute value %s', (value) => {
    expect(practicalPreferencesSchema.safeParse({ maxCommuteMinutes: value }).success).toBe(false);
  });

  it('rejects unsupported and duplicate work styles', () => {
    expect(practicalPreferencesSchema.safeParse({ preferredWorkStyles: ['FLEXIBLE'] }).success).toBe(false);
    expect(practicalPreferencesSchema.safeParse({ preferredWorkStyles: ['REMOTE', 'REMOTE'] }).success).toBe(false);
  });

  it('rejects unsupported relocation values', () => {
    expect(practicalPreferencesSchema.safeParse({ relocationPreference: 'MAYBE' }).success).toBe(false);
  });
});
