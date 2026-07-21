import { describe, expect, it } from 'vitest';
import {
  AIJobMatchV2RawSchema,
  JobMatchDataV2Schema,
} from '@/shared/schemas/ai-output';
import { normalizeJobMatchDataV2 } from '@/shared/services/job-match-ledger';
import type { JobMatchDataV2Draft } from '@/shared/types/ai';

const cvBuildSpec = {
  recommended_template: 'technical_precision',
  template_rationale: 'Role fit',
  section_order: ['Experience', 'Skills'],
  lead_project: 'Streaming platform',
  summary_angle: 'Lead with reliable data delivery',
  skills_to_surface: ['SQL'],
  skills_to_deprioritise: ['CSS'],
  bullets_to_rewrite: [],
  visa_note_required: false,
  cover_letter_angle: 'Operational ownership',
};

function draft(status: 'aligned' | 'partial' | 'mismatch' = 'partial'): JobMatchDataV2Draft {
  return {
    schemaVersion: 2,
    jobTitle: 'Data Engineer',
    jobCompany: 'Acme',
    requirements: [
      {
        text: 'Strong SQL experience',
        importance: 'mandatory',
        category: 'skill',
        sourceSection: 'job_description',
        evidenceRequired: true,
        status: 'met',
        evidence: [{ source: 'cv', text: 'Built SQL data pipelines', location: 'Experience' }],
        confidence: 0.95,
        deduction: { points: 0, reason: 'Direct evidence', rubric: 'met' },
      },
      {
        text: 'Kafka experience',
        importance: 'desirable',
        category: 'tool',
        sourceSection: 'person_specification',
        evidenceRequired: true,
        status: 'not_met',
        evidence: [],
        confidence: 0.9,
        deduction: { points: 2, reason: 'Not evidenced', rubric: 'desirable_missing' },
      },
    ],
    domainFit: {
      roleDomain: 'Data engineering',
      candidateDomain: 'Analytics engineering',
      status,
      overlapAreas: ['SQL modelling'],
      detail: 'Same discipline, different production depth.',
      confidence: 0.8,
      deduction: { points: status === 'aligned' ? 0 : status === 'partial' ? 5 : 13, reason: status },
    },
    matchFeedback: 'A credible partial fit.',
    experienceGap: 'Streaming depth',
    tailoredRewrites: [],
    cv_build_spec: cvBuildSpec,
  };
}

describe('v2 requirement ledger normalization', () => {
  it('assigns unique server ids, ignores model ids, and computes the final score', () => {
    const input = draft();
    const spoofed = input.requirements.map((requirement) => ({ ...requirement, id: 'duplicate-model-id' }));
    const normalized = normalizeJobMatchDataV2({
      ...input,
      requirements: spoofed,
      matchScore: 99,
    } as JobMatchDataV2Draft);

    expect(normalized.requirements.map((requirement) => requirement.id)).toEqual([
      'requirement-001',
      'requirement-002',
    ]);
    expect(normalized.matchScore).toBe(93);
    expect(normalized.requirements.map((requirement) => requirement.importance)).toEqual([
      'mandatory',
      'desirable',
    ]);
    expect(normalized.cv_build_spec).toEqual(cvBuildSpec);
  });

  it('clamps a score below zero after validated deductions', () => {
    const input = draft('mismatch');
    input.requirements[0].deduction.points = 120;

    expect(normalizeJobMatchDataV2(input).matchScore).toBe(0);
  });

  it.each(['aligned', 'partial', 'mismatch'] as const)('accepts the %s domain state', (status) => {
    expect(AIJobMatchV2RawSchema.safeParse(draft(status)).success).toBe(true);
  });

  it('rejects negative deductions instead of clamping them', () => {
    const input = draft();
    input.requirements[0].deduction.points = -1;

    const parsed = AIJobMatchV2RawSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'requirements.0.deduction.points')).toBe(true);
    }
  });

  it('rejects duplicate ids in a persisted ledger', () => {
    const normalized = normalizeJobMatchDataV2(draft());
    const duplicate = {
      ...normalized,
      requirements: normalized.requirements.map((requirement) => ({
        ...requirement,
        id: 'requirement-001',
      })),
    };

    expect(JobMatchDataV2Schema.safeParse(duplicate).success).toBe(false);
  });

  it('rejects duplicate requirement text in the model inventory', () => {
    const input = draft();
    input.requirements.push({
      ...input.requirements[0],
      text: '  STRONG   SQL EXPERIENCE  ',
    });

    const parsed = AIJobMatchV2RawSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({ path: ['requirements', 2, 'text'] })
      );
    }
  });

  it('requires status, evidence, confidence, and deduction on every item', () => {
    const input = draft() as unknown as { requirements: Array<Record<string, unknown>> };
    delete input.requirements[0].evidence;

    expect(AIJobMatchV2RawSchema.safeParse(input).success).toBe(false);
  });
});

describe('analysis-time build-spec grounding', () => {
  function withBullet(newBody: string, newLabel = 'API scalability'): JobMatchDataV2Draft {
    const input = draft();
    input.cv_build_spec = {
      ...cvBuildSpec,
      bullets_to_rewrite: [
        { project_or_role: 'Data Platform', original_label: 'Scale', new_label: newLabel, new_body: newBody },
      ],
    };
    return input;
  }

  it('demotes a build-spec bullet whose metric the CV does not support, before persistence', () => {
    const normalized = normalizeJobMatchDataV2(
      withBullet('Improved API performance by 40%.'),
      'Built SQL data pipelines for analytics.'
    );

    const bullet = normalized.cv_build_spec.bullets_to_rewrite[0];
    expect(bullet.new_body).toBe(
      'Rewrite this bullet to emphasise API scalability using only verified evidence from this role.'
    );
    // Structural fields kept.
    expect(bullet.new_label).toBe('API scalability');
    expect(bullet.project_or_role).toBe('Data Platform');
    // Score and requirement ledger untouched by grounding.
    expect(normalized.matchScore).toBe(93);
    expect(normalized.requirements.map((r) => r.id)).toEqual(['requirement-001', 'requirement-002']);
    expect(normalized.requirements.map((r) => r.status)).toEqual(['met', 'not_met']);
  });

  it('preserves a build-spec metric that the source CV supports', () => {
    const normalized = normalizeJobMatchDataV2(
      withBullet('Processed 2,500,000 events per day.', 'Throughput'),
      'Processed 2,500,000 events per day across the pipeline.'
    );
    expect(normalized.cv_build_spec.bullets_to_rewrite[0].new_body).toBe(
      'Processed 2,500,000 events per day.'
    );
  });

  it('grounds against ledger CV evidence, not only the raw CV text', () => {
    const input = withBullet('Cut latency by 35%.', 'Latency');
    input.requirements[0].evidence = [
      { source: 'cv', text: 'Cut pipeline latency by 35%', location: 'Experience' },
    ];
    // No raw CV text passed — the metric is carried by ledger CV evidence.
    const normalized = normalizeJobMatchDataV2(input, '');
    expect(normalized.cv_build_spec.bullets_to_rewrite[0].new_body).toBe('Cut latency by 35%.');
  });
});
