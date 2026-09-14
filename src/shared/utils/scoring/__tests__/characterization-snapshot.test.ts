// Numeric characterization net for the occupation-aware engine.
//
// Captured immediately BEFORE the Phase A relabelling (occupation profiles
// renamed to broad CV evaluation types) so that a pure naming change can be
// proven to be a pure naming change.
//
// What is snapshotted is deliberately the SCORE-BEARING surface only:
// category scores, credential findings, missing sections, and the shape of the
// recommendation list. User-facing prose is excluded on purpose — it embeds
// `profile.label`, which Phase A changes by design, and pinning it here would
// turn an intended rename into a false failure while hiding real rule drift in
// the noise.
//
// A diff in this file means an evaluation RULE moved. That is either a bug or
// a deliberate version bump, never a side effect of renaming something.

import { describe, it, expect } from 'vitest';
import { analyzeCV, type AnalyzeContext } from '@/shared/utils/scoring-engine';
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

/** Page counts matching the existing characterization suite. */
const PAGE_COUNT: Partial<Record<FixtureCV, number>> = {
  'junior-dev-with-projects': 2,
};

/**
 * The score-bearing projection of an analysis.
 *
 * `profileVersion` is excluded: Phase A bumps it on every relabelled profile,
 * which is the correct provenance signal for a label change and says nothing
 * about whether scoring moved. Occupation id IS included — a fixture drifting
 * to a different profile is exactly the regression this guards.
 */
async function scoreShapeOf(name: FixtureCV) {
  const text = loadFixtureCV(name);
  const classification = await classifyCV({ cvText: text, aiAllowed: false });
  const ctx: AnalyzeContext = {
    classification,
    profile: getOccupationProfile(classification.occupation),
  };
  const result = analyzeCV(text, PAGE_COUNT[name] ?? 1, ctx);

  return {
    occupation: classification.occupation,
    sector: classification.sector,
    seniority: classification.seniority,
    regulated: classification.regulated,
    source: classification.source,
    confidence: classification.confidence,
    reasonCodes: [...classification.reasonCodes].sort(),
    overallScore: result.overallScore,
    categories: result.categories.map((c) => ({
      id: c.id,
      score: c.score,
      maxScore: c.maxScore,
      status: c.status,
    })),
    credentials: {
      score: result.credentials?.score,
      notMaterial: result.credentials?.notMaterial,
      findings: result.credentials?.findings.map((f) => ({
        id: f.id,
        class: f.class,
        found: f.found,
      })),
    },
    missingRequiredSections: result.sectionOrder.missingRequired,
    recommendationShape: result.recommendations.map((r) => ({
      kind: r.kind,
      priority: r.priority,
    })),
  };
}

describe('numeric characterization (pre-Phase-A pin)', () => {
  it.each(FIXTURES)('%s scores identically', async (name) => {
    expect(await scoreShapeOf(name)).toMatchSnapshot();
  });
});
