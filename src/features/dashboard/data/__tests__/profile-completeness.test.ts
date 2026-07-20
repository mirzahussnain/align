import { describe, it, expect } from 'vitest';
import {
  profileCompleteness,
  isProfileComplete,
  projectsExpectedFor,
  projectsPresenceFor,
  projectsSectionVisible,
  evaluateProfileCompleteness,
  toCompletenessInput,
  toCompletenessInputFromFlags,
} from '../profile-completeness';
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

const A_PROJECT: ProfileData['projects'] = [
  { name: 'CourtBook', stack: 'Next.js', startDate: '', endDate: '', achievements: [] },
];

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

describe('projectsPresenceFor', () => {
  it('reads presence off the occupation profile section rule', () => {
    expect(projectsPresenceFor('software_engineer')).toBe('expected');
    expect(projectsPresenceFor('generic')).toBe('optional');
    expect(projectsPresenceFor('warehouse_operative')).toBe('irrelevant');
    expect(projectsPresenceFor('registered_nurse')).toBe('irrelevant');
    expect(projectsPresenceFor('administrator')).toBe('irrelevant');
  });

  it('falls back to optional for an unset or unknown occupation', () => {
    // Nothing is hidden before the user has told us what they are targeting.
    expect(projectsPresenceFor('')).toBe('optional');
    expect(projectsPresenceFor('astronaut')).toBe('optional');
  });
});

describe('projects step visibility', () => {
  it('shows projects where the occupation expects or permits them', () => {
    expect(projectsSectionVisible('software_engineer', 0)).toBe(true);
    expect(projectsSectionVisible('generic', 0)).toBe(true);
    expect(projectsSectionVisible('', 0)).toBe(true);
  });

  it('hides projects where the occupation marks them irrelevant', () => {
    expect(projectsSectionVisible('registered_nurse', 0)).toBe(false);
    expect(projectsSectionVisible('warehouse_operative', 0)).toBe(false);
    expect(projectsSectionVisible('administrator', 0)).toBe(false);
  });

  it('keeps projects visible when rows already exist, whatever the occupation', () => {
    // A software engineer who added projects and then retargeted as a nurse
    // must not be left with rows they can neither see nor delete.
    expect(projectsSectionVisible('registered_nurse', 3)).toBe(true);
    expect(projectsSectionVisible('warehouse_operative', 1)).toBe(true);
  });
});

describe('occupation-aware completeness', () => {
  it('a warehouse profile reaches 100% with no projects', () => {
    const profile = makeProfile({ targetOccupation: 'warehouse_operative' });
    expect(profileCompleteness(profile)).toBe(100);
    expect(isProfileComplete(profile)).toBe(true);
  });

  it('a nurse profile reaches 100% with no projects', () => {
    const profile = makeProfile({ targetOccupation: 'registered_nurse' });
    expect(profileCompleteness(profile)).toBe(100);
    expect(isProfileComplete(profile)).toBe(true);
  });

  it('a software profile without projects is incomplete', () => {
    const profile = makeProfile({ targetOccupation: 'software_engineer' });
    expect(isProfileComplete(profile)).toBe(false);
  });

  it('a software profile with projects is complete', () => {
    const profile = makeProfile({ targetOccupation: 'software_engineer', projects: A_PROJECT });
    expect(isProfileComplete(profile)).toBe(true);
  });

  it('a generic profile stays usable and reaches 100% without projects', () => {
    const profile = makeProfile({ targetOccupation: 'generic' });
    expect(profileCompleteness(profile)).toBe(100);
    expect(isProfileComplete(profile)).toBe(true);
  });

  it('an unset occupation costs exactly the target-occupation check', () => {
    const profile = makeProfile({ targetOccupation: '' });
    const result = evaluateProfileCompleteness(toCompletenessInput(profile));
    expect(result.missingChecks).toEqual(['target-occupation']);
    expect(result.percentage).toBe(83);
  });
});

describe('relevant checks', () => {
  it('includes projects for software engineers', () => {
    const result = evaluateProfileCompleteness(
      toCompletenessInput(makeProfile({ targetOccupation: 'software_engineer' }))
    );
    expect(result.relevantChecks).toContain('projects');
    expect(result.missingChecks).toContain('projects');
  });

  it('omits projects for occupations that do not expect them', () => {
    for (const occupation of ['registered_nurse', 'warehouse_operative', 'administrator', 'generic']) {
      const result = evaluateProfileCompleteness(
        toCompletenessInput(makeProfile({ targetOccupation: occupation }))
      );
      expect(result.relevantChecks).not.toContain('projects');
    }
  });

  it('recalculates the relevant checks when the occupation changes', () => {
    const asNurse = evaluateProfileCompleteness(
      toCompletenessInput(makeProfile({ targetOccupation: 'registered_nurse' }))
    );
    const asEngineer = evaluateProfileCompleteness(
      toCompletenessInput(makeProfile({ targetOccupation: 'software_engineer' }))
    );

    expect(asNurse.relevantChecks).toHaveLength(6);
    expect(asEngineer.relevantChecks).toHaveLength(7);
    // Same underlying content, different verdict — purely because the
    // occupation changed which evidence is expected.
    expect(asNurse.percentage).toBe(100);
    expect(asEngineer.percentage).toBe(86);
  });

  it('partitions relevant checks into completed and missing with no overlap', () => {
    const result = evaluateProfileCompleteness(
      toCompletenessInput(makeProfile({ targetOccupation: 'software_engineer' }))
    );
    expect([...result.completedChecks, ...result.missingChecks].sort()).toEqual(
      [...result.relevantChecks].sort()
    );
    expect(result.completedChecks.filter((c) => result.missingChecks.includes(c))).toEqual([]);
  });
});

describe('wizard and dashboard agree', () => {
  /** The onboarding wizard's view: per-step "was this filled in" booleans. */
  function wizardPercentage(profile: ProfileData): number {
    return evaluateProfileCompleteness(
      toCompletenessInputFromFlags({
        targetOccupation: profile.personal.targetOccupation,
        fullName: Boolean(profile.personal.fullName),
        professionalSummary: Boolean(profile.personal.professionalSummary),
        experience: profile.experience.length > 0,
        education: profile.education.length > 0,
        skills: profile.skills.length > 0,
        projects: profile.projects.length > 0,
      })
    ).percentage;
  }

  it('reports the same percentage for every occupation, projects or not', () => {
    const occupations = [
      'software_engineer',
      'warehouse_operative',
      'registered_nurse',
      'administrator',
      'generic',
      '',
    ];

    for (const targetOccupation of occupations) {
      for (const projects of [undefined, A_PROJECT]) {
        const profile = makeProfile({ targetOccupation, projects });
        expect(
          wizardPercentage(profile),
          `wizard and dashboard disagree for "${targetOccupation}" with ${profile.projects.length} project(s)`
        ).toBe(profileCompleteness(profile));
      }
    }
  });

  it('agrees that a nurse who skipped projects is finished', () => {
    // The regression: the wizard used to divide by a fixed 6 including
    // projects, so a nurse saw "83% complete" and then a 100% dashboard.
    const nurse = makeProfile({ targetOccupation: 'registered_nurse' });
    expect(wizardPercentage(nurse)).toBe(100);
    expect(profileCompleteness(nurse)).toBe(100);
  });
});
