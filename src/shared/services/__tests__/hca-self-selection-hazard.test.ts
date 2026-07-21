// MEASUREMENT 1 (flipped) — the regulated-profile activation guard.
//
// This file originally documented the HAZARD: an HCA whose track stored
// `targetOccupation = 'registered_nurse'` was scored as a nurse at 0.9 and
// asked for an NMC PIN they cannot hold. The guard in classifyCV now declines a
// regulated profile target the CV does not corroborate, so these assertions are
// flipped to prove the safe behaviour and lock it against regression.
//
// Since the Healthcare Support profile was added, the declined HCA no longer
// falls all the way to Generic — its own CV evidence (support-role titles,
// personal care, safeguarding, observations) now resolves it to the
// non-regulated Healthcare Support profile. The safety property is unchanged and
// is what these tests assert: it is NOT registered_nurse, NOT regulated, and no
// clinician registration (NMC/GMC/GPhC/HCPC) is ever DEMANDED of it. Naming the
// regulators inside the STRICT PROHIBITIONS block is the opposite of a demand —
// it is the explicit safety instruction telling the AI not to ask for one.

import { describe, it, expect } from 'vitest';
import { classifyCV } from '../classifier';
import { composeSemanticPrompt, composeJobMatchPrompt } from '../prompt-composer';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { analyzeCV, type AnalyzeContext } from '@/shared/utils/scoring-engine';
import { loadFixtureCV } from '@/__fixtures__/load-cv';

const aiMustNotRun = async () => {
  throw new Error('AI classifier must not be consulted in this measurement');
};

async function selfSelectedAsNurse() {
  const cvText = loadFixtureCV('hca-no-nmc');

  // Production path: analyze route passes the track's stored targetOccupation
  // straight into classifyCV as profileTarget.occupation.
  const classification = await classifyCV(
    {
      cvText,
      profileTarget: { occupation: 'registered_nurse' },
      aiAllowed: false,
    },
    aiMustNotRun
  );

  const profile = getOccupationProfile(classification.occupation);
  const ctx: AnalyzeContext = { classification, profile };
  const result = analyzeCV(cvText, 2, ctx);

  const baseResult = {
    rawText: cvText,
    pageCount: 2,
    keywords: { present: [], missing: [] },
  } as never;

  const prompts = {
    semantic: composeSemanticPrompt(cvText, baseResult, profile, classification),
    jobMatch: composeJobMatchPrompt(cvText, 'Generic job description.', profile, classification),
  };
  const credentialChecklist =
    prompts.semantic.split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';

  return { cvText, classification, profile, result, prompts, credentialChecklist };
}

/** Instruction region of a prompt — everything before the quoted-in CV text. */
const instructionsOf = (prompt: string) => prompt.split('"""')[0];

/** A registration is DEMANDED only if it appears on the credential checklist line. */
const checklistLineOf = (prompt: string) =>
  prompt.split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';
const REGULATORS = /NMC|GMC|GPhC|HCPC|Nursing and Midwifery Council/i;

describe('regulated activation guard — HCA self-selected as registered nurse', () => {
  it('does NOT select registered_nurse without corroborating evidence', async () => {
    const { classification } = await selfSelectedAsNurse();
    // The user's declaration is seen and rejected, not obeyed. The HCA's own
    // evidence then resolves it to the non-regulated Healthcare Support profile.
    expect(classification.occupation).not.toBe('registered_nurse');
    expect(classification.occupation).toBe('healthcare_support');
    expect(classification.regulated).toBe(false);
    // Provenance records WHY the declared nurse target was ignored.
    expect(classification.reasonCodes).toContain('REGULATED_TARGET_UNCORROBORATED');
  });

  it('does not demand NMC anywhere in findings, recommendations, or the checklist', async () => {
    const { result, prompts, credentialChecklist } = await selfSelectedAsNurse();

    // Credential findings — Healthcare Support asks only for care credentials.
    const nmcFinding = result.credentials?.findings.find((f) => /NMC/i.test(f.label) || f.id === 'nmc-registration');
    expect(nmcFinding).toBeUndefined();
    // The checklist is where a credential is DEMANDED; no regulator appears here.
    expect(credentialChecklist).not.toMatch(REGULATORS);

    // Recommendations.
    expect(result.recommendations.some((r) => /NMC/i.test(r.title) || /NMC/i.test(r.description))).toBe(false);

    // Neither prompt DEMANDS a registration (the checklist line is the demand).
    expect(checklistLineOf(prompts.semantic)).not.toMatch(REGULATORS);
    expect(checklistLineOf(prompts.jobMatch)).not.toMatch(REGULATORS);
  });

  it('names the regulators in the prohibitions block as an explicit safety instruction', async () => {
    const { prompts } = await selfSelectedAsNurse();
    // The opposite of a demand: the prohibitions tell the AI not to expect any
    // clinician registration. Both prompts the route can send carry it.
    for (const prompt of [prompts.semantic, prompts.jobMatch]) {
      const instr = instructionsOf(prompt);
      const prohibitions = instr.slice(instr.indexOf('STRICT PROHIBITIONS'));
      expect(prohibitions).toMatch(REGULATORS);
    }
  });

  it('does not floor the credential score the way the nurse profile did', async () => {
    const { result } = await selfSelectedAsNurse();
    const credentials = result.categories.find((c) => c.id === 'credentials')!;
    // Healthcare Support has no MANDATORY credential, so the score is never
    // floored to ~3 the way the nurse profile's missing-NMC rule floored it.
    // The Care Certificate is present; DBS is a desirable miss.
    expect(result.credentials?.findings.some((f) => f.class === 'mandatory')).toBe(false);
    expect(credentials.score).toBeGreaterThanOrEqual(8);
  });

  it('confirms the evidence tier alone also lands on Healthcare Support (contrast)', async () => {
    const cvText = loadFixtureCV('hca-no-nmc');
    const evidenceOnly = await classifyCV({ cvText, aiAllowed: false }, aiMustNotRun);
    expect(evidenceOnly.occupation).toBe('healthcare_support');
    expect(evidenceOnly.regulated).toBe(false);
  });
});
