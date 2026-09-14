import { describe, expect, it } from 'vitest';
import { validateRewrittenCv } from '@/shared/services/cv-rewrite-validation';
import type { LedgerNativeRewriteInput, RewriteRequirement } from '@/shared/types/cv-rewrite';
import type { AiCvBuildGuidance } from '@/shared/types/ai';
import type { RewrittenCVData } from '@/shared/templates/types';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';

const EMPTY_SPEC: AiCvBuildGuidance = {
  recommended_template: 'architect',
  template_rationale: '',
  section_order: [],
  lead_project: '',
  summary_angle: '',
  skills_to_surface: [],
  skills_to_deprioritise: [],
  bullets_to_rewrite: [],
  visa_note_required: false,
  cover_letter_angle: '',
};

const CV_TEXT =
  'Senior Data Engineer at Acme Corp. Built data pipelines using SQL and Python. ' +
  'BSc Computer Science, University of Leeds. Grew pipeline throughput by 30%.';

function makeInput(overrides: Partial<LedgerNativeRewriteInput> = {}): LedgerNativeRewriteInput {
  return {
    cvText: CV_TEXT,
    jobDescription: 'Data Engineer role at a fintech.',
    rewriteContext: {
      requirements: [],
      eligibilityConstraints: [],
      cvBuildSpec: EMPTY_SPEC,
    },
    approvedProfileEvidence: [],
    template: 'architect',
    ...overrides,
  };
}

function makeCv(overrides: Partial<RewrittenCVData> = {}): RewrittenCVData {
  return {
    fullName: 'Jane Doe',
    tagline: 'Senior Data Engineer',
    contact: { email: '', phone: '', location: '' },
    professionalSummary: '',
    education: [],
    projects: [],
    experience: [],
    coreSkills: [],
    certifications: [],
    ...overrides,
  };
}

function requirement(partial: Partial<RewriteRequirement>): RewriteRequirement {
  return {
    id: 'r1',
    text: 'Requirement',
    importance: 'mandatory',
    status: 'not_met',
    category: 'skill',
    cvEvidence: [],
    approvedProfileEvidence: [],
    ...partial,
  };
}

describe('validateRewrittenCv', () => {
  it('passes a CV that only strengthens wording of existing evidence', () => {
    const cv = makeCv({
      professionalSummary: 'Senior Data Engineer skilled in SQL and Python.',
      education: [
        { degree: 'BSc Computer Science', university: 'University of Leeds', startDate: '', endDate: '', grade: '', description: '' },
      ],
      experience: [
        {
          jobTitle: 'Senior Data Engineer',
          company: 'Acme Corp',
          location: '',
          type: '',
          startDate: '',
          endDate: '',
          achievements: [{ label: 'Pipelines', body: 'Built SQL pipelines, growing throughput by 30%.' }],
        },
      ],
      coreSkills: [{ category: 'Data', skills: 'SQL, Python' }],
    });

    const result = validateRewrittenCv(cv, makeInput());
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('rejects a new employer absent from the source', () => {
    const cv = makeCv({
      experience: [
        { jobTitle: 'Senior Data Engineer', company: 'Globex Fabrications', location: '', type: '', startDate: '', endDate: '', achievements: [] },
      ],
    });
    const result = validateRewrittenCv(cv, makeInput());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/employer/i);
  });

  it('rejects an upgraded/invented job title', () => {
    const cv = makeCv({
      experience: [
        { jobTitle: 'Chief Data Officer', company: 'Acme Corp', location: '', type: '', startDate: '', endDate: '', achievements: [] },
      ],
    });
    const result = validateRewrittenCv(cv, makeInput());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/job title/i);
  });

  it('rejects a new qualification', () => {
    const cv = makeCv({
      education: [
        { degree: 'PhD Astrophysics', university: 'University of Leeds', startDate: '', endDate: '', grade: '', description: '' },
      ],
    });
    const result = validateRewrittenCv(cv, makeInput());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/qualification/i);
  });

  it('rejects a new certification presented as held', () => {
    const cv = makeCv({
      certifications: [{ name: 'AWS Certified Solutions Architect', issuer: 'Amazon', year: '2025' }],
    });
    const result = validateRewrittenCv(cv, makeInput());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/certification/i);
  });

  it('rejects an invented impact metric', () => {
    const cv = makeCv({
      experience: [
        {
          jobTitle: 'Senior Data Engineer',
          company: 'Acme Corp',
          location: '',
          type: '',
          startDate: '',
          endDate: '',
          achievements: [{ label: 'Impact', body: 'Increased revenue by 250%.' }],
        },
      ],
    });
    const result = validateRewrittenCv(cv, makeInput());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/metric/i);
  });

  it('rejects a skill claimed as possessed while tied only to a not_met requirement', () => {
    const cv = makeCv({ coreSkills: [{ category: 'Infra', skills: 'Kubernetes' }] });
    const input = makeInput({
      rewriteContext: {
        requirements: [requirement({ id: 'r1', text: 'Kubernetes', status: 'not_met', category: 'tool' })],
        eligibilityConstraints: [],
        cvBuildSpec: EMPTY_SPEC,
      },
    });
    const result = validateRewrittenCv(cv, input);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/unmet requirement/i);
  });

  it('rejects a skill tied to an unclear requirement (not treated as confirmed)', () => {
    const cv = makeCv({ coreSkills: [{ category: 'Infra', skills: 'Terraform' }] });
    const input = makeInput({
      rewriteContext: {
        requirements: [requirement({ id: 'r1', text: 'Terraform', status: 'unclear', category: 'tool' })],
        eligibilityConstraints: [],
        cvBuildSpec: EMPTY_SPEC,
      },
    });
    expect(validateRewrittenCv(cv, input).ok).toBe(false);
  });

  it('accepts a skill for an unmet requirement when approved profile evidence supports it', () => {
    const overlay: ApprovedProfileEvidenceOverlay = {
      requirementId: 'r1',
      evidenceRef: { type: 'skill', id: 'skill-1' },
      requirementText: 'Kafka',
      sourceProfileId: 'profile-1',
      resolvedEvidenceText: 'Apache Kafka',
      evidenceLocation: 'Data tools — Skills',
      userApproved: true,
    };
    const cv = makeCv({ coreSkills: [{ category: 'Streaming', skills: 'Apache Kafka' }] });
    const input = makeInput({
      approvedProfileEvidence: [overlay],
      rewriteContext: {
        requirements: [
          requirement({ id: 'r1', text: 'Kafka', status: 'not_met', category: 'tool', approvedProfileEvidence: ['Apache Kafka'] }),
        ],
        eligibilityConstraints: [],
        cvBuildSpec: EMPTY_SPEC,
      },
    });
    const result = validateRewrittenCv(cv, input);
    expect(result.ok).toBe(true);
  });

  it('rejects a positive eligibility claim the ledger contradicts', () => {
    const cv = makeCv({
      professionalSummary: 'Fully eligible with the right to work in the UK.',
    });
    const input = makeInput({
      rewriteContext: {
        requirements: [
          requirement({ id: 'r1', text: 'Right to work in the UK', status: 'contradicted', category: 'eligibility' }),
        ],
        eligibilityConstraints: [
          { requirementId: 'r1', text: 'Right to work in the UK', status: 'contradicted' },
        ],
        cvBuildSpec: EMPTY_SPEC,
      },
    });
    const result = validateRewrittenCv(cv, input);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/eligibility/i);
  });

  it('rejects a metric found only in the build spec — build-spec text is not evidence', () => {
    const cv = makeCv({
      experience: [
        {
          jobTitle: 'Senior Data Engineer',
          company: 'Acme Corp',
          location: '',
          type: '',
          startDate: '',
          endDate: '',
          achievements: [{ label: 'Scale', body: 'Processed 2,500,000 events per day across the platform.' }],
        },
      ],
    });
    const spec: AiCvBuildGuidance = {
      ...EMPTY_SPEC,
      bullets_to_rewrite: [
        {
          project_or_role: 'Acme Corp',
          original_label: 'Scale',
          new_label: 'Scale',
          new_body: 'Processed 2,500,000 events per day across the platform.',
        },
      ],
    };
    const input = makeInput({
      rewriteContext: { requirements: [], eligibilityConstraints: [], cvBuildSpec: spec },
    });
    // 2,500,000 exists only in the AI-authored build spec — the CV never says it,
    // so the validator must not treat it as verified.
    const result = validateRewrittenCv(cv, input);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/metric/i);
  });

  it('does not let build-spec fields whitelist a skill tied to an unmet requirement', () => {
    const cv = makeCv({ coreSkills: [{ category: 'Infra', skills: 'Kubernetes' }] });
    const spec: AiCvBuildGuidance = { ...EMPTY_SPEC, skills_to_surface: ['Kubernetes'] };
    const input = makeInput({
      rewriteContext: {
        requirements: [requirement({ id: 'r1', text: 'Kubernetes', status: 'not_met', category: 'tool' })],
        eligibilityConstraints: [],
        cvBuildSpec: spec,
      },
    });
    // Kubernetes appears in skills_to_surface, but that is guidance, not evidence.
    expect(validateRewrittenCv(cv, input).ok).toBe(false);
  });
});
