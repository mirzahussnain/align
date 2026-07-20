import { describe, it, expect } from 'vitest';
import { AISemanticOutputSchema, AIJobMatchOutputSchema, AIClassificationSchema } from '../ai-output';

const goodSemantic = {
  summaryScore: 7,
  summaryFeedback: 'Good',
  impactScore: 6,
  impactFeedback: 'Fine',
  additionalKeywords: [{ keyword: 'RF scanner', category: 'Equipment', count: 2 }],
  rewrites: [{ original: 'a', suggested: 'b', rationale: 'c' }],
  alignmentNote: 'Well aligned to warehouse operative expectations.',
  detectedRole: 'Warehouse Operative',
  credentialObservations: ['FLT licence clearly dated'],
  riskFlags: [],
  clichés: ['passionate'],
};

describe('AISemanticOutputSchema', () => {
  it('accepts a well-formed output', () => {
    const parsed = AISemanticOutputSchema.safeParse(goodSemantic);
    expect(parsed.success).toBe(true);
  });

  it('clamps out-of-range scores instead of rejecting', () => {
    const parsed = AISemanticOutputSchema.parse({ ...goodSemantic, summaryScore: 14, impactScore: -3 });
    expect(parsed.summaryScore).toBe(10);
    expect(parsed.impactScore).toBe(0);
  });

  it('coerces numeric strings (a common model quirk)', () => {
    const parsed = AISemanticOutputSchema.parse({ ...goodSemantic, summaryScore: '8' });
    expect(parsed.summaryScore).toBe(8);
  });

  it('carries no classification or tech-detection fields', () => {
    const parsed = AISemanticOutputSchema.parse(goodSemantic) as Record<string, unknown>;
    expect(parsed.detectedIndustry).toBeUndefined();
    expect(parsed.isTechRole).toBeUndefined();
    expect(parsed.hasTesting).toBeUndefined();
  });

  it('passes unknown extra fields through instead of failing', () => {
    const parsed = AISemanticOutputSchema.parse({ ...goodSemantic, modelNote: 'extra' });
    expect((parsed as Record<string, unknown>).modelNote).toBe('extra');
  });

  it('rejects output missing the scores the route reads', () => {
    const { summaryScore: _, ...truncated } = goodSemantic;
    expect(AISemanticOutputSchema.safeParse(truncated).success).toBe(false);
  });
});

const goodJobMatch = {
  jobTitle: 'Senior Data Engineer',
  jobCompany: 'Acme',
  mandatorySkills: { present: ['SQL → 5 years'], missing: ['Spark'], partial: [] },
  desirableSkills: { present: [], missing: ['Kafka'] },
  domainFit: { roleDomain: 'data eng', candidateDomain: 'analytics', mismatch: false, overlapAreas: [], detail: '' },
  eligibilityFlags: [],
  scoringBreakdown: [{ item: 'Spark', classification: 'missing', deduction: 10, reason: 'not on CV' }],
  matchScore: 72,
  matchFeedback: 'Decent fit.',
  experienceGap: 'Spark experience',
  tailoredRewrites: [],
  cv_build_spec: {
    recommended_template: 'sharp_minimal',
    template_rationale: '',
    section_order: ['Experience', 'Skills'],
    lead_project: '',
    summary_angle: '',
    skills_to_surface: ['SQL'],
    skills_to_deprioritise: [],
    bullets_to_rewrite: [],
    visa_note_required: false,
    cover_letter_angle: '',
  },
};

describe('AIJobMatchOutputSchema', () => {
  it('accepts a well-formed output', () => {
    expect(AIJobMatchOutputSchema.safeParse(goodJobMatch).success).toBe(true);
  });

  it('clamps matchScore into 0..100', () => {
    expect(AIJobMatchOutputSchema.parse({ ...goodJobMatch, matchScore: 103 }).matchScore).toBe(100);
  });

  it('keeps cv_build_spec intact for the rewrite pipeline', () => {
    const parsed = AIJobMatchOutputSchema.parse(goodJobMatch);
    expect(parsed.cv_build_spec.section_order).toEqual(['Experience', 'Skills']);
    expect(parsed.cv_build_spec.visa_note_required).toBe(false);
  });

  it('rejects output with no mandatorySkills block', () => {
    const { mandatorySkills: _, ...truncated } = goodJobMatch;
    expect(AIJobMatchOutputSchema.safeParse(truncated).success).toBe(false);
  });

  it('salvages malformed optional arrays instead of failing', () => {
    const parsed = AIJobMatchOutputSchema.parse({ ...goodJobMatch, eligibilityFlags: 'none' });
    expect(parsed.eligibilityFlags).toEqual([]);
  });
});

describe('AIClassificationSchema', () => {
  it('accepts a well-formed classification', () => {
    const parsed = AIClassificationSchema.parse({
      occupation: 'registered_nurse',
      sector: 'healthcare_nhs',
      seniority: 'mid',
      confidence: 0.92,
    });
    expect(parsed.occupation).toBe('registered_nurse');
  });

  it('maps invented occupations and sectors to safe defaults', () => {
    const parsed = AIClassificationSchema.parse({
      occupation: 'ninja',
      sector: 'metaverse',
      seniority: 'wizard',
      confidence: 3,
    });
    expect(parsed.occupation).toBe('generic');
    expect(parsed.sector).toBe('general');
    expect(parsed.seniority).toBe('unknown');
    expect(parsed.confidence).toBe(1);
  });
});
