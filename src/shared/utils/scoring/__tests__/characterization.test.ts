// Characterization tests: pin the CURRENT (pre-rebuild) behaviour of the
// deterministic scoring engine on the golden fixture CVs — including the
// behaviour that is wrong. Later phases intentionally change these outcomes;
// each phase updates the pins it invalidates so every behavioural diff in the
// rebuild is visible and deliberate rather than accidental.

import { describe, it, expect } from 'vitest';
import { analyzeCV } from '@/shared/utils/scoring-engine';
import { loadFixtureCV } from '@/__fixtures__/load-cv';

const category = (result: ReturnType<typeof analyzeCV>, id: string) => {
  const cat = result.categories.find(c => c.id === id);
  if (!cat) throw new Error(`category ${id} missing`);
  return cat;
};

describe('current engine: tech-default keyword pass', () => {
  it('scores every CV against the tech dictionary by default', () => {
    // KNOWN DEFECT (pinned): with no keyword options the engine assumes tech,
    // so a warehouse CV is "missing" testing frameworks and cloud platforms.
    const result = analyzeCV(loadFixtureCV('warehouse-flt-no-projects'), 1);
    const missing = result.keywords.missing.map(k => k.keyword.toLowerCase());
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some(k => /jest|cypress|playwright|react|aws|typescript/.test(k))).toBe(true);
  });

  it('warehouse CV gets a warehouse-fair keyword score only when told the industry', () => {
    const result = analyzeCV(loadFixtureCV('warehouse-flt-no-projects'), 1, {
      industry: 'warehouse_logistics',
    });
    const present = result.keywords.present.map(k => k.keyword.toLowerCase());
    expect(present.some(k => k.includes('flt') || k.includes('counterbalance') || k.includes('picking'))).toBe(true);
  });
});

describe('current engine: tech-shaped impact patterns', () => {
  it('KNOWN DEFECT (pinned): floors a strong warehouse CV', () => {
    // The warehouse fixture has real quantified impact (120 orders/shift,
    // 99.7% accuracy, zero accidents) but IMPACT_PATTERNS still catches the
    // percentage/number lines, so it lands mid-band rather than being judged
    // on sector-appropriate evidence. Percentages are effectively mandatory.
    const result = analyzeCV(loadFixtureCV('warehouse-flt-no-projects'), 1);
    const impact = category(result, 'impactStatements');
    expect(impact.score).toBeLessThanOrEqual(8);
  });

  it('KNOWN DEFECT (pinned): HCA CV with no percentages scores the floor', () => {
    const result = analyzeCV(loadFixtureCV('hca-no-nmc'), 1);
    expect(category(result, 'impactStatements').score).toBeLessThanOrEqual(5);
  });

  it('rewards the tech CV that speaks in percentages and user counts', () => {
    const result = analyzeCV(loadFixtureCV('junior-dev-with-projects'), 2);
    expect(category(result, 'impactStatements').score).toBeGreaterThanOrEqual(7);
  });
});

describe('current engine: single global section order', () => {
  it('produces a full 8-category result for each fixture', () => {
    for (const name of [
      'warehouse-flt-no-projects',
      'junior-dev-with-projects',
      'hca-no-nmc',
      'registered-nurse-no-nmc',
      'paralegal-no-sra',
      'admin-office',
    ] as const) {
      const result = analyzeCV(loadFixtureCV(name), 1);
      expect(result.categories).toHaveLength(8);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    }
  });

  it('junior dev CV satisfies the (tech-shaped) optimal order', () => {
    const result = analyzeCV(loadFixtureCV('junior-dev-with-projects'), 2);
    expect(category(result, 'sectionOrder').score).toBeGreaterThanOrEqual(8);
  });
});

describe('current engine: UK compliance rules stay quiet on clean CVs', () => {
  it('no false-positive compliance failures on any fixture', () => {
    for (const name of [
      'warehouse-flt-no-projects',
      'junior-dev-with-projects',
      'hca-no-nmc',
      'registered-nurse-no-nmc',
      'paralegal-no-sra',
      'admin-office',
    ] as const) {
      const result = analyzeCV(loadFixtureCV(name), 1);
      const failed = result.compliance.filter(c => !c.passed);
      expect(failed, `${name}: ${failed.map(f => f.rule).join(', ')}`).toHaveLength(0);
    }
  });
});
