import { describe, it, expect } from 'vitest';
import { profileCompleteness, isProfileComplete, projectsExpectedFor } from '../profile-completeness';
import type { ProfileData } from '../load-profile';

function makeProfile(overrides: {
  targetOccupation: string;
  projects?: ProfileData['projects'];
}): ProfileData {
  return {
    profileId: 'p1',
    label: 'Test',
    targetIndustry: '',
    personal: {
      label: 'Test',
      fullName: 'Darren Holt',
      tagline: '',
      professionalSummary: 'Reliable warehouse operative.',
      targetOccupation: overrides.targetOccupation,
      targetRoleTitle: '',
      targetSeniority: '',
      targetIndustry: '',
      email: '',
      phoneDialCode: '',
      phoneNumber: '',
      phoneCountry: '',
      city: '',
      state: '',
      country: '',
      website: '',
      linkedin: '',
      github: '',
      visaStatus: '',
      visaExpiry: '',
    },
    experience: [
      { jobTitle: 'Op', company: 'Co', location: '', type: '', startDate: '2021-01', endDate: '', current: true, achievements: [] },
    ],
    projects: overrides.projects ?? [],
    education: [
      { degree: 'GCSEs', university: 'School', startDate: '2016-09', endDate: '2018-06', current: false, grade: '', description: '' },
    ],
    skills: [{ category: 'Core', skills: ['Picking'] }],
  };
}

describe('projectsExpectedFor', () => {
  it('expects projects for software engineers only', () => {
    expect(projectsExpectedFor('software_engineer')).toBe(true);
    expect(projectsExpectedFor('warehouse_operative')).toBe(false);
    expect(projectsExpectedFor('registered_nurse')).toBe(false);
    expect(projectsExpectedFor('administrator')).toBe(false);
    expect(projectsExpectedFor('generic')).toBe(false);
    expect(projectsExpectedFor('')).toBe(false);
  });
});

describe('occupation-aware completeness', () => {
  it('a warehouse profile reaches 100% with no projects', () => {
    const profile = makeProfile({ targetOccupation: 'warehouse_operative' });
    expect(profileCompleteness(profile)).toBe(100);
    expect(isProfileComplete(profile)).toBe(true);
  });

  it('a software profile without projects is incomplete', () => {
    const profile = makeProfile({ targetOccupation: 'software_engineer' });
    expect(isProfileComplete(profile)).toBe(false);
  });

  it('a software profile with projects is complete', () => {
    const profile = makeProfile({
      targetOccupation: 'software_engineer',
      projects: [{ name: 'CourtBook', stack: 'Next.js', startDate: '', endDate: '', achievements: [] }],
    });
    expect(isProfileComplete(profile)).toBe(true);
  });
});
