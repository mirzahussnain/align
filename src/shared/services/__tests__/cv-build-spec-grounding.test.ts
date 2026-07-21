import { describe, expect, it } from 'vitest';
import { groundBuildSpec, neutralRewriteDirective } from '@/shared/services/cv-build-spec-grounding';
import { buildEvidenceCorpus } from '@/shared/services/cv-evidence';
import type { CvBuildSpec } from '@/shared/types/ai';

function spec(bullets: CvBuildSpec['bullets_to_rewrite']): CvBuildSpec {
  return {
    recommended_template: 'architect',
    template_rationale: '',
    section_order: ['Experience'],
    lead_project: 'Streaming platform',
    summary_angle: 'Lead with reliable delivery',
    skills_to_surface: ['SQL'],
    skills_to_deprioritise: [],
    bullets_to_rewrite: bullets,
    visa_note_required: false,
    cover_letter_angle: '',
  };
}

const CV = 'Software Engineer at Acme. Built the checkout API and processed 2,500,000 events per day.';
const corpus = buildEvidenceCorpus([CV]);

describe('groundBuildSpec (demote-to-intent)', () => {
  it('demotes a bullet whose metric is not in verified evidence', () => {
    const result = groundBuildSpec(
      spec([
        {
          project_or_role: 'Software Engineer',
          original_label: 'Perf',
          new_label: 'API performance',
          new_body: 'Improved API performance by 40%.',
        },
      ]),
      corpus
    );

    expect(result.demotedBullets).toBe(1);
    const bullet = result.spec.bullets_to_rewrite[0];
    expect(bullet.new_body).toBe(
      'Rewrite this bullet to emphasise API performance using only verified evidence from this role.'
    );
    // Structural fields survive — they assert no facts.
    expect(bullet.original_label).toBe('Perf');
    expect(bullet.new_label).toBe('API performance');
    expect(bullet.project_or_role).toBe('Software Engineer');
  });

  it('preserves a bullet whose metric the evidence supports', () => {
    const result = groundBuildSpec(
      spec([
        {
          project_or_role: 'Software Engineer',
          original_label: 'Scale',
          new_label: 'Throughput',
          new_body: 'Processed 2,500,000 events per day across the platform.',
        },
      ]),
      corpus
    );

    expect(result.demotedBullets).toBe(0);
    expect(result.spec.bullets_to_rewrite[0].new_body).toBe(
      'Processed 2,500,000 events per day across the platform.'
    );
  });

  it('leaves a body with no impact metric untouched', () => {
    const result = groundBuildSpec(
      spec([
        {
          project_or_role: 'Software Engineer',
          original_label: 'Ownership',
          new_label: 'Deployment ownership',
          new_body: 'Owned deployment of the checkout API.',
        },
      ]),
      corpus
    );
    expect(result.demotedBullets).toBe(0);
    expect(result.spec.bullets_to_rewrite[0].new_body).toBe('Owned deployment of the checkout API.');
  });

  it('preserves every non-bullet field', () => {
    const input = spec([]);
    const result = groundBuildSpec(input, corpus);
    expect(result.spec.lead_project).toBe('Streaming platform');
    expect(result.spec.summary_angle).toBe('Lead with reliable delivery');
    expect(result.spec.skills_to_surface).toEqual(['SQL']);
    expect(result.spec.section_order).toEqual(['Experience']);
  });

  it('demotes each over-claiming bullet independently', () => {
    const result = groundBuildSpec(
      spec([
        { project_or_role: 'A', original_label: 'x', new_label: 'Scale', new_body: 'Grew users by 300%.' },
        { project_or_role: 'B', original_label: 'y', new_label: 'Throughput', new_body: 'Processed 2,500,000 events per day.' },
      ]),
      corpus
    );
    expect(result.demotedBullets).toBe(1);
    expect(result.spec.bullets_to_rewrite[0].new_body).toContain('Rewrite this bullet to emphasise Scale');
    expect(result.spec.bullets_to_rewrite[1].new_body).toBe('Processed 2,500,000 events per day.');
  });

  it('falls back through label then a generic directive', () => {
    expect(
      neutralRewriteDirective({ project_or_role: 'R', original_label: 'Orig', new_label: '', new_body: '' })
    ).toContain('emphasise Orig');
    expect(
      neutralRewriteDirective({ project_or_role: 'R', original_label: '', new_label: '', new_body: '' })
    ).toBe('Rewrite this bullet using only verified evidence from this role.');
  });
});
