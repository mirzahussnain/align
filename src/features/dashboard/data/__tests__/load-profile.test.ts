import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    profileIdentity: { findUnique: vi.fn() },
    profile: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/shared/lib/prisma';
import { loadOwnedProfileData, loadProfileData } from '../load-profile';

const storedProfile = {
  id: 'profile-a',
  label: 'Healthcare',
  targetIndustry: 'healthcare',
  targetOccupation: 'healthcare_support',
  targetRoleTitle: 'Healthcare Assistant',
  targetSeniority: 'entry',
  tagline: null,
  professionalSummary: null,
  experience: [],
  projects: [],
  education: [],
  skillGroups: [
    {
      id: 'group-1',
      category: 'Care',
      skills: [{ id: 'skill-1', name: 'Safeguarding', sortOrder: 0 }],
      sortOrder: 0,
    },
  ],
  certifications: [
    { id: 'cert-1', name: 'Care Certificate', issuer: 'Skills for Care', year: '2025' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.profileIdentity.findUnique).mockResolvedValue(null);
});

describe('profile evidence loading', () => {
  it('loads individual skill ids and certifications with their database ids', async () => {
    vi.mocked(prisma.profile.findFirst).mockResolvedValue(storedProfile as never);

    const loaded = await loadProfileData('user-a', 'profile-a');

    expect(loaded.skills).toEqual([
      {
        id: 'group-1',
        category: 'Care',
        skills: ['Safeguarding'],
        skillItems: [{ id: 'skill-1', name: 'Safeguarding' }],
      },
    ]);
    expect(loaded.certifications).toEqual([
      { id: 'cert-1', name: 'Care Certificate', issuer: 'Skills for Care', year: '2025' },
    ]);
    expect(prisma.profile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-a', userId: 'user-a' },
        include: expect.objectContaining({
          skillGroups: expect.objectContaining({ include: expect.any(Object) }),
          certifications: expect.any(Object),
        }),
      })
    );
  });

  it('rejects an explicit profile that does not belong to the authenticated user', async () => {
    vi.mocked(prisma.profile.findFirst).mockResolvedValue(null);

    const loaded = await loadOwnedProfileData('user-a', 'profile-owned-by-user-b');

    expect(loaded).toBeNull();
    expect(prisma.profile.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.profile.findFirst).toHaveBeenCalledWith({
      where: { id: 'profile-owned-by-user-b', userId: 'user-a' },
      select: { id: true },
    });
  });
});
