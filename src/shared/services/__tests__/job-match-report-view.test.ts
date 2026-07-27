import { describe, expect, it } from 'vitest';
import type { JobMatchDataV2 } from '@/shared/types/ai';
import { JobMatchDataV2Schema } from '@/shared/schemas/ai-output';
import {
  buildJobMatchReportView,
  validateJobMatchReportView,
  type ReportViewAccess,
} from '@/shared/services/job-match-report-view';
import {
  REFERENCE_JOB_MATCH,
  WRONG_OCCUPATION_JOB_MATCH,
} from './fixtures/job-match-reference';

const FULL: ReportViewAccess = {
  fullReport: true,
  requirementLedger: true,
  rewriteStrategy: true,
  eligibility: true,
};

// Free plan: preview report, limited ledger, no rewrite strategy, summary-only
// eligibility — exactly the reference scenario that produced the broken report.
const FREE: ReportViewAccess = {
  fullReport: false,
  requirementLedger: false,
  rewriteStrategy: false,
  eligibility: false,
};

describe('job-match report view — canonical integrity', () => {
  it('reference fixture is a valid, reconciling canonical ledger', () => {
    const parsed = JobMatchDataV2Schema.safeParse(REFERENCE_JOB_MATCH);
    expect(parsed.success).toBe(true);
    expect(REFERENCE_JOB_MATCH.matchScore).toBe(16);
  });

  it('computes true totals from the full ledger regardless of plan', () => {
    const pro = buildJobMatchReportView(REFERENCE_JOB_MATCH, FULL);
    const free = buildJobMatchReportView(REFERENCE_JOB_MATCH, FREE);
    for (const view of [pro, free]) {
      expect(view.requirements.totals.total).toBe(12);
      expect(view.requirements.totals.mandatory).toBe(9);
      expect(view.requirements.totals.desirable).toBe(3);
      expect(view.requirements.totals.mandatoryMet).toBe(1);
      expect(view.requirements.totals.desirableMet).toBe(1);
      expect(
        view.requirements.totals.visible + view.requirements.totals.locked
      ).toBe(view.requirements.totals.total);
    }
  });
});

describe('job-match report view — score reconciliation', () => {
  it('reconciles the full deductive model for Pro (no locked aggregate)', () => {
    const view = buildJobMatchReportView(REFERENCE_JOB_MATCH, FULL);
    expect(view.scoreExplanation.startingScore).toBe(100);
    expect(view.scoreExplanation.lockedDeductionTotal).toBe(0);
    expect(view.scoreExplanation.total).toBe(16);
    expect(view.scoreExplanation.reconciles).toBe(true);
    const visibleSum = view.scoreExplanation.visibleDeductions.reduce((s, r) => s + r.points, 0);
    const domain = view.scoreExplanation.domainDeduction?.points ?? 0;
    expect(100 - visibleSum - domain - view.scoreExplanation.lockedDeductionTotal).toBe(16);
  });

  it('reconciles for Free via a locked aggregate that never leaks text', () => {
    const view = buildJobMatchReportView(REFERENCE_JOB_MATCH, FREE);
    expect(view.requirements.totals.visible).toBe(3);
    expect(view.requirements.totals.locked).toBe(9);
    // Visible deductions (0 + 10 + 12) + domain (14) + locked aggregate (48) = 84.
    expect(view.scoreExplanation.lockedDeductionTotal).toBe(48);
    const visibleSum = view.scoreExplanation.visibleDeductions.reduce((s, r) => s + r.points, 0);
    const domain = view.scoreExplanation.domainDeduction?.points ?? 0;
    expect(100 - visibleSum - domain - view.scoreExplanation.lockedDeductionTotal).toBe(16);
    expect(view.scoreExplanation.reconciles).toBe(true);
  });
});

describe('job-match report view — no restricted leak on Free', () => {
  it('does not serialise locked requirement, rewrite, or strategy text', () => {
    const free = buildJobMatchReportView(REFERENCE_JOB_MATCH, FREE);
    const json = JSON.stringify(free);
    // Locked requirement texts (beyond the first 3 preview) must be absent.
    expect(json).not.toContain('FHIR/HL7');
    expect(json).not.toContain('Kubernetes');
    expect(json).not.toContain('Event-driven architecture');
    // Gated strategy/rewrite VALUES are absent (recommended template, section
    // order, cover-letter angle, the suggested rewrite body).
    expect(json).not.toContain('sharp_minimal');
    expect(json).not.toContain('cover-letter angle');
    expect(json).not.toContain('asynchronous processing for responsiveness');
    expect(free.rewrites.items).toHaveLength(0);
    expect(free.strategy.locked).toBe(true);
  });
});

describe('job-match report view — rewrite availability is typed, never inferred', () => {
  it('Free is plan_restricted with a reason and no items', () => {
    const view = buildJobMatchReportView(REFERENCE_JOB_MATCH, FREE);
    expect(view.rewrites.availability).toBe('plan_restricted');
    expect(view.rewrites.items).toHaveLength(0);
    expect(view.rewrites.reason).toBeTruthy();
  });

  it('Pro with rewrites is available', () => {
    const view = buildJobMatchReportView(REFERENCE_JOB_MATCH, FULL);
    expect(view.rewrites.availability).toBe('available');
    expect(view.rewrites.items.length).toBeGreaterThan(0);
  });

  it('empty rewrites with open gaps is insufficient_supported_evidence, never not_needed', () => {
    const data: JobMatchDataV2 = { ...REFERENCE_JOB_MATCH, tailoredRewrites: [] };
    const view = buildJobMatchReportView(data, FULL);
    expect(view.rewrites.availability).toBe('insufficient_supported_evidence');
    expect(view.rewrites.reason).toMatch(/evidence/i);
  });

  it('empty rewrites with all mandatory met is not_needed', () => {
    const data: JobMatchDataV2 = JobMatchDataV2Schema.parse({
      ...REFERENCE_JOB_MATCH,
      requirements: REFERENCE_JOB_MATCH.requirements.map((r) => ({
        ...r,
        status: 'met',
        deduction: { points: 0, reason: 'met', rubric: 'met' },
      })),
      domainFit: { ...REFERENCE_JOB_MATCH.domainFit, deduction: { points: 0, reason: 'aligned' } },
      matchScore: 100,
      tailoredRewrites: [],
    });
    const view = buildJobMatchReportView(data, FULL);
    expect(view.rewrites.availability).toBe('not_needed');
  });
});

describe('job-match report view — strategy fields are typed', () => {
  it('Pro exposes available strategy values', () => {
    const view = buildJobMatchReportView(REFERENCE_JOB_MATCH, FULL);
    expect(view.strategy.summaryAngle.status).toBe('available');
    expect(view.strategy.sectionOrder.status).toBe('available');
    expect(view.strategy.locked).toBe(false);
  });

  it('Free marks every strategy field plan_restricted with no value', () => {
    const view = buildJobMatchReportView(REFERENCE_JOB_MATCH, FREE);
    expect(view.strategy.summaryAngle.status).toBe('plan_restricted');
    expect(view.strategy.skillsToSurface.status).toBe('plan_restricted');
    expect(view.strategy.sectionOrder.status).toBe('plan_restricted');
  });
});

describe('job-match report view — eligibility is cautious, not a bare boolean', () => {
  it('ambiguous eligibility yields cautious, non-blocking wording', () => {
    const view = buildJobMatchReportView(REFERENCE_JOB_MATCH, FULL);
    expect(view.assessments.eligibility.hardBlocker).toBe(false);
    expect(view.assessments.eligibility.summary).toMatch(/clarification|could not be fully confirmed/i);
    expect(view.assessments.eligibility.summary).not.toContain('YES');
  });
});

describe('job-match report view — invariants', () => {
  it('reference view passes all invariants on both plans', () => {
    expect(validateJobMatchReportView(buildJobMatchReportView(REFERENCE_JOB_MATCH, FULL))).toEqual([]);
    expect(validateJobMatchReportView(buildJobMatchReportView(REFERENCE_JOB_MATCH, FREE))).toEqual([]);
  });
});

describe('job-match report view — calibration', () => {
  it('wrong-occupation case scores near zero and stays valid', () => {
    expect(JobMatchDataV2Schema.safeParse(WRONG_OCCUPATION_JOB_MATCH).success).toBe(true);
    const view = buildJobMatchReportView(WRONG_OCCUPATION_JOB_MATCH, FULL);
    expect(view.overview.score).toBe(0);
    expect(view.scoreExplanation.reconciles).toBe(true);
    expect(validateJobMatchReportView(view)).toEqual([]);
  });
});
