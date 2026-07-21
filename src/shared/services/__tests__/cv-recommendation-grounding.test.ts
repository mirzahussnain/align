import { describe, expect, it } from 'vitest';
import {
  groundJobMatchForDisplay,
  groundUserFacingRecommendations,
  type RecommendationGroundingInput,
} from '@/shared/services/cv-recommendation-grounding';
import type { JobMatchDataV2, TailoredRewrite } from '@/shared/types/ai';

const CV_EVIDENCE =
  'Software Engineer at Acme. Built the checkout API and processed 2,500,000 events per day. ' +
  'Owned deployment pipelines and improved reliability.';

function makeInput(
  overrides: Partial<RecommendationGroundingInput> = {}
): RecommendationGroundingInput {
  return {
    tailoredRewrites: [],
    summaryAngle: '',
    leadProject: '',
    matchFeedback: '',
    experienceGap: '',
    evidenceSources: [CV_EVIDENCE],
    unsupportedRequirementTerms: [],
    ...overrides,
  };
}

function rewrite(suggested: string, extra: Partial<TailoredRewrite> = {}): TailoredRewrite {
  return {
    original: 'Worked on the checkout API.',
    suggested,
    rationale: 'Mirror the JD wording.',
    ...extra,
  };
}

describe('tailoredRewrites grounding', () => {
  it('demotes a suggestion whose only metric is unsupported by evidence', () => {
    const result = groundUserFacingRecommendations(
      makeInput({
        tailoredRewrites: [rewrite('Improved API performance by 40% using strong deployment practices.')],
      })
    );

    const out = result.tailoredRewrites[0];
    expect(out.suggested).not.toMatch(/40%/);
    expect(out.suggested).toMatch(/only experience your CV already evidences/i);
    // Original bullet reference preserved.
    expect(out.original).toBe('Worked on the checkout API.');
    expect(out.caveat).toMatch(/metric|figure/i);
    expect(result.changes.length).toBe(1);
  });

  it('preserves a suggestion whose metric the evidence supports', () => {
    const result = groundUserFacingRecommendations(
      makeInput({
        tailoredRewrites: [rewrite('Processed 2,500,000 events per day across the checkout API.')],
      })
    );

    expect(result.tailoredRewrites[0].suggested).toBe(
      'Processed 2,500,000 events per day across the checkout API.'
    );
    expect(result.changes).toEqual([]);
  });

  it('does not present a missing skill as possessed, but keeps it as a confirmation opportunity', () => {
    const result = groundUserFacingRecommendations(
      makeInput({
        tailoredRewrites: [rewrite('Led Kubernetes deployments across production clusters.')],
        unsupportedRequirementTerms: ['Kubernetes deployment experience'],
      })
    );

    const out = result.tailoredRewrites[0];
    expect(out.suggested).not.toMatch(/kubernetes/i);
    // The gap is surfaced for the user to confirm — HITL preserved.
    expect(out.caveat).toMatch(/Kubernetes deployment experience is required/i);
    expect(out.caveat).toMatch(/only if you have genuine experience/i);
  });

  it('demotes an unsupported regulated/credential claim', () => {
    const result = groundUserFacingRecommendations(
      makeInput({
        tailoredRewrites: [rewrite('AWS certified engineer with active security clearance.')],
      })
    );

    const out = result.tailoredRewrites[0];
    expect(out.suggested).toBe(
      'Rewrite your original bullet using only experience your CV already evidences for this role.'
    );
    expect(out.caveat).toMatch(/credential or eligibility/i);
  });

  it('does not reject the whole set because one suggestion is unsafe', () => {
    const result = groundUserFacingRecommendations(
      makeInput({
        tailoredRewrites: [
          rewrite('Improved performance by 40%.'),
          rewrite('Processed 2,500,000 events per day across the checkout API.'),
        ],
      })
    );

    expect(result.tailoredRewrites[0].suggested).toMatch(/only experience your CV/i);
    expect(result.tailoredRewrites[1].suggested).toBe(
      'Processed 2,500,000 events per day across the checkout API.'
    );
  });
});

describe('summary_angle grounding', () => {
  it('demotes unsupported seniority and specialisation', () => {
    const result = groundUserFacingRecommendations(
      makeInput({
        summaryAngle: 'Position the candidate as a senior Kubernetes platform engineer.',
        unsupportedRequirementTerms: ['Kubernetes'],
      })
    );

    expect(result.summaryAngle).toBe(
      'Position the summary around the experience your CV actually evidences for this role.'
    );
  });

  it('keeps a summary angle grounded in verified evidence', () => {
    const result = groundUserFacingRecommendations(
      makeInput({
        summaryAngle: 'Position the summary around verified API and deployment experience.',
      })
    );

    expect(result.summaryAngle).toBe(
      'Position the summary around verified API and deployment experience.'
    );
    expect(result.changes).toEqual([]);
  });
});

describe('lead_project grounding', () => {
  it('keeps a lead project that resolves to verified evidence', () => {
    const result = groundUserFacingRecommendations(
      makeInput({ leadProject: 'Checkout API' })
    );
    expect(result.leadProject).toBe('Checkout API');
  });

  it('replaces a lead project that does not resolve with neutral guidance', () => {
    const result = groundUserFacingRecommendations(
      makeInput({ leadProject: 'Realtime Fraud Detection Platform' })
    );
    expect(result.leadProject).toBe('Prioritise the most relevant verified project from your CV.');
  });
});

describe('narrative feedback grounding', () => {
  it('leaves normal non-factual feedback intact', () => {
    const feedback = 'A credible partial fit — your API and deployment experience aligns well.';
    const gap = 'Depth of production streaming experience is not yet clear from your CV.';
    const result = groundUserFacingRecommendations(
      makeInput({ matchFeedback: feedback, experienceGap: gap })
    );

    expect(result.matchFeedback).toBe(feedback);
    expect(result.experienceGap).toBe(gap);
    expect(result.changes).toEqual([]);
  });

  it('demotes narrative feedback that asserts an unverifiable metric', () => {
    const result = groundUserFacingRecommendations(
      makeInput({ matchFeedback: 'You increased revenue by 300% in your last role.' })
    );

    expect(result.matchFeedback).not.toMatch(/300%/);
    expect(result.matchFeedback).toMatch(/requirement breakdown/i);
  });
});

// ── Presentation-time integration ─────────────────────────────────────────────

function makeJobMatch(overrides: Partial<JobMatchDataV2> = {}): JobMatchDataV2 {
  return {
    schemaVersion: 2,
    jobTitle: 'Backend Engineer',
    jobCompany: 'Acme',
    requirements: [
      {
        id: 'requirement-001',
        text: 'REST API development',
        importance: 'mandatory',
        category: 'skill',
        sourceSection: 'job_description',
        evidenceRequired: true,
        status: 'met',
        evidence: [{ source: 'cv', text: 'Built the checkout API', location: 'Experience' }],
        confidence: 0.9,
        deduction: { points: 0, reason: 'Evidenced', rubric: 'met' },
      },
      {
        id: 'requirement-002',
        text: 'Kubernetes',
        importance: 'desirable',
        category: 'tool',
        sourceSection: 'job_description',
        evidenceRequired: true,
        status: 'not_met',
        evidence: [],
        confidence: 0.9,
        deduction: { points: 2, reason: 'Not evidenced', rubric: 'desirable_missing' },
      },
    ],
    domainFit: {
      roleDomain: 'Backend',
      candidateDomain: 'Backend',
      status: 'aligned',
      overlapAreas: [],
      detail: '',
      confidence: 0.9,
      deduction: { points: 0, reason: 'aligned' },
    },
    matchScore: 98,
    matchFeedback: 'Strong backend alignment.',
    experienceGap: 'Some streaming depth to confirm.',
    tailoredRewrites: [
      {
        original: 'Worked on the checkout API.',
        suggested: 'Improved API performance by 40% using Kubernetes.',
        rationale: 'Mirror the JD.',
      },
    ],
    cv_build_spec: {
      recommended_template: 'architect',
      template_rationale: '',
      section_order: ['Experience'],
      lead_project: 'Realtime Fraud Detection Platform',
      summary_angle: 'Position as a senior Kubernetes platform engineer.',
      skills_to_surface: ['Kubernetes'],
      skills_to_deprioritise: [],
      bullets_to_rewrite: [],
      visa_note_required: false,
      cover_letter_angle: '',
    },
    ...overrides,
  };
}

describe('groundJobMatchForDisplay', () => {
  it('grounds every user-facing field without mutating the stored analysis', () => {
    const stored = makeJobMatch();
    const snapshot = structuredClone(stored);

    const display = groundJobMatchForDisplay(stored, CV_EVIDENCE);

    // Display copy is grounded.
    expect(display.tailoredRewrites[0].suggested).toMatch(/only experience your CV/i);
    expect(display.cv_build_spec.summary_angle).toMatch(/experience your CV actually evidences/i);
    expect(display.cv_build_spec.lead_project).toBe(
      'Prioritise the most relevant verified project from your CV.'
    );

    // Stored analysis is untouched (deep-equal to its pre-call snapshot).
    expect(stored).toEqual(snapshot);
    expect(stored.tailoredRewrites[0].suggested).toBe('Improved API performance by 40% using Kubernetes.');

    // HITL-preserving fields remain available.
    expect(display.cv_build_spec.skills_to_surface).toEqual(['Kubernetes']);
  });

  it('leaves scoring, statuses, deductions and domain fit unchanged', () => {
    const display = groundJobMatchForDisplay(makeJobMatch(), CV_EVIDENCE);

    expect(display.matchScore).toBe(98);
    expect(display.requirements.map((requirement) => requirement.status)).toEqual(['met', 'not_met']);
    expect(display.requirements.map((requirement) => requirement.deduction.points)).toEqual([0, 2]);
    expect(display.domainFit.status).toBe('aligned');
    expect(display.requirements.map((requirement) => requirement.id)).toEqual([
      'requirement-001',
      'requirement-002',
    ]);
  });

  it('returns the same reference when nothing needs grounding', () => {
    const clean = makeJobMatch({
      matchFeedback: 'Strong backend alignment.',
      experienceGap: 'Some streaming depth to confirm.',
      tailoredRewrites: [
        {
          original: 'Worked on the checkout API.',
          suggested: 'Owned deployment of the checkout API.',
          rationale: 'Emphasise ownership.',
        },
      ],
      cv_build_spec: {
        ...makeJobMatch().cv_build_spec,
        lead_project: 'Checkout API',
        summary_angle: 'Position the summary around verified API and deployment experience.',
      },
    });

    expect(groundJobMatchForDisplay(clean, CV_EVIDENCE)).toBe(clean);
  });

  it('treats approved profile evidence and user context in the ledger as verified', () => {
    const stored = makeJobMatch({
      tailoredRewrites: [
        {
          original: 'Worked on infra.',
          suggested: 'Deployed workloads with Kubernetes.',
          rationale: 'Match the JD.',
        },
      ],
      requirements: [
        {
          id: 'requirement-001',
          text: 'Kubernetes',
          importance: 'mandatory',
          category: 'tool',
          sourceSection: 'job_description',
          evidenceRequired: true,
          status: 'met',
          evidence: [
            { source: 'profile', text: 'Kubernetes cluster administration', approved: true },
          ],
          confidence: 0.9,
          deduction: { points: 0, reason: 'Approved evidence', rubric: 'met' },
        },
      ],
    });

    const display = groundJobMatchForDisplay(stored, CV_EVIDENCE);
    // Kubernetes is now backed by approved profile evidence, so the suggestion survives.
    expect(display.tailoredRewrites[0].suggested).toBe('Deployed workloads with Kubernetes.');
  });
});
