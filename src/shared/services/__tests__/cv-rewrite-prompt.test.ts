import { describe, expect, it } from 'vitest';
import { composeRewritePrompt } from '@/shared/services/cv-rewrite-prompt';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import type { AiCvBuildGuidance } from '@/shared/types/ai';

const SPEC: AiCvBuildGuidance = {
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
  it('uses an industry-neutral recruiter perspective for a technical vacancy', () => {
    const prompt = composeRewritePrompt(makeInput({
      cvText: 'Software engineer with TypeScript experience.',
      jobDescription: 'Software Engineer building TypeScript services.',
    }));

    expect(prompt).toContain('expert UK recruiter');
    expect(prompt).not.toMatch(/technical recruiter/i);
  });

  it('uses an industry-neutral recruiter perspective for a non-technical vacancy', () => {
    const prompt = composeRewritePrompt(makeInput({
      cvText: 'Warehouse operative experienced in goods-in and stock control.',
      jobDescription: 'Warehouse Operative responsible for dispatch and inventory accuracy.',
    }));

    expect(prompt).toContain('expert UK recruiter');
    expect(prompt).not.toMatch(/technical recruiter/i);
  });

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
  it('supplies only server-issued identifiers for claim provenance', () => {
    const prompt = composeRewritePrompt(
      makeInput({
        applicationEvidence: [
          {
            id: 'context-1',
            requirementId: 'r1',
            context: { label: 'Kafka', text: 'Used Kafka in an application project.' },
          },
        ],
        approvedProfileEvidence: [
          {
            requirementId: 'r1',
            evidenceRef: { type: 'skill', id: 'skill-1' },
            requirementText: 'Kafka experience',
            sourceProfileId: 'p1',
            resolvedEvidenceText: 'Kafka',
            evidenceLocation: 'Skills',
            userApproved: true,
          },
        ],
      })
    );
    expect(prompt).toContain('[id:r1]');
    expect(prompt).toContain('[type:skill] [id:skill-1]');
    expect(prompt).toContain('[contextId:context-1] [requirementId:r1]');
    expect(prompt).toContain('Never invent an id');
  });

  it('separates strategy from evidence and keeps regulated claims evidence-bound', () => {
    const prompt = composeRewritePrompt(makeInput());
    expect(prompt).toContain('Build guidance is strategy, never evidence');
    expect(prompt).toContain('registration, licence, visa or eligibility, language proficiency');
    expect(prompt).toContain('Do not recalculate requirement scores or statuses');
    expect(prompt).toContain('unsupportedRequirementsNotAdded');
  });
});
