import { describe, it, expect } from 'vitest';
import {
  AISemanticOutputSchema,
  AIClassificationSchema,
  JobMatchDataV2Schema,
  parseStoredJobMatchData,
} from '../ai-output';

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
    expect(AISemanticOutputSchema.safeParse(goodSemantic).success).toBe(true);
  });

  it('clamps out-of-range scores instead of rejecting', () => {
    const parsed = AISemanticOutputSchema.parse({ ...goodSemantic, summaryScore: 14, impactScore: -3 });
    expect(parsed.summaryScore).toBe(10);
    expect(parsed.impactScore).toBe(0);
  });

  it('coerces numeric strings (a common model quirk)', () => {
    expect(AISemanticOutputSchema.parse({ ...goodSemantic, summaryScore: '8' }).summaryScore).toBe(8);
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
    const truncated: Partial<typeof goodSemantic> = { ...goodSemantic };
    delete truncated.summaryScore;
    expect(AISemanticOutputSchema.safeParse(truncated).success).toBe(false);
  });
});

const goodStoredJobMatch = {
  schemaVersion: 2,
  requirements: [
    {
      id: 'requirement-001',
      text: 'SQL',
      importance: 'mandatory',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'met',
      evidence: [{ source: 'cv', text: 'Five years of SQL' }],
      confidence: 0.95,
      deduction: { points: 0, reason: 'Evidenced', rubric: 'met' },
    },
  ],
  domainFit: {
    roleDomain: 'Data engineering',
    candidateDomain: 'Data engineering',
    status: 'aligned',
    overlapAreas: ['SQL'],
    detail: 'Aligned',
    confidence: 0.9,
    deduction: { points: 0, reason: 'Aligned' },
  },
  matchScore: 100,
  matchFeedback: 'Strong fit',
  experienceGap: '',
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
} as const;

describe('stored JobMatchDataV2', () => {
  it('accepts schemaVersion 2 data', () => {
    expect(JobMatchDataV2Schema.safeParse(goodStoredJobMatch).success).toBe(true);
    expect(parseStoredJobMatchData(goodStoredJobMatch)?.schemaVersion).toBe(2);
  });

  it('rejects versionless job-match data instead of interpreting it as legacy', () => {
    const versionless: { schemaVersion?: number } & Record<string, unknown> = { ...goodStoredJobMatch };
    delete versionless.schemaVersion;
    expect(parseStoredJobMatchData(versionless)).toBeNull();
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
