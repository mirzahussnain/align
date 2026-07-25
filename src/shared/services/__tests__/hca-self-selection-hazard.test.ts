// The regulated-target rule, split by how the target was chosen.
//
// This file has moved through two decisions. It first documented the HAZARD (an
// HCA whose track defaulted to `registered_nurse` was silently scored as a nurse
// and demanded an NMC PIN). The safeguard then DECLINED any uncorroborated
// regulated target. The current rule (correction 2) is finer-grained and turns
// on PROVENANCE:
//
//   - AUTOMATIC detection (no explicit target passed): the regulated activation
//     guard still applies — an HCA CV resolves to the non-regulated Healthcare
//     Support profile and is never handed a clinician registration. This is the
//     load-bearing safety property and it is unchanged.
//
//   - EXPLICIT confirmation (the user confirmed a Registered Nurse target, which
//     the resolver models by passing `profileTarget`): the choice is
//     AUTHORITATIVE and retained. The CV lacking corroboration does NOT replace
//     the target; instead corroboration is recorded as absent so the analysis
//     reports the registration as missing/unclear. It never INFERS that the
//     candidate is registered.

import { describe, it, expect } from 'vitest';
import { classifyCV } from '../classifier';
import { composeSemanticPrompt, composeJobMatchPrompt } from '../prompt-composer';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { analyzeCV } from '@/shared/utils/scoring-engine';
import { loadFixtureCV } from '@/__fixtures__/load-cv';

const aiMustNotRun = async () => {
  throw new Error('AI classifier must not be consulted in this measurement');
};

/** A registration is DEMANDED only if it appears on the credential checklist line. */
const checklistLineOf = (prompt: string) =>
  prompt.split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';
const REGULATORS = /NMC|GMC|GPhC|HCPC|Nursing and Midwifery Council/i;

describe('AUTOMATIC detection of an HCA is guarded — never the regulated nurse profile', () => {
  async function detectedFromEvidence() {
    // No profileTarget → this is automatic detection, subject to the guard.
    const cvText = loadFixtureCV('hca-no-nmc');
    const classification = await classifyCV({ cvText, aiAllowed: false }, aiMustNotRun);
    const profile = getOccupationProfile(classification.occupation);
    const result = analyzeCV(cvText, 2, { classification, profile });

    const baseResult = { rawText: cvText, pageCount: 2, keywords: { present: [], missing: [] } } as never;
    const prompts = {
      semantic: composeSemanticPrompt(cvText, baseResult, profile, classification),
      jobMatch: composeJobMatchPrompt(cvText, 'Generic job description.', profile, classification),
    };
    return { cvText, classification, profile, result, prompts };
  }

  it('resolves to the non-regulated Healthcare Support profile, not registered_nurse', async () => {
    const { classification } = await detectedFromEvidence();
    expect(classification.occupation).not.toBe('registered_nurse');
    expect(classification.occupation).toBe('healthcare_support');
    expect(classification.regulated).toBe(false);
  });

  it('is DEMANDED no clinician registration in findings, recommendations, or the checklist', async () => {
    const { result, prompts } = await detectedFromEvidence();
    const nmcFinding = result.credentials?.findings.find(
      (f) => /NMC/i.test(f.label) || f.id === 'nmc-registration'
    );
    expect(nmcFinding).toBeUndefined();
    expect(checklistLineOf(prompts.semantic)).not.toMatch(REGULATORS);
    expect(checklistLineOf(prompts.jobMatch)).not.toMatch(REGULATORS);
    expect(
      result.recommendations.some((r) => /NMC/i.test(r.title) || /NMC/i.test(r.description))
    ).toBe(false);
  });

  it('does not floor the credential score the way the nurse profile did', async () => {
    const { result } = await detectedFromEvidence();
    const credentials = result.categories.find((c) => c.id === 'credentials')!;
    expect(result.credentials?.findings.some((f) => f.class === 'mandatory')).toBe(false);
    expect(credentials.score).toBeGreaterThanOrEqual(8);
  });
});

describe('EXPLICIT confirmation of a Registered Nurse target is authoritative (correction 2)', () => {
  async function explicitlyConfirmedNurse() {
    const cvText = loadFixtureCV('hca-no-nmc');
    // The resolver passes profileTarget ONLY when the user confirmed the target,
    // so this models an explicit Registered Nurse confirmation over an HCA CV.
    const classification = await classifyCV(
      { cvText, profileTarget: { occupation: 'registered_nurse' }, aiAllowed: false },
      aiMustNotRun
    );
    const profile = getOccupationProfile(classification.occupation);
    const result = analyzeCV(cvText, 2, { classification, profile });

    const baseResult = { rawText: cvText, pageCount: 2, keywords: { present: [], missing: [] } } as never;
    const prompts = {
      semantic: composeSemanticPrompt(cvText, baseResult, profile, classification),
      jobMatch: composeJobMatchPrompt(cvText, 'Generic job description.', profile, classification),
    };
    return { cvText, classification, profile, result, prompts };
  }

  it('retains registered_nurse as the resolved target rather than replacing it', async () => {
    const { classification } = await explicitlyConfirmedNurse();
    expect(classification.occupation).toBe('registered_nurse');
    expect(classification.source).toBe('profile_target');
    expect(classification.regulated).toBe(true);
  });

  it('records corroboration as absent without inferring registration', async () => {
    const { classification } = await explicitlyConfirmedNurse();
    // Absent = the registration is missing/unclear; it is NEVER read as present.
    expect(classification.regulatedEvidence).toBe('absent');
    expect(classification.regulatedEvidence).not.toBe('present');
    expect(classification.reasonCodes).toContain('REGULATED_TARGET_UNCORROBORATED');
  });

  it('reports the missing NMC registration against the chosen target', async () => {
    const { result, prompts } = await explicitlyConfirmedNurse();
    // Because the user chose nurse, the analysis surfaces the missing mandatory
    // registration (the honest report of missing/unclear regulated evidence).
    const nmc = result.credentials?.findings.find((f) => f.id === 'nmc-registration');
    expect(nmc?.found).toBe(false);
    expect(checklistLineOf(prompts.semantic)).toMatch(/NMC/);
  });
});
