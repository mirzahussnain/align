import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    profileIdentity: { findUnique: vi.fn() },
    profilePracticalFacts: { findUnique: vi.fn() },
    profile: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/shared/lib/prisma';
import { EMPTY_PRACTICAL_PREFERENCES } from '@/shared/schemas/practical-preferences';
import { loadProfileData } from '../load-profile';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.profileIdentity.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.profile.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.profilePracticalFacts.findUnique).mockResolvedValue(null);
});

describe('practical preference profile loading', () => {
  it('hydrates the canonical preferences saved for the authenticated user', async () => {
    vi.mocked(prisma.profilePracticalFacts.findUnique).mockResolvedValue({
      relocationPreference: 'CONSIDER',
      maxCommuteMinutes: 45,
      preferredWorkStyles: ['REMOTE', 'HYBRID'],
    } as never);

    const loaded = await loadProfileData('user-a');

    expect(loaded.practicalPreferences).toEqual({
      relocationPreference: 'CONSIDER',
      maxCommuteMinutes: 45,
      preferredWorkStyles: ['REMOTE', 'HYBRID'],
    });
    expect(prisma.profilePracticalFacts.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      select: {
        relocationPreference: true,
        maxCommuteMinutes: true,
        preferredWorkStyles: true,
      },
    });
  });

  it('returns empty preferences for an existing account without a practical-facts row', async () => {
    const loaded = await loadProfileData('user-a');
    expect(loaded.practicalPreferences).toEqual(EMPTY_PRACTICAL_PREFERENCES);
  });
});
