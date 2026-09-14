// Regulated-profile activation guard — positive and negative paths.
//
// The guard requires a regulated profile target (or AI suggestion) to be
// corroborated by the CV via a matching regulated title OR the occupation's
// mandatory credential, and by nothing weaker. These tests prove genuine
// nurses are unaffected, non-regulated targets keep their 0.9 behaviour, and
// the same corroboration principle governs the AI tier.

import { describe, it, expect } from 'vitest';
import { classifyCV } from '../classifier';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { analyzeCV, type AnalyzeContext } from '@/shared/utils/scoring-engine';
import { loadFixtureCV } from '@/__fixtures__/load-cv';
import type { OccupationId, Seniority } from '@/shared/types/classification';

const aiMustNotRun = async () => {
  throw new Error('AI classifier must not be consulted here');
};

/** A stub AI classifier that always returns the given occupation. */
const aiReturns = (occupation: OccupationId, seniority: Seniority = 'mid') =>
  async () => ({ occupation, confidence: 0.9, sector: 'healthcare_nhs' as const, seniority });

function score(occupation: OccupationId, cvText: string) {
  const profile = getOccupationProfile(occupation);
  const ctx: AnalyzeContext = {
    classification: {
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
    },
    profile,
  };
  return analyzeCV(cvText, 2, ctx);
}

describe('corroboration activates the nurse profile', () => {
  it('an explicit Registered Nurse title in the CV activates it via profile target', async () => {
    const cvText = loadFixtureCV('registered-nurse-no-nmc'); // has "Staff Nurse" title lines
    const c = await classifyCV(
      { cvText, profileTarget: { occupation: 'registered_nurse' }, aiAllowed: false },
      aiMustNotRun
    );
    expect(c.occupation).toBe('registered_nurse');
    expect(c.source).toBe('profile_target');
    expect(c.confidence).toBe(0.9);
    expect(c.reasonCodes).not.toContain('REGULATED_TARGET_UNCORROBORATED');
  });

  it('valid NMC evidence activates it even without a nurse job title', async () => {
    // A community-health CV whose only nurse signal is the mandatory credential.
    const cvText = [
      'ALEX MORGAN',
      'Community Health Practitioner',
      'NMC registration active — PIN available on request.',
      'Supported patients across community settings for several years.',
    ].join('\n');
    const c = await classifyCV(
      { cvText, profileTarget: { occupation: 'registered_nurse' }, aiAllowed: false },
      aiMustNotRun
    );
    expect(c.occupation).toBe('registered_nurse');
    expect(c.source).toBe('profile_target');
  });
});

describe('genuine nurse is unchanged by the guard', () => {
  it('classifies as registered_nurse with or without the profile target', async () => {
    const cvText = loadFixtureCV('registered-nurse-no-nmc');

    const viaEvidence = await classifyCV({ cvText, aiAllowed: false }, aiMustNotRun);
    expect(viaEvidence.occupation).toBe('registered_nurse');

    const viaTarget = await classifyCV(
      { cvText, profileTarget: { occupation: 'registered_nurse' }, aiAllowed: false },
      aiMustNotRun
    );
    expect(viaTarget.occupation).toBe('registered_nurse');

    // And the genuine nurse still gets the (correct) NMC flag when their PIN is
    // absent — the guard must not suppress a real regulated expectation.
    const result = score('registered_nurse', cvText);
    const nmc = result.credentials?.findings.find((f) => f.id === 'nmc-registration');
    expect(nmc?.found).toBe(false);
    expect(result.categories.find((c) => c.id === 'credentials')!.score).toBeLessThanOrEqual(3);
    expect(
      result.recommendations.some((r) => r.priority === 'critical' && /NMC/i.test(r.title))
    ).toBe(true);
  });
});

describe('non-regulated profile targets keep the 0.9 behaviour', () => {
  it('activates without requiring CV corroboration', async () => {
    // A dev CV declared as a warehouse target: warehouse is not regulated, so
    // the declaration alone still activates at 0.9 exactly as before.
    const cvText = loadFixtureCV('junior-dev-with-projects');
    const c = await classifyCV(
      { cvText, profileTarget: { occupation: 'warehouse_operative' }, aiAllowed: false },
      aiMustNotRun
    );
    expect(c.occupation).toBe('warehouse_operative');
    expect(c.source).toBe('profile_target');
    expect(c.confidence).toBe(0.9);
  });
});

describe('AI promotion into a regulated profile follows the same principle', () => {
  it('is rejected when the CV does not corroborate the AI suggestion', async () => {
    // A CV with no nurse corroboration AND no Healthcare Support evidence, so the
    // deterministic tier stays below threshold and the AI tier actually runs.
    const cvText = [
      'CHRIS DOYLE',
      'Experienced professional seeking a new role.',
      'Worked across a range of settings supporting day-to-day operations.',
      'Strong communicator, reliable, and organised.',
    ].join('\n');
    const c = await classifyCV(
      { cvText, aiAllowed: true, aiClassificationEnabled: true },
      aiReturns('registered_nurse')
    );
    expect(c.occupation).not.toBe('registered_nurse');
    expect(c.occupation).toBe('generic');
  });

  it('is accepted when the CV corroborates it via the mandatory credential', async () => {
    // Weak title/task evidence (evidence tier stays below threshold) but a valid
    // NMC PIN, so the AI suggestion is corroborated and activates.
    const cvText = [
      'JORDAN PATEL',
      'Health professional seeking new opportunities.',
      'NMC PIN held and available on request.',
      'Experience supporting people in various settings.',
    ].join('\n');
    const c = await classifyCV(
      { cvText, aiAllowed: true, aiClassificationEnabled: true },
      aiReturns('registered_nurse')
    );
    expect(c.occupation).toBe('registered_nurse');
    expect(c.source).toBe('ai');
  });
});
