import { describe, expect, it } from 'vitest';
import {
  classifyRewriteProvenance,
  salvageStructuredDraft,
  type GenerationRepairPolicy,
} from '@/shared/services/cv-rewrite-provenance';
import {
  structuredRewriteToRewrittenData,
  validateStructuredRewriteProvenance,
} from '@/shared/services/cv-rewrite-structured';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import {
  makeEducation,
  makeExperience,
  makeSkillGroup,
  makeSkillItem,
  makeStructuredRewriteOutput,
  ledgerEvidenceRef,
  sourceCvRef,
} from './fixtures/structured-rewrite';

/**
 * A realistic, skills-rich CV. Skills are scattered across bullets so that a
 * comma-joined group excerpt (e.g. "PostgreSQL, Redis") does NOT appear as a
 * contiguous substring even though each individual skill is genuinely present —
 * exactly the structural mismatch behind the observed skills[1/2/4] failure.
 */
const CV_TEXT = [
  'Jane Doe. Software Engineer at Globex.',
  'Backend: built services in Python and Go. Used PostgreSQL and Redis for storage.',
  'Frontend work with React and TypeScript. Improved page load by 20%.',
  'Deployed on AWS with Docker and Kubernetes. Also familiar with GraphQL and Kafka.',
  'Led a small team delivering a payments platform.',
].join('\n');

const input: LedgerNativeRewriteInput = {
  cvText: CV_TEXT,
  jobDescription: 'Full-stack engineer with Python, React and cloud experience.',
  rewriteContext: {
    requirements: [
      {
        id: 'requirement-python',
        text: 'Python',
        importance: 'mandatory',
        status: 'met',
        category: 'tool',
        cvEvidence: ['built services in Python and Go'],
        approvedProfileEvidence: [],
      },
      {
        id: 'requirement-terraform',
        text: 'Terraform',
        importance: 'desirable',
        status: 'not_met',
        category: 'tool',
        cvEvidence: [],
        approvedProfileEvidence: [],
      },
    ],
    eligibilityConstraints: [],
    cvBuildSpec: {
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
    },
  },
  approvedProfileEvidence: [],
  template: 'architect',
};

/** A fuller, valid draft used as the base for the regression fixtures. */
function makeFullDraft() {
  return makeStructuredRewriteOutput({
    identity: {
      name: 'Jane Doe',
      professionalTitle: 'Software Engineer',
      sourceRefs: [sourceCvRef('Jane Doe')],
    },
    summary: {
      text: 'Software Engineer at Globex.',
      sourceRefs: [sourceCvRef('Software Engineer at Globex')],
    },
    experience: [
      makeExperience({
        jobTitle: 'Software Engineer',
        company: 'Globex',
        sourceRefs: [sourceCvRef('Software Engineer at Globex')],
        achievements: [
          { label: 'Backend', text: 'Built services in Python and Go.', sourceRefs: [sourceCvRef('built services in Python and Go')] },
          { label: 'Impact', text: 'Improved page load by 20%.', sourceRefs: [sourceCvRef('Improved page load by 20%')] },
        ],
      }),
    ],
    education: [
      makeEducation({ degree: 'BSc Computer Science', university: 'University of Leeds', sourceRefs: [sourceCvRef('Jane Doe')] }),
    ],
  });
}

describe('classifyRewriteProvenance', () => {
  it('reports a fully valid draft as valid with no defects', () => {
    const result = classifyRewriteProvenance(makeFullDraft(), input);
    expect(result.valid).toBe(true);
    expect(result.defects).toEqual([]);
    expect(result.invalidClaimIds).toEqual([]);
  });

  it('classifies an unsupported optional skills group as repairable', () => {
    const draft = makeFullDraft();
    draft.skills = [makeSkillGroup({ category: 'Databases', text: 'PostgreSQL, Redis', sourceRefs: [sourceCvRef('PostgreSQL, Redis')] })];
    const result = classifyRewriteProvenance(draft, input);
    expect(result.valid).toBe(false);
    expect(result.repairable).toBe(true);
    const defect = result.defects.find((d) => d.path === 'skills[0]');
    expect(defect?.severity).toBe('repairable');
    expect(defect?.reason).toBe('unknown_reference');
  });

  it('classifies an unsupported required identity/history claim as terminal', () => {
    const draft = makeFullDraft();
    // A fabricated employer the CV does not contain: terminal.
    draft.experience[0].sourceRefs = [sourceCvRef('Principal Engineer at Initech')];
    const result = classifyRewriteProvenance(draft, input);
    expect(result.valid).toBe(false);
    expect(result.repairable).toBe(false);
    expect(result.defects.find((d) => d.path === 'experience[0]')?.severity).toBe('terminal');
  });
});

describe('salvageStructuredDraft — deterministic repair', () => {
  it('leaves a valid draft unchanged', () => {
    const outcome = salvageStructuredDraft(makeFullDraft(), input);
    expect(outcome.status).toBe('unchanged');
  });

  it('rejects, never repairs, a terminal identity/history defect', () => {
    const draft = makeFullDraft();
    draft.education[0].sourceRefs = [sourceCvRef('PhD in Physics from Oxford')];
    const outcome = salvageStructuredDraft(draft, input);
    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.reason).toBe('unrepairable_output');
  });

  it('drops only the unsupported skill and keeps the supported ones', () => {
    const draft = makeFullDraft();
    // Angular is absent from the CV; React and TypeScript are present.
    draft.skills = [makeSkillGroup({ category: 'Frontend', text: 'React, TypeScript, Angular', sourceRefs: [sourceCvRef('React, TypeScript, Angular')] })];
    const outcome = salvageStructuredDraft(draft, input);
    expect(outcome.status).toBe('repaired');
    if (outcome.status !== 'repaired') return;
    expect(outcome.output.skills[0].text).toBe('React, TypeScript');
    expect(outcome.report.removedClaims).toContain('skills[0]:Angular');
    // The repaired draft passes the full validator with no remaining defects.
    expect(validateStructuredRewriteProvenance(outcome.output, input).ok).toBe(true);
    expect(outcome.report.remainingDefects).toBe(0);
  });

  it('preserves valid references and prunes only the invalid one', () => {
    const draft = makeFullDraft();
    draft.summary = {
      text: 'Built services in Python and Go.',
      sourceRefs: [sourceCvRef('built services in Python and Go'), sourceCvRef('reduced outages by 90%')],
    };
    const outcome = salvageStructuredDraft(draft, input);
    expect(outcome.status).toBe('repaired');
    if (outcome.status !== 'repaired') return;
    expect(outcome.output.summary?.sourceRefs).toHaveLength(1);
    expect(outcome.report.repairedReferences).toContain('summary');
  });

  it('drops an optional bullet whose references are all invalid', () => {
    const draft = makeFullDraft();
    draft.experience[0].achievements.push({
      text: 'Cut cloud spend by 40%.',
      sourceRefs: [sourceCvRef('cut cloud spend by 40%')],
    });
    const outcome = salvageStructuredDraft(draft, input);
    expect(outcome.status).toBe('repaired');
    if (outcome.status !== 'repaired') return;
    expect(outcome.output.experience[0].achievements).toHaveLength(2);
    expect(outcome.report.removedClaims).toContain('experience[0].achievements[2]');
  });

  it('re-grounds skills provided with per-item provenance', () => {
    const draft = makeFullDraft();
    draft.skills = [
      makeSkillGroup({
        category: 'Backend',
        text: 'Python, Cobol',
        items: [
          makeSkillItem('Python', [sourceCvRef('built services in Python and Go')]),
          // Cobol is nowhere in supplied evidence, and its ref is invalid.
          makeSkillItem('Cobol', [sourceCvRef('30 years of COBOL')]),
        ],
        sourceRefs: [ledgerEvidenceRef('requirement-python', 0)],
      }),
    ];
    const outcome = salvageStructuredDraft(draft, input);
    expect(outcome.status).toBe('repaired');
    if (outcome.status !== 'repaired') return;
    expect(outcome.output.skills[0].text).toBe('Python');
    expect(outcome.report.removedClaims).toContain('skills[0]:Cobol');
    expect(validateStructuredRewriteProvenance(outcome.output, input).ok).toBe(true);
  });

  it('rejects when the defect ratio is too high to trust', () => {
    const draft = makeFullDraft();
    const tightPolicy: GenerationRepairPolicy = {
      deterministicRepairEnabled: true,
      maxCorrectionCalls: 1,
      maxRepairableClaims: 5,
      maxRepairableClaimRatio: 0.01,
    };
    draft.skills = [makeSkillGroup({ text: 'React, Angular', sourceRefs: [sourceCvRef('React, Angular')] })];
    const outcome = salvageStructuredDraft(draft, input, tightPolicy);
    expect(outcome.status).toBe('rejected');
  });

  it('does not repair when deterministic repair is disabled', () => {
    const draft = makeFullDraft();
    draft.skills = [makeSkillGroup({ text: 'React, Angular', sourceRefs: [sourceCvRef('React, Angular')] })];
    const outcome = salvageStructuredDraft(draft, input, {
      ...({ maxCorrectionCalls: 1, maxRepairableClaims: 5, maxRepairableClaimRatio: 0.5 }),
      deterministicRepairEnabled: false,
    });
    expect(outcome.status).toBe('rejected');
  });
});

/**
 * Permanent regression for the reported failure: skills[1], skills[2], skills[4]
 * each carry a source_cv reference whose comma-joined excerpt does not point to
 * supplied evidence, so the whole draft was previously discarded and the provider
 * call wasted. The salvage pass must keep every genuinely-present skill, drop only
 * the unsupported ones, and produce a fully-validated, persistable draft.
 */
describe('skills[1/2/4] reference-failure regression', () => {
  function makeReportedDraft() {
    const draft = makeFullDraft();
    draft.skills = [
      // 0: valid group-level reference.
      makeSkillGroup({ category: 'Languages', text: 'Python, Go', sourceRefs: [sourceCvRef('Python and Go')] }),
      // 1: excerpt "PostgreSQL, Redis" is not contiguous in the CV ("PostgreSQL and Redis").
      makeSkillGroup({ category: 'Databases', text: 'PostgreSQL, Redis', sourceRefs: [sourceCvRef('PostgreSQL, Redis')] }),
      // 2: excerpt invalid AND contains an unsupported skill (Angular).
      makeSkillGroup({ category: 'Frontend', text: 'React, TypeScript, Angular', sourceRefs: [sourceCvRef('React, TypeScript, Angular')] }),
      // 3: valid group-level reference.
      makeSkillGroup({ category: 'Cloud', text: 'AWS, Docker', sourceRefs: [sourceCvRef('AWS with Docker')] }),
      // 4: excerpt "GraphQL, Kafka" is not contiguous ("GraphQL and Kafka").
      makeSkillGroup({ category: 'Messaging', text: 'GraphQL, Kafka', sourceRefs: [sourceCvRef('GraphQL, Kafka')] }),
    ];
    return draft;
  }

  it('is rejected by the strict all-or-nothing validator (before)', () => {
    const before = validateStructuredRewriteProvenance(makeReportedDraft(), input);
    expect(before.ok).toBe(false);
    expect(before.reasons).toEqual(
      expect.arrayContaining([
        'skills[1]: Source CV reference does not point to supplied evidence.',
        'skills[2]: Source CV reference does not point to supplied evidence.',
        'skills[4]: Source CV reference does not point to supplied evidence.',
      ])
    );
  });

  it('is salvaged into a fully-validated, persistable draft (after)', () => {
    const outcome = salvageStructuredDraft(makeReportedDraft(), input);
    expect(outcome.status).toBe('repaired');
    if (outcome.status !== 'repaired') return;

    // Every genuinely-present skill survived; only the unsupported Angular was dropped.
    expect(outcome.output.skills.map((group) => group.text)).toEqual([
      'Python, Go',
      'PostgreSQL, Redis',
      'React, TypeScript',
      'AWS, Docker',
      'GraphQL, Kafka',
    ]);
    expect(outcome.report.removedClaims).toEqual(['skills[2]:Angular']);

    // The salvaged draft validates cleanly and adapts to persistable CV data.
    expect(validateStructuredRewriteProvenance(outcome.output, input).ok).toBe(true);
    const adapted = structuredRewriteToRewrittenData(outcome.output, 400);
    expect(adapted.data.coreSkills.map((group) => group.skills)).toContain('React, TypeScript');
    // Provenance for a salvaged group is retained (non-empty ref union).
    expect(adapted.claimSourceRefs['skills.2'].length).toBeGreaterThan(0);
  });
});
