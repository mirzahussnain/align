// Golden-fixture suite for the occupation-aware engine (scoring v2).
//
// Phase 0 pinned the old tech-default behaviour, including its defects.
// This phase intentionally replaces those pins: every expectation below states
// how the engine MUST now treat each occupation, and the prohibited-phrase
// assertions prove tech expectations can no longer leak into non-tech reports.

import { describe, it, expect } from 'vitest';
import { analyzeCV, fallbackContext, type AnalyzeContext } from '@/shared/utils/scoring-engine';
import { SCORING_WEIGHTS } from '@/shared/constants/scoring-config';
import { classifyCV } from '@/shared/services/classifier';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { loadFixtureCV, type FixtureCV } from '@/__fixtures__/load-cv';

const FIXTURES: FixtureCV[] = [
  'warehouse-flt-no-projects',
  'junior-dev-with-projects',
  'hca-no-nmc',
  'registered-nurse-no-nmc',
  'paralegal-no-sra',
  'admin-office',
];

/** Classify deterministically (no AI) and score — the degraded-quota path. */
async function analyzeFixture(name: FixtureCV, pageCount = 1) {
  const text = loadFixtureCV(name);
  const classification = await classifyCV({ cvText: text, aiAllowed: false });
  const ctx: AnalyzeContext = { classification, profile: getOccupationProfile(classification.occupation) };
  return analyzeCV(text, pageCount, ctx);
}

const category = (result: ReturnType<typeof analyzeCV>, id: string) => {
  const cat = result.categories.find(c => c.id === id);
  if (!cat) throw new Error(`category ${id} missing`);
  return cat;
};

const allReportText = (result: ReturnType<typeof analyzeCV>) =>
  [
    ...result.recommendations.map(r => `${r.title} ${r.description}`),
    ...result.categories.map(c => c.details),
    ...result.sectionOrder.suggestions,
  ].join('\n');

describe('scoring config invariants', () => {
  it('weights sum to exactly 1.0', () => {
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('every emitted category id carries a weight', async () => {
    const result = await analyzeFixture('admin-office');
    for (const cat of result.categories) {
      expect(SCORING_WEIGHTS[cat.id as keyof typeof SCORING_WEIGHTS], cat.id).toBeGreaterThan(0);
    }
  });
});

describe('warehouse operative with FLT licence and no projects', () => {
  it('is never judged on tech expectations', async () => {
    const result = await analyzeFixture('warehouse-flt-no-projects');
    const report = allReportText(result);
    expect(report).not.toMatch(/jest|cypress|playwright|vitest|github|tech stack|testing framework|cloud platform/i);
    expect(report).not.toMatch(/add a "Projects"/i);
  });

  it('recognises the FLT licence as high-value evidence', async () => {
    const result = await analyzeFixture('warehouse-flt-no-projects');
    const flt = result.credentials!.findings.find(f => f.id === 'flt-licence');
    expect(flt?.found).toBe(true);
  });

  it('scores real warehouse impact fairly (was floored at 3 pre-rebuild)', async () => {
    const result = await analyzeFixture('warehouse-flt-no-projects');
    expect(category(result, 'impactStatements').score).toBeGreaterThanOrEqual(6);
  });

  it('is not penalised on section completeness for lacking projects', async () => {
    const result = await analyzeFixture('warehouse-flt-no-projects');
    expect(result.sectionOrder.missingRequired).toEqual([]);
    expect(category(result, 'sectionCompleteness').score).toBeGreaterThanOrEqual(8);
  });

  it('scores well overall against warehouse expectations', async () => {
    const result = await analyzeFixture('warehouse-flt-no-projects');
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
  });
});

describe('junior developer with strong projects', () => {
  it('still classifies and scores as tech, unchanged or better', async () => {
    const result = await analyzeFixture('junior-dev-with-projects', 2);
    expect(result.classification!.occupation).toBe('software_engineer');
    expect(category(result, 'impactStatements').score).toBeGreaterThanOrEqual(7);
    expect(result.overallScore).toBeGreaterThanOrEqual(65);
  });

  it('does not lose the credentials weight for having no licences', async () => {
    const result = await analyzeFixture('junior-dev-with-projects', 2);
    // credentialRelevance is not_material for engineers... but a desirable
    // cloud cert rule exists; the junior dev fixture actually has one.
    expect(category(result, 'credentials').score).toBeGreaterThanOrEqual(8);
  });
});

describe('registered nurse without an NMC PIN', () => {
  it('raises a critical credential flag', async () => {
    const result = await analyzeFixture('registered-nurse-no-nmc');
    expect(result.classification!.occupation).toBe('registered_nurse');
    const nmc = result.credentials!.findings.find(f => f.id === 'nmc-registration');
    expect(nmc?.found).toBe(false);
    expect(category(result, 'credentials').score).toBeLessThanOrEqual(3);
    expect(
      result.recommendations.some(r => r.kind === 'credential' && r.priority === 'critical' && /NMC/i.test(r.title))
    ).toBe(true);
  });

  it('never asks a nurse for tech evidence', async () => {
    const result = await analyzeFixture('registered-nurse-no-nmc');
    expect(allReportText(result)).not.toMatch(/jest|cypress|playwright|vitest|github|testing framework/i);
  });
});

describe('healthcare assistant without an NMC PIN', () => {
  it('is NOT penalised for lacking NMC registration', async () => {
    const result = await analyzeFixture('hca-no-nmc');
    // The HCA must not classify as a registered nurse; whatever profile
    // applies, no NMC expectation may surface.
    expect(result.classification!.occupation).not.toBe('registered_nurse');
    expect(allReportText(result)).not.toMatch(/NMC/);
    expect(category(result, 'credentials').score).toBeGreaterThanOrEqual(8);
  });
});

describe('paralegal without an SRA practising certificate', () => {
  it('is NOT penalised for lacking SRA status', async () => {
    const result = await analyzeFixture('paralegal-no-sra');
    expect(allReportText(result)).not.toMatch(/SRA|practising certificate/i);
    expect(category(result, 'credentials').score).toBeGreaterThanOrEqual(8);
  });
});

describe('credential fairness across occupations', () => {
  it('occupations without material credentials get full credit', async () => {
    const result = await analyzeFixture('admin-office');
    const cat = category(result, 'credentials');
    // Administrator has only a desirable qualification rule; score must never
    // collapse for its absence.
    expect(cat.score).toBeGreaterThanOrEqual(8);
  });
});

describe('engine basics hold for every fixture', () => {
  it('produces 8 weighted categories, a 0-100 overall, and version stamps', async () => {
    for (const name of FIXTURES) {
      const result = await analyzeFixture(name);
      expect(result.categories).toHaveLength(8);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.scoringVersion).toBe(2);
      expect(result.profileVersion).toBeTruthy();
      expect(result.classification).toBeDefined();
    }
  });

  it('no false-positive compliance failures on any fixture', async () => {
    for (const name of FIXTURES) {
      const result = await analyzeFixture(name);
      const failed = result.compliance.filter(c => !c.passed);
      expect(failed, `${name}: ${failed.map(f => f.rule).join(', ')}`).toHaveLength(0);
    }
  });

  it('fallback context keeps the engine usable without classification', () => {
    const result = analyzeCV(loadFixtureCV('admin-office'), 1, fallbackContext());
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.classification!.occupation).toBe('generic');
  });
});
