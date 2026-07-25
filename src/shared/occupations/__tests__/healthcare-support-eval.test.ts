// MEASUREMENT 2 — Generic vs. a PROPOSED Healthcare Support profile.
//
// Evaluation-only. The profile below is a throwaway defined in this file; it is
// NOT registered, NOT exported, and nothing in production can reach it. The
// purpose is to decide whether a maintained Healthcare Support rule pack would
// beat the generic fallback for HCA / care-worker CVs by a MATERIAL, REPEATABLE
// margin — not merely by using healthcare-flavoured wording.
//
// Decision rule (from the task): recommend adding the profile only if it
// produces a material, repeatable improvement over Generic without introducing
// unsafe assumptions. Healthcare-specific wording alone does not count.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { analyzeCV, type AnalyzeContext } from '@/shared/utils/scoring-engine';
import { genericProfile } from '@/shared/occupations/profiles/generic';
import { composeSemanticPrompt } from '@/shared/services/prompt-composer';
import { deriveSeniority } from '@/shared/services/classifier';
import type { OccupationProfile } from '@/shared/occupations/types';
import type { Classification, OccupationId } from '@/shared/types/classification';

// --- Fixtures (read directly so the shared typed loader stays untouched) ---
const FIXTURE_DIR = join(process.cwd(), 'src/__fixtures__/cvs');
const load = (name: string) => readFileSync(join(FIXTURE_DIR, `${name}.txt`), 'utf-8');
const FIXTURES = ['hca-no-nmc', 'care-worker-domiciliary'] as const;

// --- Proposed Healthcare Support profile (throwaway, minimal, SAFE) ---
const proposedHealthcareSupport: OccupationProfile = {
  id: 'healthcare_support' as OccupationId,
  version: '0.0.0-eval',
  label: 'Healthcare Support',
  sector: 'healthcare_nhs',
  roleArchetype: 'frontline_operative',
  applicationWorkflow: 'application_form_led',
  primaryArtifact: 'application_form',
  secondaryArtifacts: ['cv'],
  regulated: false,

  persona:
    'a UK health and social care recruiter experienced in hiring healthcare assistants, care workers, and support workers, screening for compassionate person-centred support, safe practice, reliability, DBS and mandatory training — never as a registered clinician',

  sections: {
    rules: [
      { section: 'professional-summary', presence: 'expected' },
      { section: 'core-skills', presence: 'required', note: 'Care competencies and the client groups you support.' },
      { section: 'certifications', presence: 'expected', note: 'Care Certificate, DBS, and mandatory training belong near the top.' },
      { section: 'professional-experience', presence: 'required' },
      { section: 'education', presence: 'optional' },
      { section: 'key-projects', presence: 'irrelevant' },
    ],
    orderConstraints: [
      {
        before: 'certifications',
        after: 'education',
        severity: 'suggestion',
        reason: 'Care Certificate, DBS, and mandatory training are screened before formal education for support roles.',
      },
    ],
  },

  evidencePriorities: [
    'person-centred, dignity-led personal care',
    'client groups supported (older adults, dementia, learning disabilities, community)',
    'safeguarding awareness and reporting concerns',
    'mandatory training currency (moving and handling, basic life support, infection control)',
    'reliability, attendance, and lone/community working',
    'clear communication and handover with families and colleagues',
  ],

  credentialRelevance: 'useful',
  credentials: [
    {
      id: 'care-certificate',
      label: 'Care Certificate',
      class: 'desirable',
      patterns: [/\bcare certificate\b/i],
      missingMessage:
        'Many care roles ask for the Care Certificate or a willingness to complete it — state it if you hold it (with year).',
    },
    {
      id: 'dbs-check',
      label: 'DBS check',
      class: 'desirable',
      patterns: [/\bDBS\b/i, /\bdisclosure and barring\b/i, /\benhanced disclosure\b/i],
      missingMessage:
        'An enhanced DBS check is standard for care roles — note if you hold one (and whether it is on the update service).',
    },
  ],

  impactPatterns: [
    /\d[\d,]*\+?\s*(?:\w+\s+){0,2}(?:patients?|residents?|clients?|service users?)\b/i,
    /\bpersonal care\b/i,
    /\b(?:dignity|person[- ]centred|independence)\b/i,
    /\b(?:safeguarding|escalat(?:e|ed|ing))\b/i,
    /\b(?:attendance|punctual(?:ity)?|reliab(?:le|ility))\b/i,
    /\b(?:supported?|assisted?|cared? for)\b.*\b(?:mobility|mealtimes?|medication|routines?)\b/i,
  ],
  impactGuidance:
    'Strong bullets show safe, kind, reliable support at stated scale: clients or residents per shift, the groups you support, safeguarding action taken, and dependable attendance. Numbers are never required — "personal care for up to 12 patients per shift" is strong evidence.',

  prohibitedExpectations: [
    'Do not expect or demand professional registration of any kind — NMC, GMC, GPhC, or HCPC. Support roles are unregistered.',
    'Do not expect a projects or portfolio section.',
    'Do not expect software tools, programming languages, or GitHub.',
    'Do not require revenue figures or business metrics in achievement bullets.',
    'Do not treat the candidate as a registered clinician or expect clinician-level autonomy.',
  ],

  summaryGuidance:
    'Three lines: who you are as a care professional, years and settings of care experience, and your Care Certificate/training plus the person-centred strength the role calls for.',

  detection: {
    titlePatterns: [
      /\bhealthcare\s+assistant\b/i,
      /\bcare\s+(?:worker|assistant)\b/i,
      /\bsupport\s+worker\b/i,
      /\bHCA\b/,
      /\bdomiciliary\s+care\b/i,
    ],
    dutyPatterns: [
      /\bpersonal care\b/i,
      /\bsafeguarding\b/i,
      /\bmoving and handling\b|\bmanual handling\b/i,
      /\bmedication (?:prompting|administration|MAR)\b/i,
    ],
    sectorHint: 'healthcare_nhs',
  },
};

// --- Classification builders (both non-regulated, both self-declared) ---
function classificationFor(profile: OccupationProfile, cvText: string): Classification {
  return {
    occupation: profile.id,
    sector: profile.sector,
    roleArchetype: profile.roleArchetype,
    applicationWorkflow: profile.applicationWorkflow,
    primaryArtifact: profile.primaryArtifact,
    secondaryArtifacts: profile.secondaryArtifacts,
    seniority: deriveSeniority(cvText),
    regulated: profile.regulated,
    confidence: 0.9,
    source: 'profile_target',
    reasonCodes: ['PROFILE_TARGET_SET'],
  };
}

function analyzeUnder(profile: OccupationProfile, cvText: string) {
  const classification = classificationFor(profile, cvText);
  const ctx: AnalyzeContext = { classification, profile };
  const result = analyzeCV(cvText, 2, ctx);
  const prompt = composeSemanticPrompt(
    cvText,
    { rawText: cvText, pageCount: 2, keywords: { present: [], missing: [] } } as never,
    profile,
    classification
  );
  return { classification, result, prompt };
}

const catScores = (r: ReturnType<typeof analyzeCV>) =>
  Object.fromEntries(r.categories.map((c) => [c.id, c.score]));

const recSummary = (r: ReturnType<typeof analyzeCV>) =>
  r.recommendations.map((x) => `${x.priority}/${x.kind}: ${x.title}`);

// A registration is DEMANDED only if it appears on the credential checklist
// line. A mention inside the prohibitions block ("Do not expect NMC…") is the
// opposite of a demand and must not be counted as one.
const checklistLine = (prompt: string) =>
  prompt.split('\n').find((l) => l.startsWith('- Credential checklist:')) ?? '';
const registrationDemanded = (prompt: string) =>
  /NMC|GMC|GPhC|HCPC/i.test(checklistLine(prompt));
const prohibitionNamesRegulators = (prompt: string) => {
  const instr = prompt.split('"""')[0];
  const block = instr.slice(instr.indexOf('STRICT PROHIBITIONS'));
  return /NMC|GMC|GPhC|HCPC/i.test(block);
};

describe('MEASUREMENT 2 — Generic vs proposed Healthcare Support', () => {
  it.each(FIXTURES)('%s — full comparison', (name) => {
    const cvText = load(name);
    const generic = analyzeUnder(genericProfile, cvText);
    const proposed = analyzeUnder(proposedHealthcareSupport, cvText);

    const gCats = catScores(generic.result);
    const pCats = catScores(proposed.result);
    const dimDelta = Object.fromEntries(
      Object.keys(gCats).map((k) => [k, Number((pCats[k] - gCats[k]).toFixed(1))])
    );

    console.log(
      `\n[MEASUREMENT 2] ${name}\n` +
        JSON.stringify(
          {
            generic: {
              overall: generic.result.overallScore,
              categories: gCats,
              credentialScore: generic.result.credentials?.score,
              credentialFindings: generic.result.credentials?.findings.map((f) => `${f.id}:${f.found}`),
              missingRequired: generic.result.sectionOrder.missingRequired,
              recommendations: recSummary(generic.result),
              registrationDemanded: registrationDemanded(generic.prompt),
              prohibitionNamesRegulators: prohibitionNamesRegulators(generic.prompt),
            },
            proposed: {
              overall: proposed.result.overallScore,
              categories: pCats,
              credentialScore: proposed.result.credentials?.score,
              credentialFindings: proposed.result.credentials?.findings.map((f) => `${f.id}:${f.found}`),
              missingRequired: proposed.result.sectionOrder.missingRequired,
              recommendations: recSummary(proposed.result),
              registrationDemanded: registrationDemanded(proposed.prompt),
              prohibitionNamesRegulators: prohibitionNamesRegulators(proposed.prompt),
            },
            dimensionDelta: dimDelta,
            overallDelta: proposed.result.overallScore - generic.result.overallScore,
            promptOnlyInProposed: {
              evidencePriorities: proposedHealthcareSupport.evidencePriorities,
              prohibitionsMentionRegistration: proposedHealthcareSupport.prohibitedExpectations.some((p) =>
                /NMC|GMC|GPhC|HCPC|registration/i.test(p)
              ),
            },
          },
          null,
          2
        )
    );

    // Safety floor: NEITHER path may DEMAND a professional registration.
    expect(registrationDemanded(generic.prompt)).toBe(false);
    expect(registrationDemanded(proposed.prompt)).toBe(false);
    // The proposed profile additionally names the regulators to PROHIBIT them —
    // an explicit safety instruction generic does not carry.
    expect(prohibitionNamesRegulators(proposed.prompt)).toBe(true);
    expect(prohibitionNamesRegulators(generic.prompt)).toBe(false);
    // Neither path may floor the credentials dimension (no mandatory rule).
    expect(generic.result.credentials?.notMaterial).toBe(true);
    expect(proposed.result.credentials?.score).toBeGreaterThanOrEqual(8);
  });
});
