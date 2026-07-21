import { describe, expect, it } from 'vitest';
import type { JobMatchDataV2 } from '@/shared/types/ai';
import {
  getEligibilityRequirements,
  getMandatoryRequirementGaps,
  getPersonSpecificationRequirements,
  getRequirementSummary,
} from '@/shared/utils/job-match-view';

const v2: JobMatchDataV2 = {
  schemaVersion: 2,
  requirements: [
    {
      id: 'requirement-001',
      text: 'NMC registration',
      importance: 'mandatory',
      category: 'credential',
      sourceSection: 'person_specification',
      evidenceRequired: true,
      status: 'met',
      evidence: [{ source: 'cv', text: 'NMC PIN 12A3456E', location: 'Registration' }],
      confidence: 0.99,
      deduction: { points: 0, reason: 'Direct evidence', rubric: 'met' },
    },
    {
      id: 'requirement-002',
      text: 'Right to work through contract end date',
      importance: 'mandatory',
      category: 'eligibility',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'unclear',
      evidence: [],
      confidence: 0.7,
      deduction: { points: 6, reason: 'Expiry date is absent', rubric: 'eligibility' },
    },
    {
      id: 'requirement-003',
      text: 'Mentoring experience',
      importance: 'desirable',
      category: 'experience',
      sourceSection: 'person_specification',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.9,
      deduction: { points: 2, reason: 'Not evidenced', rubric: 'desirable_missing' },
    },
  ],
  domainFit: {
    roleDomain: 'Registered nursing',
    candidateDomain: 'Registered nursing',
    status: 'aligned',
    overlapAreas: ['Acute wards'],
    detail: 'Aligned',
    confidence: 0.98,
    deduction: { points: 0, reason: 'Aligned' },
  },
  matchScore: 92,
  matchFeedback: 'Strong fit',
  experienceGap: 'Mentoring',
  tailoredRewrites: [],
  cv_build_spec: {
    recommended_template: 'sharp_minimal',
    template_rationale: '',
    section_order: ['Experience'],
    lead_project: '',
    summary_angle: '',
    skills_to_surface: [],
    skills_to_deprioritise: [],
    bullets_to_rewrite: [],
    visa_note_required: false,
    cover_letter_angle: '',
  },
};

describe('v2 job-match view', () => {
  it('derives counts, person-spec criteria, and eligibility from the ledger', () => {
    expect(getRequirementSummary(v2)).toMatchObject({
      essentialMatched: 1,
      essentialTotal: 2,
      desirableMatched: 0,
      desirableTotal: 1,
    });
    expect(getPersonSpecificationRequirements(v2).map((item) => item.id)).toEqual([
      'requirement-001',
      'requirement-003',
    ]);
    expect(getEligibilityRequirements(v2).map((item) => item.id)).toEqual(['requirement-002']);
  });

  it('derives the rewrite wizard gaps from canonical mandatory requirements', () => {
    expect(getMandatoryRequirementGaps(v2)).toEqual({
      missing: ['Right to work through contract end date'],
      partial: [],
    });
  });
});
