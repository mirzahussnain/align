import { describe, expect, it } from 'vitest';
import { AIJobMatchV2RawSchema, JobMatchDataV2Schema } from '@/shared/schemas/ai-output';
import { normalizeJobMatchDataV2 } from '@/shared/services/job-match-ledger';
import type { JobMatchDataV2Draft } from '@/shared/types/ai';

function draft(): JobMatchDataV2Draft {
  return {
    schemaVersion: 2, jobTitle: 'Data Engineer', jobCompany: 'Acme',
    requirements: [
      { text: 'Strong SQL experience', importance: 'mandatory', category: 'skill', sourceSection: 'job_description', evidenceRequired: true, status: 'met', evidence: [{ source: 'cv', text: 'Built SQL data pipelines' }], confidence: 0.95, deduction: { points: 0, reason: 'Direct evidence', rubric: 'met' } },
      { text: 'Kafka experience', importance: 'desirable', category: 'tool', sourceSection: 'person_specification', evidenceRequired: true, status: 'not_met', evidence: [], confidence: 0.9, deduction: { points: 2, reason: 'Not evidenced', rubric: 'desirable_missing' } },
    ],
    domainFit: { roleDomain: 'Data engineering', candidateDomain: 'Analytics engineering', status: 'partial', overlapAreas: ['SQL'], detail: 'Partial', confidence: 0.8, deduction: { points: 5, reason: 'partial' } },
    matchFeedback: 'A credible partial fit.', experienceGap: 'Streaming depth', tailoredRewrites: [],
  };
}

describe('V2 requirement ledger normalization', () => {
  it('assigns server ids and derives the score without any CV build directive', () => {
    const normalized = normalizeJobMatchDataV2(draft());
    expect(normalized.requirements.map((item) => item.id)).toEqual(['requirement-001', 'requirement-002']);
    expect(normalized.matchScore).toBe(93);
    expect(normalized).not.toHaveProperty('cv_build_spec');
  });
  it('rejects negative deductions and duplicate persisted ids', () => {
    const invalid = draft(); invalid.requirements[0].deduction.points = -1;
    expect(AIJobMatchV2RawSchema.safeParse(invalid).success).toBe(false);
    const normalized = normalizeJobMatchDataV2(draft());
    normalized.requirements[1].id = normalized.requirements[0].id;
    expect(JobMatchDataV2Schema.safeParse(normalized).success).toBe(false);
  });
});
