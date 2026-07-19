import { describe, it, expect } from 'vitest';
import { OCCUPATION_PROFILES, OCCUPATION_IDS, getOccupationProfile, isKnownOccupation } from '../registry';
import { validateOccupationProfile } from '../validate';
import { genericProfile } from '../profiles/generic';
import type { OccupationProfile } from '../types';

describe('occupation registry', () => {
  it('every profile passes structural validation', () => {
    for (const profile of Object.values(OCCUPATION_PROFILES)) {
      expect(validateOccupationProfile(profile)).toEqual([]);
    }
  });

  it('registry keys match profile ids', () => {
    for (const [key, profile] of Object.entries(OCCUPATION_PROFILES)) {
      expect(profile.id).toBe(key);
    }
  });

  it('includes the four archetypes plus generic', () => {
    expect(OCCUPATION_IDS.sort()).toEqual(
      ['administrator', 'generic', 'registered_nurse', 'software_engineer', 'warehouse_operative'].sort()
    );
    const archetypes = Object.values(OCCUPATION_PROFILES).map(p => p.roleArchetype);
    expect(archetypes).toContain('technical_specialist');
    expect(archetypes).toContain('frontline_operative');
    expect(archetypes).toContain('administrative_support');
    expect(archetypes).toContain('regulated_clinician');
  });

  it('isKnownOccupation narrows untrusted strings', () => {
    expect(isKnownOccupation('registered_nurse')).toBe(true);
    expect(isKnownOccupation('marketing_guru')).toBe(false);
    expect(isKnownOccupation(null)).toBe(false);
    expect(isKnownOccupation(42)).toBe(false);
  });

  it('getOccupationProfile falls back to generic', () => {
    expect(getOccupationProfile('generic')).toBe(genericProfile);
  });
});

describe('anti-contamination guarantees', () => {
  const nonTech = (Object.values(OCCUPATION_PROFILES) as OccupationProfile[]).filter(
    p => p.id !== 'software_engineer'
  );

  it('non-tech profiles prohibit tech expectations or stay neutral', () => {
    for (const profile of nonTech) {
      expect(profile.prohibitedExpectations.length).toBeGreaterThan(0);
    }
  });

  it('no non-tech profile mentions testing frameworks anywhere in its guidance', () => {
    for (const profile of nonTech) {
      const guidance = [
        profile.persona,
        profile.impactGuidance,
        profile.summaryGuidance,
        ...profile.evidencePriorities,
      ].join(' ');
      expect(guidance).not.toMatch(/jest|cypress|playwright|vitest/i);
    }
  });

  it('nurse profile hard-requires NMC; warehouse and admin never require it', () => {
    const nurse = OCCUPATION_PROFILES.registered_nurse;
    expect(nurse.credentials.some(c => c.id === 'nmc-registration' && c.class === 'mandatory')).toBe(true);
    for (const p of [OCCUPATION_PROFILES.warehouse_operative, OCCUPATION_PROFILES.administrator]) {
      expect(p.credentials.some(c => /nmc/i.test(c.label))).toBe(false);
      expect(p.credentials.some(c => c.class === 'mandatory')).toBe(false);
    }
  });

  it('warehouse profile marks projects irrelevant and detects FLT evidence', () => {
    const wh = OCCUPATION_PROFILES.warehouse_operative;
    expect(wh.sections.rules.find(r => r.section === 'key-projects')?.presence).toBe('irrelevant');
    const flt = wh.credentials.find(c => c.id === 'flt-licence');
    expect(flt).toBeDefined();
    expect(flt!.patterns.some(p => p.test('FLT Counterbalance Licence (RTITB accredited)'))).toBe(true);
  });

  it('warehouse impact patterns accept a strong non-percentage bullet', () => {
    const wh = OCCUPATION_PROFILES.warehouse_operative;
    const bullet =
      'Consistently met daily picking targets while maintaining accurate order checks and safe manual-handling procedures';
    expect(wh.impactPatterns.some(p => p.test(bullet))).toBe(true);
  });
});

describe('detection patterns', () => {
  const cases: Array<[string, string]> = [
    ['software_engineer', 'Senior Frontend Engineer'],
    ['software_engineer', 'Software Developer'],
    ['warehouse_operative', 'Warehouse Operative'],
    ['warehouse_operative', 'Picker/Packer'],
    ['administrator', 'Office Administrator'],
    ['administrator', 'Administrative Assistant'],
    ['registered_nurse', 'Staff Nurse'],
    ['registered_nurse', 'Registered Nurse'],
  ];

  it.each(cases)('%s title patterns match "%s"', (id, title) => {
    const profile = OCCUPATION_PROFILES[id as keyof typeof OCCUPATION_PROFILES];
    expect(profile.detection.titlePatterns.some(p => p.test(title))).toBe(true);
  });

  it('nurse titles do not match the administrator profile and vice versa', () => {
    expect(OCCUPATION_PROFILES.administrator.detection.titlePatterns.some(p => p.test('Staff Nurse'))).toBe(false);
    expect(OCCUPATION_PROFILES.registered_nurse.detection.titlePatterns.some(p => p.test('Office Administrator'))).toBe(false);
  });
});
