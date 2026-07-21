import { describe, expect, it } from 'vitest';
import { toLegacyCvRewriteInput } from '@/shared/services/job-match-rewrite-adapter';
import type { JobMatchDataV2 } from '@/shared/types/ai';

const v2: JobMatchDataV2 = {
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
      confidence: 0.98,
      deduction: { points: 0, reason: 'Evidenced', rubric: 'met' },
    },
    {
      id: 'requirement-002',
      text: 'Kafka experience',
      importance: 'mandatory',
      category: 'tool',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.95,
      deduction: { points: 8, reason: 'Not evidenced', rubric: 'mandatory_supporting_missing' },
    },
  ],
  domainFit: {
    roleDomain: 'Data engineering',
    candidateDomain: 'Data engineering',
    status: 'aligned',
    overlapAreas: ['SQL'],
    detail: 'Aligned discipline',
    confidence: 0.9,
    deduction: { points: 0, reason: 'Aligned' },
  },
  matchScore: 92,
  matchFeedback: 'Good fit with one gap',
  experienceGap: 'Kafka',
  tailoredRewrites: [],
  cv_build_spec: {
    recommended_template: 'technical_precision',
    template_rationale: '',
    section_order: ['Experience'],
    lead_project: '',
    summary_angle: '',
    skills_to_surface: ['SQL'],
    skills_to_deprioritise: [],
    bullets_to_rewrite: [],
    visa_note_required: false,
    cover_letter_angle: '',
  },
};

describe('temporary CV rewrite adapter', () => {
  it('projects the v2 ledger into only the old fields the current rewriter consumes', () => {
    const projected = toLegacyCvRewriteInput(v2);

    expect(projected.mandatorySkills.present[0]).toContain('Five years of SQL');
    expect(projected.mandatorySkills.missing).toEqual(['Kafka experience']);
    expect(projected.cv_build_spec).toBe(v2.cv_build_spec);
    expect(projected).not.toHaveProperty('matchScore');
    expect(projected).not.toHaveProperty('selectionCriteria');
    expect(projected).not.toHaveProperty('scoringBreakdown');
  });

  it('carries the structured approval overlay without changing the ledger', () => {
    const before = structuredClone(v2);
    const overlay = [
      {
        requirementId: 'requirement-002',
        evidenceRef: { type: 'skill' as const, id: 'skill-db-1' },
        requirementText: 'Kafka experience',
        sourceProfileId: 'profile-1',
        resolvedEvidenceText: 'Apache Kafka',
        evidenceLocation: 'Data tools — Skills',
        userApproved: true as const,
      },
    ];

    expect(toLegacyCvRewriteInput(v2, overlay).approvedProfileEvidence).toEqual(overlay);
    expect(v2).toEqual(before);
  });
});
