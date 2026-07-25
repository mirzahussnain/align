import { describe, expect, it } from 'vitest';
import {
  structuredRewriteToRewrittenData,
  validateStructuredRewriteProvenance,
} from '@/shared/services/cv-rewrite-structured';
import type { LedgerNativeRewriteInput } from '@/shared/types/cv-rewrite';
import {
  applicationContextRef,
  approvedProfileRef,
  invalidStructuredVariants,
  ledgerEvidenceRef,
  makeExperience,
  makeStructuredRewriteOutput,
  sourceCvRef,
} from './fixtures/structured-rewrite';

const input: LedgerNativeRewriteInput = {
  cvText:
    'A. Candidate. Data Engineer at Acme Corp. Built SQL pipelines and improved throughput by 30%.',
  jobDescription: 'Data Engineer with SQL.',
  rewriteContext: {
    requirements: [
      {
        id: 'requirement-001',
        text: 'SQL',
        importance: 'mandatory',
        status: 'met',
        category: 'tool',
        cvEvidence: ['Built SQL pipelines'],
        approvedProfileEvidence: [],
      },
      {
        id: 'requirement-missing',
        text: 'Kubernetes',
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
  approvedProfileEvidence: [
    {
      requirementId: 'requirement-001',
      evidenceRef: { type: 'skill', id: 'skill-1' },
      requirementText: 'SQL',
      sourceProfileId: 'profile-1',
      resolvedEvidenceText: 'SQL',
      evidenceLocation: 'Skills',
      userApproved: true,
    },
  ],
  applicationEvidence: [
    {
      id: 'context-1',
      requirementId: 'requirement-001',
      context: { label: 'SQL', text: 'Used SQL in a current application project.' },
    },
  ],
  template: 'architect',
};

describe('structured rewrite provenance', () => {
  it('rejects legacy RewrittenCVData from the provider', () => {
    const legacy = {
      fullName: 'A. Candidate',
      tagline: 'Data Engineer',
      contact: {},
      professionalSummary: '',
      experience: [],
      projects: [],
      education: [],
      coreSkills: [],
      certifications: [],
    };
    expect(validateStructuredRewriteProvenance(legacy, input)).toEqual({
      ok: false,
      reasons: ['Structured rewrite response does not match the required contract.'],
    });
  });

  it('accepts supplied source, ledger, approved-profile and application references', () => {
    const output = makeStructuredRewriteOutput({
      identity: {
        name: 'A. Candidate',
        professionalTitle: 'Data Engineer',
        sourceRefs: [sourceCvRef('A. Candidate')],
      },
      summary: {
        text: 'Data Engineer with SQL experience.',
        sourceRefs: [
          ledgerEvidenceRef(),
          approvedProfileRef(),
          applicationContextRef(),
        ],
      },
    });
    expect(validateStructuredRewriteProvenance(output, input)).toEqual({
      ok: true,
      reasons: [],
    });
  });

  it.each([
    ['missing provenance', invalidStructuredVariants.missingProvenance()],
    ['unknown requirement', invalidStructuredVariants.unknownRequirement()],
    ['unapproved profile evidence', invalidStructuredVariants.unapprovedProfile()],
    ['stale application context', invalidStructuredVariants.staleApplicationContext()],
  ])('rejects %s', (_label, output) => {
    expect(validateStructuredRewriteProvenance(output, input).ok).toBe(false);
  });

  it('records unsupported requirements only when the supplied ledger marks them unsupported', () => {
    const valid = makeStructuredRewriteOutput({
      generationNotes: {
        unsupportedRequirementsNotAdded: ['requirement-missing'],
      },
    });
    const invalid = makeStructuredRewriteOutput({
      generationNotes: {
        unsupportedRequirementsNotAdded: ['requirement-001'],
      },
    });
    expect(validateStructuredRewriteProvenance(valid, input).ok).toBe(true);
    expect(validateStructuredRewriteProvenance(invalid, input).ok).toBe(false);
  });
});

describe('structured rewrite adapter and summary compaction', () => {
  it('maps deterministically to RewrittenCVData with claim-level references', () => {
    const ref = sourceCvRef('Data Engineer at Acme Corp');
    const output = makeStructuredRewriteOutput({
      summary: {
        text: 'Builds SQL pipelines. Builds SQL pipelines. Improves throughput.',
        sourceRefs: [ref],
      },
      experience: [
        makeExperience({
          jobTitle: 'Data Engineer',
          company: 'Acme Corp',
          sourceRefs: [ref],
          achievements: [
            {
              label: 'Impact',
              text: 'Improved throughput by 30%.',
              sourceRefs: [sourceCvRef('improved throughput by 30%')],
            },
          ],
        }),
      ],
    });

    const first = structuredRewriteToRewrittenData(output, 30);
    const second = structuredRewriteToRewrittenData(output, 30);
    expect(second).toEqual(first);
    expect(first.data.professionalSummary).toBe(
      'Builds SQL pipelines. Improves throughput.'
    );
    expect(first.summary).toMatchObject({
      removedDuplicateSentences: 1,
      duplicateSentencesRemoved: ['Builds SQL pipelines.'],
      budget: 30,
      budgetExceeded: true,
    });
    expect(first.claimSourceRefs['experience.0']).toEqual([ref]);
    expect(first.claimSourceRefs['experience.0.achievements.0']).toHaveLength(1);
  });

  it('never truncates an over-budget summary mid-sentence', () => {
    const summary =
      'Registered nurse with acute-care experience. Holds a current required credential.';
    const adapted = structuredRewriteToRewrittenData(
      makeStructuredRewriteOutput({
        summary: { text: summary, sourceRefs: [sourceCvRef()] },
      }),
      20
    );
    expect(adapted.data.professionalSummary).toBe(summary);
    expect(adapted.summary.budgetExceeded).toBe(true);
    expect(adapted.summary.originalLength).toBe(summary.length);
    expect(adapted.summary.finalLength).toBe(summary.length);
  });
});
