// Healthcare Support evaluation profile — behavioural contract.
//
// Healthcare Support is the UNREGULATED care-support family (healthcare
// assistant, care/support worker, senior care assistant, domiciliary carer).
// These tests lock in the rules the profile was added for:
//   - HCA and care-worker CVs classify AS Healthcare Support, never as the
//     regulated nurse profile, and never demand a clinician registration;
//   - DBS and the Care Certificate are desirable, never universally mandatory;
//   - care-impact scoring beats Generic on real care CVs, but a weak,
//     keyword-stuffed care CV does NOT automatically get full impact marks;
//   - projects are not required;
//   - the AI prompt carries care-relevant guidance and an explicit registration
//     prohibition;
//   - a null evaluation type still resolves safely (evidence → Healthcare
//     Support for a care CV; Generic when nothing is safely resolved).

import { describe, it, expect } from 'vitest';
import { classifyCV } from '../classifier';
import { composeSemanticPrompt, composeJobMatchPrompt } from '../prompt-composer';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { genericProfile } from '@/shared/occupations/profiles/generic';
import { healthcareSupportProfile } from '@/shared/occupations/profiles/healthcare-support';
import { analyzeCV, type AnalyzeContext } from '@/shared/utils/scoring-engine';
import { analyzeImpactStatements } from '@/shared/utils/scoring/impact';
import { loadFixtureCV, type FixtureCV } from '@/__fixtures__/load-cv';
import type { Classification, OccupationId } from '@/shared/types/classification';

const aiMustNotRun = async () => {
  throw new Error('AI classifier must not be consulted in this test');
};

const CARE_FIXTURES: FixtureCV[] = ['hca-no-nmc', 'care-worker-domiciliary'];
const REGULATORS = /NMC|GMC|GPhC|HCPC|Nursing and Midwifery Council/i;

/** A weak care CV: care vocabulary with no action, scale, or outcome. */
const WEAK_CARE_CV = [
  'SAM RILEY',
  'Care Assistant',
  'Personal care and dignity.',
  'Safeguarding. Compassion. Person-centred.',
  'Teamwork and good communication.',
].join('\n');

/** A plainly non-care, non-specialised CV — nothing to classify confidently. */
const AMBIGUOUS_CV = [
  'CHRIS DOYLE',
  'Experienced professional seeking a new role.',
  'Worked across a range of settings supporting day-to-day operations.',
  'Reliable, organised, and a strong communicator.',
].join('\n');

function classificationFor(occupation: OccupationId): Classification {
  const profile = getOccupationProfile(occupation);
  return {
    occupation,
    sector: profile.sector,
    roleArchetype: profile.roleArchetype,
    applicationWorkflow: profile.applicationWorkflow,
    primaryArtifact: profile.primaryArtifact,
    secondaryArtifacts: profile.secondaryArtifacts,
    seniority: 'mid',
    regulated: profile.regulated,
    confidence: 0.9,
    source: 'profile_target',
    reasonCodes: ['PROFILE_TARGET_SET'],
  };
}

const checklistLineOf = (prompt: string) =>
  prompt.split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';

describe('Healthcare Support — classification', () => {
  it.each(CARE_FIXTURES)('%s classifies as Healthcare Support (non-regulated)', async (fixture) => {
    const c = await classifyCV({ cvText: loadFixtureCV(fixture), aiAllowed: false }, aiMustNotRun);
    expect(c.occupation).toBe('healthcare_support');
    expect(c.regulated).toBe(false);
  });

  it('does not activate Registered Nurse for a care CV', async () => {
    for (const fixture of CARE_FIXTURES) {
      const c = await classifyCV({ cvText: loadFixtureCV(fixture), aiAllowed: false }, aiMustNotRun);
      expect(c.occupation).not.toBe('registered_nurse');
    }
  });

  it('is self-selectable — a declared Healthcare Support target activates it', async () => {
    const c = await classifyCV(
      { cvText: loadFixtureCV('care-worker-domiciliary'), profileTarget: { occupation: 'healthcare_support' }, aiAllowed: false },
      aiMustNotRun
    );
    expect(c.occupation).toBe('healthcare_support');
    expect(c.source).toBe('profile_target');
  });

  it('a genuine nurse target still activates Registered Nurse (regulated corroboration intact)', async () => {
    const c = await classifyCV(
      { cvText: loadFixtureCV('registered-nurse-no-nmc'), profileTarget: { occupation: 'registered_nurse' }, aiAllowed: false },
      aiMustNotRun
    );
    expect(c.occupation).toBe('registered_nurse');
  });
});

describe('Healthcare Support — a null evaluation type resolves safely', () => {
  it('a null occupation on a care CV classifies via evidence to Healthcare Support', async () => {
    const c = await classifyCV(
      { cvText: loadFixtureCV('hca-no-nmc'), profileTarget: { occupation: null, roleTitle: null }, aiAllowed: false },
      aiMustNotRun
    );
    expect(c.occupation).toBe('healthcare_support');
  });

  it('a null occupation with no confident evidence falls back to Generic', async () => {
    const c = await classifyCV(
      { cvText: AMBIGUOUS_CV, profileTarget: { occupation: null, roleTitle: null }, aiAllowed: false },
      aiMustNotRun
    );
    expect(c.occupation).toBe('generic');
    expect(c.regulated).toBe(false);
  });
});

describe('Healthcare Support — credentials are never universally mandatory', () => {
  it('has no mandatory credential rule; DBS and Care Certificate are desirable', () => {
    expect(healthcareSupportProfile.credentials.every((c) => c.class !== 'mandatory')).toBe(true);
    const ids = healthcareSupportProfile.credentials.map((c) => c.id);
    expect(ids).toContain('care-certificate');
    expect(ids).toContain('dbs-check');
  });

  it.each(CARE_FIXTURES)('%s is DEMANDED no clinician registration', async (fixture) => {
    const cvText = loadFixtureCV(fixture);
    const classification = await classifyCV({ cvText, aiAllowed: false }, aiMustNotRun);
    const profile = getOccupationProfile(classification.occupation);
    const semantic = composeSemanticPrompt(
      cvText,
      { rawText: cvText, pageCount: 2, keywords: { present: [], missing: [] } } as never,
      profile,
      classification
    );
    const jobMatch = composeJobMatchPrompt(cvText, 'Generic job description.', profile, classification);
    expect(checklistLineOf(semantic)).not.toMatch(REGULATORS);
    expect(checklistLineOf(jobMatch)).not.toMatch(REGULATORS);
  });

  it('a care CV missing DBS is not floored — credentials stay high', () => {
    // hca-no-nmc holds a Care Certificate but no DBS: a desirable miss, not a
    // mandatory failure, so the score stays high rather than collapsing.
    const cvText = loadFixtureCV('hca-no-nmc');
    const classification = classificationFor('healthcare_support');
    const result = analyzeCV(cvText, 2, { classification, profile: healthcareSupportProfile });
    expect(result.credentials?.findings.some((f) => f.class === 'mandatory')).toBe(false);
    expect(result.categories.find((c) => c.id === 'credentials')!.score).toBeGreaterThanOrEqual(8);
  });
});

describe('Healthcare Support — care-impact scoring', () => {
  it.each(CARE_FIXTURES)('%s scores higher impact than Generic', (fixture) => {
    const cvText = loadFixtureCV(fixture);
    const generic = analyzeImpactStatements(cvText, genericProfile);
    const care = analyzeImpactStatements(cvText, healthcareSupportProfile);
    expect(care).toBeGreaterThan(generic);
  });

  it('does NOT hand a weak, keyword-stuffed care CV full impact marks', () => {
    const weak = analyzeImpactStatements(WEAK_CARE_CV, healthcareSupportProfile);
    // Care vocabulary with no action, scale, or outcome earns the floor, not 10.
    expect(weak).toBeLessThan(10);
    expect(weak).toBeLessThanOrEqual(3);
  });
});

describe('Healthcare Support — sections and prompt guidance', () => {
  it('does not require a projects section', async () => {
    const cvText = loadFixtureCV('hca-no-nmc');
    const classification = await classifyCV({ cvText, aiAllowed: false }, aiMustNotRun);
    const profile = getOccupationProfile(classification.occupation);
    const projectsRule = profile.sections.rules.find((r) => r.section === 'key-projects');
    expect(projectsRule?.presence).toBe('irrelevant');

    const result = analyzeCV(cvText, 2, { classification, profile } as AnalyzeContext);
    expect(result.sectionOrder.missingRequired).not.toContain('key-projects');
  });

  it('prompts carry care-relevant guidance and an explicit registration prohibition', () => {
    const cvText = loadFixtureCV('care-worker-domiciliary');
    const classification = classificationFor('healthcare_support');
    const prompt = composeSemanticPrompt(
      cvText,
      { rawText: cvText, pageCount: 2, keywords: { present: [], missing: [] } } as never,
      healthcareSupportProfile,
      classification
    );
    // Care-relevant guidance.
    expect(prompt).toMatch(/person-centred/i);
    expect(prompt).toMatch(/safeguarding/i);
    // Explicit registration prohibition naming every regulator.
    const instructions = prompt.split('"""')[0];
    const prohibitions = instructions.slice(instructions.indexOf('STRICT PROHIBITIONS'));
    for (const regulator of ['NMC', 'GMC', 'GPhC', 'HCPC']) {
      expect(prohibitions).toContain(regulator);
    }
  });
});
