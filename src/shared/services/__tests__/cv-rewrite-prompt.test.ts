import { describe, expect, it } from 'vitest';
import { composeRewritePrompt } from '@/shared/services/cv-rewrite-prompt';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import type { CvBuildSpec } from '@/shared/types/ai';

const SPEC: CvBuildSpec = {
  recommended_template: 'architect',
  template_rationale: '',
  section_order: ['Experience'],
  lead_project: '',
  summary_angle: '',
  skills_to_surface: [],
  skills_to_deprioritise: [],
  bullets_to_rewrite: [],
  visa_note_required: false,
  cover_letter_angle: '',
};

function makeInput(overrides: Partial<LedgerNativeRewriteInput> = {}): LedgerNativeRewriteInput {
  return {
    cvText: 'CV text.',
    jobDescription: 'JD text.',
    rewriteContext: {
      requirements: [
        {
          id: 'r1',
          text: 'Kafka experience',
          importance: 'mandatory',
          status: 'not_met',
          category: 'tool',
          cvEvidence: [],
          approvedProfileEvidence: [],
        },
      ],
      eligibilityConstraints: [],
      cvBuildSpec: SPEC,
    },
    approvedProfileEvidence: [],
    template: 'architect',
    ...overrides,
  };
}

describe('composeRewritePrompt', () => {
  it('leads with the non-negotiable truthfulness rules', () => {
    const prompt = composeRewritePrompt(makeInput());
    expect(prompt).toContain('NON-NEGOTIABLE TRUTHFULNESS RULES');
    expect(prompt).toMatch(/never invent/i);
  });

  it('contains none of the removed inference-permitting language', () => {
    const prompt = composeRewritePrompt(makeInput()).toLowerCase();
    for (const forbidden of [
      'reasonably inferred',
      'plausible metric',
      'infer conservative',
      'assumed proficiency',
      'reasonably be inferred',
      'infer conservative, plausible metrics',
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it('marks a not_met requirement as one that must not be claimed', () => {
    const prompt = composeRewritePrompt(makeInput());
    expect(prompt).toMatch(/NOT MET[^\n]*MUST NOT be written as possessed/);
  });

  it('orders sections rules → CV → vacancy → ledger', () => {
    const prompt = composeRewritePrompt(makeInput());
    const truth = prompt.indexOf('NON-NEGOTIABLE TRUTHFULNESS RULES');
    const cv = prompt.indexOf('SOURCE CV');
    const vacancy = prompt.indexOf('TARGET VACANCY');
    const ledger = prompt.indexOf('COMPACT REQUIREMENT LEDGER');
    expect(truth).toBeLessThan(cv);
    expect(cv).toBeLessThan(vacancy);
    expect(vacancy).toBeLessThan(ledger);
  });

  it('renders approved profile evidence only when present', () => {
    expect(composeRewritePrompt(makeInput())).not.toContain('APPROVED PROFILE EVIDENCE');
    const withEvidence = composeRewritePrompt(
      makeInput({
        approvedProfileEvidence: [
          {
            requirementId: 'r1',
            evidenceRef: { type: 'skill', id: 'skill-1' },
            requirementText: 'Kafka experience',
            sourceProfileId: 'p1',
            resolvedEvidenceText: 'Apache Kafka',
            evidenceLocation: 'Data tools — Skills',
            userApproved: true,
          },
        ],
      })
    );
    expect(withEvidence).toContain('APPROVED PROFILE EVIDENCE');
    expect(withEvidence).toContain('Apache Kafka');
  });
});
