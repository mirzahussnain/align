import { describe, expect, it } from 'vitest';
import {
  buildRewriteInput,
  cleanCvText,
  cleanJobDescription,
  projectRequirements,
} from '@/shared/services/cv-rewrite-context';
import { composeRewritePrompt } from '@/shared/services/cv-rewrite-prompt';
import type {
  JobMatchDataV2,
  JobRequirementLedgerEntry,
  RequirementEvidence,
} from '@/shared/types/ai';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';

function requirement(partial: Partial<JobRequirementLedgerEntry>): JobRequirementLedgerEntry {
  return {
    id: 'r1',
    text: 'Requirement',
    importance: 'mandatory',
    category: 'skill',
    sourceSection: 'job_description',
    evidenceRequired: true,
    status: 'met',
    evidence: [],
    confidence: 0.9,
    deduction: { points: 0, reason: 'Evidenced', rubric: 'met' },
    ...partial,
  };
}

function jobMatch(requirements: JobRequirementLedgerEntry[]): JobMatchDataV2 {
  return {
    schemaVersion: 2,
    requirements,
    domainFit: {
      roleDomain: 'Data engineering',
      candidateDomain: 'Data engineering',
      status: 'aligned',
      overlapAreas: ['SQL'],
      detail: 'Aligned discipline',
      confidence: 0.9,
      deduction: { points: 0, reason: 'Aligned' },
    },
    matchScore: 100,
    matchFeedback: 'Strong fit',
    experienceGap: '',
    tailoredRewrites: [],
    cv_build_spec: {
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
    },
  };
}

const BUILD_PARAMS = {
  approvedProfileEvidence: [] as ApprovedProfileEvidenceOverlay[],
  userContext: [],
  cvText: 'A perfectly ordinary CV with SQL and Python experience.',
  jobDescription: 'We need a data engineer.',
  template: 'architect' as const,
};

describe('projectRequirements', () => {
  it('projects only compact fields and drops all scoring metadata', () => {
    const cvEvidence: RequirementEvidence = { source: 'cv', text: 'Five years of SQL' };
    const profileEvidence: RequirementEvidence = { source: 'profile', text: 'ignored profile text' };
    const projected = projectRequirements(
      jobMatch([requirement({ id: 'r1', status: 'met', evidence: [cvEvidence, profileEvidence] })]),
      [],
      600
    );

    // Exact shape — no confidence, no deduction, no sourceSection.
    expect(projected[0]).toEqual({
      id: 'r1',
      text: 'Requirement',
      importance: 'mandatory',
      status: 'met',
      category: 'skill',
      cvEvidence: ['Five years of SQL'],
      approvedProfileEvidence: [],
    });
  });

  it('attaches approved profile evidence to its requirement', () => {
    const overlay: ApprovedProfileEvidenceOverlay = {
      requirementId: 'r1',
      evidenceRef: { type: 'skill', id: 'skill-1' },
      requirementText: 'Requirement',
      sourceProfileId: 'p1',
      resolvedEvidenceText: 'Apache Kafka',
      evidenceLocation: 'Data tools — Skills',
      userApproved: true,
    };
    const projected = projectRequirements(jobMatch([requirement({ id: 'r1', status: 'not_met' })]), [overlay], 600);
    expect(projected[0].approvedProfileEvidence).toEqual(['Apache Kafka']);
  });
});

describe('buildRewriteInput token budget', () => {
  it('does not let unrelated ledger metadata increase prompt size', () => {
    const evidence: RequirementEvidence = { source: 'cv', text: 'Five years of SQL' };
    const lean = buildRewriteInput({
      ...BUILD_PARAMS,
      jobMatch: jobMatch([requirement({ id: 'r1', status: 'met', evidence: [evidence] })]),
    });
    const bloated = buildRewriteInput({
      ...BUILD_PARAMS,
      jobMatch: jobMatch([
        requirement({
          id: 'r1',
          status: 'met',
          evidence: [evidence],
          confidence: 0.999,
          deduction: { points: 0, reason: 'x'.repeat(5000), rubric: 'met' },
        }),
      ]),
    });

    expect(bloated.debug.estimatedPromptTokens).toBe(lean.debug.estimatedPromptTokens);
  });

  it('never truncates truth rules or essential/contradicted requirements under an aggressive budget', () => {
    const { input, debug } = buildRewriteInput({
      ...BUILD_PARAMS,
      jobMatch: jobMatch([
        requirement({ id: 'm1', importance: 'mandatory', status: 'not_met', text: 'Mandatory core' }),
        requirement({ id: 'c1', importance: 'desirable', status: 'contradicted', text: 'Desirable contradicted' }),
        requirement({ id: 'd1', importance: 'desirable', status: 'met', text: 'Desirable met' }),
        requirement({ id: 'e1', importance: 'mandatory', status: 'not_met', category: 'eligibility', text: 'Eligible to work' }),
      ]),
      limits: { maxPromptTokens: 1, maxRequirementEvidenceChars: 600, maxCvChars: 12000, maxJobDescriptionChars: 6000 },
    });

    const ids = input.rewriteContext.requirements.map((r) => r.id);
    expect(ids).toContain('m1'); // essential — never dropped
    expect(ids).toContain('c1'); // contradicted — never dropped
    expect(ids).toContain('e1'); // essential — never dropped
    expect(ids).not.toContain('d1'); // desirable & met — droppable

    expect(debug.droppedSections).toContain('desirable_requirements');
    expect(debug.droppedSections).toContain('domain_context');
    expect(input.rewriteContext.domainFit).toBeUndefined();
    expect(input.rewriteContext.eligibilityConstraints).toEqual([]);

    // Truth rules are always present in the composed prompt.
    expect(composeRewritePrompt(input)).toContain('NON-NEGOTIABLE TRUTHFULNESS RULES');
  });
});

describe('deterministic text cleaning', () => {
  it('strips page markers and collapses repeated running headers', () => {
    const raw = [
      'John Doe',
      'john@example.com',
      'Page 1 of 3',
      'Experience',
      'Data Engineer',
      'John Doe',
      'john@example.com',
      'Page 2 of 3',
      'Skills',
      'John Doe',
      'john@example.com',
    ].join('\n');

    const cleaned = cleanCvText(raw);
    expect(cleaned).not.toContain('Page 1 of 3');
    expect(cleaned).not.toContain('Page 2 of 3');
    expect(cleaned.split('John Doe').length - 1).toBe(1);
    expect(cleaned).toContain('Data Engineer');
  });

  it('drops equal-opportunities and benefits boilerplate from a vacancy', () => {
    const raw = [
      'We need a Data Engineer with strong SQL.',
      'We are an equal opportunities employer and welcome applicants regardless of race, gender, or age.',
      'Benefits include free lunch and a gym membership.',
    ].join('\n\n');

    const cleaned = cleanJobDescription(raw);
    expect(cleaned).toContain('Data Engineer with strong SQL');
    expect(cleaned.toLowerCase()).not.toContain('equal opportunities');
    expect(cleaned).not.toContain('Benefits include');
  });
});

describe('generation-time build-spec grounding', () => {
  const overlay = (resolvedEvidenceText: string): ApprovedProfileEvidenceOverlay => ({
    requirementId: 'r1',
    evidenceRef: { type: 'skill', id: 's1' },
    requirementText: 'Throughput',
    sourceProfileId: 'p1',
    resolvedEvidenceText,
    evidenceLocation: 'Systems — Skills',
    userApproved: true,
  });

  function withBullet(status: 'met' | 'not_met', newBody: string, newLabel = 'Latency') {
    const jm = jobMatch([requirement({ id: 'r1', status })]);
    jm.cv_build_spec.bullets_to_rewrite = [
      { project_or_role: 'Role', original_label: 'Perf', new_label: newLabel, new_body: newBody },
    ];
    return jm;
  }

  it('demotes an unsupported build-spec metric before prompt composition', () => {
    const { input } = buildRewriteInput({ ...BUILD_PARAMS, jobMatch: withBullet('met', 'Cut latency by 90%.') });
    expect(input.rewriteContext.cvBuildSpec.bullets_to_rewrite[0].new_body).toBe(
      'Rewrite this bullet to emphasise Latency using only verified evidence from this role.'
    );
  });

  it('operates on a copy — the stored jobMatch spec is not mutated', () => {
    const jm = withBullet('met', 'Cut latency by 90%.');
    const before = structuredClone(jm.cv_build_spec);
    buildRewriteInput({ ...BUILD_PARAMS, jobMatch: jm });
    expect(jm.cv_build_spec).toEqual(before);
  });

  it('keeps a metric that newly approved profile evidence supports', () => {
    const { input } = buildRewriteInput({
      ...BUILD_PARAMS,
      jobMatch: withBullet('not_met', 'Handled 1,200,000 requests daily.', 'Throughput'),
      approvedProfileEvidence: [overlay('Handled 1,200,000 requests daily')],
    });
    expect(input.rewriteContext.cvBuildSpec.bullets_to_rewrite[0].new_body).toBe(
      'Handled 1,200,000 requests daily.'
    );
  });

  it('keeps a metric that explicit user context supports', () => {
    const { input } = buildRewriteInput({
      ...BUILD_PARAMS,
      jobMatch: withBullet('met', 'Owned a £2,000,000 budget.', 'Budget ownership'),
      userContext: [{ label: 'Budget', text: 'I owned a £2,000,000 budget in my last role.' }],
    });
    expect(input.rewriteContext.cvBuildSpec.bullets_to_rewrite[0].new_body).toBe(
      'Owned a £2,000,000 budget.'
    );
  });
});
