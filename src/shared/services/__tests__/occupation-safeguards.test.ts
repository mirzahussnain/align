// Occupation safeguard eval.
//
// This is the measurement that decides whether a maintained occupation profile
// is warranted. The rule we work to is: add a profile only when generic
// analysis cannot safely prevent a real mistake. That rule is unfalsifiable
// without something that detects the mistakes, so this file encodes them.
//
// A "wrong demand" is the pipeline asking a candidate for evidence their
// occupation does not call for — an NMC PIN from a healthcare assistant, SRA
// admission from a paralegal, a projects section from a warehouse operative.
// The AI never sees the occupation rules directly; it sees the composed
// prompt. So the prompt is what we assert on.
//
// The paralegal fixture has NO maintained profile — it is the case that tells
// us whether the generic fallback is genuinely safe or merely untested. The
// healthcare assistant now DOES have one (Healthcare Support), so it is asserted
// separately: it must map to that non-regulated profile and still never be
// DEMANDED a clinician registration.

import { describe, it, expect } from 'vitest';
import { classifyCV } from '../classifier';
import { composeSemanticPrompt, composeJobMatchPrompt } from '../prompt-composer';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { analyzeCredentials } from '@/shared/utils/scoring/credentials';
import type { Classification } from '@/shared/types/classification';
import { loadFixtureCV, type FixtureCV } from '@/__fixtures__/load-cv';

/** The AI classification tier must not fire in the deterministic eval. */
const aiMustNotRun = async () => {
  throw new Error('AI classifier must not be consulted in this test');
};

interface Demands {
  classification: Classification;
  /** The credential checklist line as the AI actually receives it. */
  credentialChecklist: string;
  /** Every prompt the AI could be sent for this CV. */
  prompts: string[];
}

async function demandsFor(
  fixture: FixtureCV,
  aiClassifier: Parameters<typeof classifyCV>[1] = aiMustNotRun
): Promise<Demands> {
  const cvText = loadFixtureCV(fixture);
  const classification = await classifyCV({ cvText, aiAllowed: false }, aiClassifier);
  const profile = getOccupationProfile(classification.occupation);

  const baseResult = {
    rawText: cvText,
    pageCount: 2,
    keywords: { present: [], missing: [] },
  } as never;

  const prompts = [
    composeSemanticPrompt(cvText, baseResult, profile, classification),
    composeJobMatchPrompt(cvText, 'Generic job description.', profile, classification),
  ];

  const checklistLine =
    prompts[0].split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';

  return { classification, credentialChecklist: checklistLine, prompts };
}

/** Credentials that must never be demanded of someone who cannot hold them. */
const REGULATOR_TERMS = [
  ['NMC', /\bNMC\b|Nursing and Midwifery Council/i],
  ['GPhC', /\bGPhC\b|General Pharmaceutical Council/i],
  ['GMC', /\bGMC\b|General Medical Council/i],
  ['SRA', /\bSRA\b|Solicitors Regulation Authority/i],
] as const;

describe('unmapped occupations fall back to generic, not to a neighbour', () => {
  // The dangerous failure is not "we have no profile" — it is "we picked the
  // regulated profile next door". A paralegal CV is dense with legal vocabulary
  // but must not inherit a registration requirement.
  const unmapped: FixtureCV[] = ['paralegal-no-sra'];

  it.each(unmapped)('%s classifies as generic', async (fixture) => {
    const { classification } = await demandsFor(fixture);
    expect(classification.occupation).toBe('generic');
    expect(classification.regulated).toBe(false);
  });

  it.each(unmapped)('%s is asked for no credentials at all', async (fixture) => {
    const { credentialChecklist } = await demandsFor(fixture);
    expect(credentialChecklist).toBe('- Credential checklist: none expected for this occupation');
  });

  it.each(unmapped)('%s prompts name no regulator', async (fixture) => {
    const { prompts } = await demandsFor(fixture);
    for (const prompt of prompts) {
      // The CV text is embedded in the prompt, so assert on the instruction
      // region only — everything before the CV is quoted in.
      const instructions = prompt.split('"""')[0];
      for (const [name, pattern] of REGULATOR_TERMS) {
        expect(instructions, `${fixture} instructions demand ${name}`).not.toMatch(pattern);
      }
    }
  });
});

describe('an HCA maps to Healthcare Support, never to the regulated nurse profile', () => {
  // The HCA CV is dense with clinical vocabulary and shares task patterns with
  // the nurse profile, but its own evidence (support-role titles, personal care,
  // safeguarding, observations) now resolves it to the NON-regulated Healthcare
  // Support profile. A clinician registration must still never be DEMANDED.
  const checklistDemandsRegulator = (checklist: string) =>
    REGULATOR_TERMS.some(([, pattern]) => pattern.test(checklist));

  it('classifies as healthcare_support and is not regulated', async () => {
    const { classification } = await demandsFor('hca-no-nmc');
    expect(classification.occupation).toBe('healthcare_support');
    expect(classification.regulated).toBe(false);
  });

  it('is DEMANDED no clinician registration on the credential checklist', async () => {
    const { credentialChecklist } = await demandsFor('hca-no-nmc');
    // The checklist is where a credential is demanded — only care credentials.
    expect(checklistDemandsRegulator(credentialChecklist)).toBe(false);
    expect(credentialChecklist).toMatch(/Care Certificate/);
  });

  it('names the regulators only to PROHIBIT them, as a safety instruction', async () => {
    const { prompts } = await demandsFor('hca-no-nmc');
    for (const prompt of prompts) {
      const instructions = prompt.split('"""')[0];
      const prohibitions = instructions.slice(instructions.indexOf('STRICT PROHIBITIONS'));
      // Regulators appear, but ONLY inside the prohibitions block.
      expect(prohibitions).toMatch(/NMC/);
      const beforeProhibitions = instructions.slice(0, instructions.indexOf('STRICT PROHIBITIONS'));
      for (const [name, pattern] of REGULATOR_TERMS) {
        expect(beforeProhibitions, `HCA demand region names ${name}`).not.toMatch(pattern);
      }
    }
  });

  it('scores care credentials fairly — never floored for a missing registration', async () => {
    const { classification } = await demandsFor('hca-no-nmc');
    const profile = getOccupationProfile(classification.occupation);
    const result = analyzeCredentials(loadFixtureCV('hca-no-nmc'), profile, classification);
    // No mandatory credential exists, so the score is never floored to ~3.
    expect(result.findings.some((f) => f.class === 'mandatory')).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(8);
  });
});

describe('credential demands are gated by appliesWhen', () => {
  // The nurse profile gates NMC on `occupation === 'registered_nurse'`. The
  // deterministic scorer honoured that gate; the prompt composer did not, so
  // the AI could be handed a mandatory credential the scorer had already
  // excluded. Both now route through applicableCredentials().
  it('a genuine nurse is asked for NMC', async () => {
    const { credentialChecklist, classification } = await demandsFor('registered-nurse-no-nmc');
    expect(classification.occupation).toBe('registered_nurse');
    expect(credentialChecklist).toMatch(/NMC registration \(mandatory\)/);
  });

  it('the prompt checklist matches what the scorer would evaluate', async () => {
    for (const fixture of [
      'registered-nurse-no-nmc',
      'warehouse-flt-no-projects',
      'admin-office',
      'junior-dev-with-projects',
      'hca-no-nmc',
      'paralegal-no-sra',
    ] as FixtureCV[]) {
      const { classification, credentialChecklist } = await demandsFor(fixture);
      const profile = getOccupationProfile(classification.occupation);
      const scored = analyzeCredentials(loadFixtureCV(fixture), profile, classification);

      // Every credential the scorer judges must be named in the prompt, and
      // vice versa — a divergence means the AI and the score disagree about
      // what the candidate was even asked for.
      for (const finding of scored.findings) {
        expect(credentialChecklist, `${fixture}: scorer judges ${finding.label}`).toContain(
          finding.label
        );
      }
    }
  });
});

describe('appliesWhen gating in the prompt itself', () => {
  // No shipped profile currently exercises this: the only credential-level
  // `appliesWhen` is the nurse's NMC gate on `occupation === 'registered_nurse'`,
  // which is tautologically true whenever the nurse profile is the one
  // selected. So this asserts against a synthetic profile instead. It is the
  // test that fails if the prompt composer ever goes back to reading
  // `profile.credentials` directly — which matters the moment a profile gates
  // a credential on seniority or setting rather than on occupation.
  const base = getOccupationProfile('generic');
  const profile = {
    ...base,
    credentials: [
      {
        id: 'senior-only',
        label: 'Chartered status',
        class: 'desirable' as const,
        patterns: [/chartered/i],
        missingMessage: 'Chartered status is expected at senior level.',
        appliesWhen: (c: Classification) => c.seniority === 'senior',
      },
    ],
  };

  const baseClassification: Classification = {
    occupation: 'generic',
    sector: 'general',
    roleArchetype: 'generic',
    applicationWorkflow: 'cv_led',
    primaryArtifact: 'cv',
    secondaryArtifacts: [],
    seniority: 'mid',
    regulated: false,
    confidence: 0.3,
    source: 'fallback',
    reasonCodes: ['FALLBACK'],
  };

  function checklistFor(seniority: Classification['seniority']): string {
    const classification = { ...baseClassification, seniority };
    const prompt = composeSemanticPrompt(
      'CV text',
      { rawText: 'CV text', pageCount: 1, keywords: { present: [], missing: [] } } as never,
      profile,
      classification
    );
    return prompt.split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';
  }

  it('names a gated credential when the gate opens', () => {
    expect(checklistFor('senior')).toContain('Chartered status');
  });

  it('omits a gated credential when the gate is shut', () => {
    expect(checklistFor('entry')).toBe(
      '- Credential checklist: none expected for this occupation'
    );
  });
});

describe('occupations are not asked for each others evidence', () => {
  it('a warehouse operative is never asked for a projects section', async () => {
    const { prompts } = await demandsFor('warehouse-flt-no-projects');
    for (const prompt of prompts) {
      expect(prompt).toMatch(/Do not expect a projects or portfolio section\./);
    }
  });

  it('a nurse is never asked for software tooling', async () => {
    const { prompts } = await demandsFor('registered-nurse-no-nmc');
    for (const prompt of prompts) {
      expect(prompt).toMatch(/Do not expect software tools, programming languages/);
    }
  });

  it('a warehouse operative is never asked for a clinical registration', async () => {
    const { credentialChecklist } = await demandsFor('warehouse-flt-no-projects');
    expect(credentialChecklist).not.toMatch(/NMC|GPhC|GMC/);
  });

  it('a developer is never asked for an FLT licence', async () => {
    const { credentialChecklist } = await demandsFor('junior-dev-with-projects');
    expect(credentialChecklist).not.toMatch(/FLT|forklift|manual handling/i);
  });

  it('every non-generic fixture carries at least one explicit prohibition', async () => {
    for (const fixture of [
      'registered-nurse-no-nmc',
      'warehouse-flt-no-projects',
      'admin-office',
      'junior-dev-with-projects',
    ] as FixtureCV[]) {
      const { prompts } = await demandsFor(fixture);
      expect(prompts[0], fixture).toMatch(/STRICT PROHIBITIONS/);
    }
  });
});

describe('the AI classification tier is subject to the regulated activation guard', () => {
  // Previously a DOCUMENTED RISK: the deterministic tier correctly leaves an
  // HCA on generic below the ambiguity threshold, so the AI tier runs and its
  // answer used to be accepted at up to 0.9 — one AI misfire converting "no
  // credentials expected" into "NMC registration (mandatory)". The regulated
  // activation guard now governs the AI tier too: an AI suggestion of a
  // regulated occupation is only activated when the CV corroborates it via a
  // matching title or the mandatory credential. This test proves the misfire is
  // now absorbed rather than promoted.
  it('an AI misfire does NOT hand an HCA a mandatory NMC demand', async () => {
    const cvText = loadFixtureCV('hca-no-nmc');
    const aiSaysNurse = async () => ({
      occupation: 'registered_nurse',
      sector: 'healthcare_nhs',
      seniority: 'mid' as const,
      confidence: 0.85,
    });

    const classification = await classifyCV(
      { cvText, aiAllowed: true },
      aiSaysNurse as never
    );
    // The HCA's own evidence resolves it to Healthcare Support at the
    // deterministic tier, so the AI's nurse suggestion never even runs — and
    // even if it did, the regulated activation guard would reject it.
    expect(classification.occupation).toBe('healthcare_support');
    expect(classification.regulated).toBe(false);

    const profile = getOccupationProfile(classification.occupation);
    const prompt = composeSemanticPrompt(
      cvText,
      { rawText: cvText, pageCount: 2, keywords: { present: [], missing: [] } } as never,
      profile,
      classification
    );
    // The checklist (where a credential is demanded) never names a regulator.
    const checklistLine = prompt.split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';
    expect(checklistLine).not.toMatch(/NMC/);
  });

  it('the deterministic tier alone resolves the HCA to Healthcare Support', async () => {
    // The same CV, with the AI tier unavailable — the safeguard that is
    // actually load-bearing today. It confidently reaches the non-regulated
    // Healthcare Support profile rather than a clinician profile.
    const classification = await classifyCV(
      { cvText: loadFixtureCV('hca-no-nmc'), aiAllowed: false },
      aiMustNotRun
    );
    expect(classification.occupation).toBe('healthcare_support');
    expect(classification.regulated).toBe(false);
  });
});
