// Server-derived job-match report view model.
//
// Single source of truth for the report UI. Built from the CANONICAL
// `JobMatchDataV2` ledger plus the plan's access decisions, so the client never
// re-derives an authoritative number (totals, score reconciliation) from a
// plan-sliced subset — the root cause of "3 essential requirements", the
// non-reconciling score explanation, "perfectly tailored" (from an empty
// array), and blank strategy cards.
//
// Rules honoured here:
//   - Totals, score reconciliation and mandatory gaps are computed from the
//     FULL canonical ledger, independent of what the plan may see.
//   - Locked (plan-gated) content is represented by a typed state or an
//     aggregate count — the hidden VALUES are never placed in the view model,
//     so a Free response leaks no restricted evidence, rewrite or strategy text.
//   - Recommendation text is display-grounded first (reuses the existing
//     read-time grounding), so nothing unsupported reaches a card.

import type { JobMatchDataV2, JobRequirementLedgerEntry } from '@/shared/types/ai';
import type {
  EligibilityView,
  JobMatchReportView,
  RequirementTotals,
  RewriteAvailability,
  RewritesView,
  ScoreDeductionRow,
  ScoreExplanationView,
  StrategyField,
  StrategyView,
} from '@/shared/types/job-match-report';
import { REPORT_ACCESS_LIMITS } from '@/shared/entitlements/registry';
import { groundJobMatchForDisplay } from './cv-recommendation-grounding';

export interface ReportViewAccess {
  fullReport: boolean;
  requirementLedger: boolean;
  rewriteStrategy: boolean;
  eligibility: boolean;
}

const UNSUPPORTED_MANDATORY_STATUSES = ['not_met', 'contradicted', 'unclear'] as const;

function isEligibilityRequirement(requirement: JobRequirementLedgerEntry): boolean {
  return requirement.category === 'eligibility' || requirement.category === 'availability';
}

function verdictFor(score: number): string {
  if (score >= 80) return 'Excellent Match';
  if (score >= 60) return 'Strong Candidate';
  if (score >= 40) return 'Partial Match — Tailoring Needed';
  return 'Limited Match';
}

function recommendationFor(score: number, mandatoryMissing: number): string {
  if (mandatoryMissing > 0) {
    return 'Focus on evidencing the unmet essential requirements before applying — tailoring alone will not close them.';
  }
  if (score >= 80) return 'Strong alignment. Tailor lightly and apply.';
  if (score >= 60) return 'Solid overlap. Tailor to surface your strongest evidence, then apply.';
  return 'Meaningful overlap with material gaps. Tailor carefully and set expectations before applying.';
}

/**
 * Which requirements the plan may render, using the SAME rule as
 * report-projection so the view model and any raw projected payload agree
 * exactly: preview slice first, then drop eligibility when it is gated.
 */
function selectVisibleRequirements(
  data: JobMatchDataV2,
  access: ReportViewAccess
): JobRequirementLedgerEntry[] {
  if (access.fullReport) return data.requirements;
  const base = access.requirementLedger
    ? data.requirements
    : data.requirements.slice(0, REPORT_ACCESS_LIMITS.previewRequirements);
  return base
    .filter((requirement) => access.eligibility || !isEligibilityRequirement(requirement))
    .map((requirement) => ({
      ...requirement,
      evidence: requirement.evidence.slice(0, REPORT_ACCESS_LIMITS.previewEvidencePerRequirement),
    }));
}

function computeTotals(
  data: JobMatchDataV2,
  visible: JobRequirementLedgerEntry[]
): RequirementTotals {
  const all = data.requirements;
  const count = (predicate: (r: JobRequirementLedgerEntry) => boolean) =>
    all.filter(predicate).length;
  const total = all.length;
  const visibleCount = visible.length;
  return {
    mandatory: count((r) => r.importance === 'mandatory'),
    desirable: count((r) => r.importance === 'desirable'),
    mandatoryMet: count((r) => r.importance === 'mandatory' && r.status === 'met'),
    desirableMet: count((r) => r.importance === 'desirable' && r.status === 'met'),
    met: count((r) => r.status === 'met'),
    partial: count((r) => r.status === 'partial'),
    notMet: count((r) => r.status === 'not_met'),
    unclear: count((r) => r.status === 'unclear'),
    contradicted: count((r) => r.status === 'contradicted'),
    visible: visibleCount,
    locked: Math.max(0, total - visibleCount),
    total,
  };
}

function buildScoreExplanation(
  data: JobMatchDataV2,
  visible: JobRequirementLedgerEntry[]
): ScoreExplanationView {
  const visibleIds = new Set(visible.map((r) => r.id));
  const visibleDeductions: ScoreDeductionRow[] = visible
    .filter((r) => r.deduction.points > 0)
    .map((r) => ({
      id: r.id,
      item: r.text,
      classification: r.status,
      points: r.deduction.points,
      reason: r.deduction.reason,
    }));

  const allRequirementDeductions = data.requirements.reduce(
    (sum, r) => sum + r.deduction.points,
    0
  );
  const visibleDeductionSum = data.requirements
    .filter((r) => visibleIds.has(r.id))
    .reduce((sum, r) => sum + r.deduction.points, 0);
  const lockedDeductionTotal = Math.max(0, allRequirementDeductions - visibleDeductionSum);
  const lockedDeductionCount = data.requirements.filter(
    (r) => !visibleIds.has(r.id) && r.deduction.points > 0
  ).length;

  const domainPoints = data.domainFit.deduction.points;
  const domainDeduction: ScoreDeductionRow | null =
    domainPoints > 0
      ? {
          id: 'domain-fit',
          item: 'Domain fit',
          classification: data.domainFit.status,
          points: domainPoints,
          reason: data.domainFit.deduction.reason,
        }
      : null;

  const startingScore = 100;
  const expected = Math.max(
    0,
    Math.min(100, startingScore - allRequirementDeductions - domainPoints)
  );

  return {
    startingScore,
    visibleDeductions,
    domainDeduction,
    lockedDeductionTotal,
    lockedDeductionCount,
    total: data.matchScore,
    // Reconciliation is a property of the canonical ledger, not the plan slice.
    reconciles: data.matchScore === expected,
  };
}

function buildEligibility(
  data: JobMatchDataV2,
  access: ReportViewAccess
): EligibilityView {
  const eligibility = data.requirements.filter(isEligibilityRequirement);
  const hardBlocker = eligibility.some((r) => r.status === 'contradicted');

  let summary: string;
  if (eligibility.length === 0) {
    summary = 'No specific eligibility or right-to-work requirements were identified for this role.';
  } else if (hardBlocker) {
    summary =
      'The CV appears to conflict with a stated eligibility requirement. Confirm your status before applying.';
  } else if (eligibility.every((r) => r.status === 'met')) {
    summary = 'The stated eligibility requirements appear to be satisfied by your CV.';
  } else {
    // Cautious, non-legal wording for ambiguous eligibility (e.g. a visa with an
    // expiry date against an advert asking for "full right to work").
    summary =
      'Your eligibility could not be fully confirmed from the CV. The advert wording may refer to current authorisation or unrestricted long-term status — recruiter clarification may be advisable. This is not a hard blocker.';
  }

  return {
    summary,
    hardBlocker,
    items: access.eligibility ? eligibility : [],
    locked: !access.eligibility && eligibility.length > 0,
  };
}

function deriveRewriteAvailability(
  data: JobMatchDataV2,
  access: ReportViewAccess,
  mandatoryMissing: number,
  mandatoryPartial: number
): RewriteAvailability {
  if (!access.rewriteStrategy) return 'plan_restricted';
  if (data.tailoredRewrites.length > 0) return 'available';
  // A truly empty rewrite set is only "not needed" when there is nothing to
  // close; otherwise the gaps need EVIDENCE, not rewording — never "perfectly
  // tailored".
  if (mandatoryMissing > 0 || mandatoryPartial > 0) return 'insufficient_supported_evidence';
  return 'not_needed';
}

function rewriteReason(availability: RewriteAvailability): string | undefined {
  switch (availability) {
    case 'available':
      return undefined;
    case 'not_needed':
      return 'Your bullet points are already well aligned to this role.';
    case 'insufficient_supported_evidence':
      return 'No safe rewrites were generated for the largest gaps because they require additional evidence rather than rewording.';
    case 'analysis_incomplete':
      return 'Some rewrite recommendations are unavailable because the requirement analysis is incomplete.';
    case 'generation_failed':
      return 'We could not safely generate rewrite suggestions. You were not charged.';
    case 'plan_restricted':
      return 'Evidence-based rewrites are part of the full rewrite strategy.';
  }
}

/** A strategy string field: available when non-empty, else a typed reason. */
function stringField(
  value: string | undefined,
  access: boolean,
  emptyReason: string
): StrategyField<string> {
  if (!access) return { status: 'plan_restricted' };
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return { status: 'insufficient_evidence', reason: emptyReason };
  return { status: 'available', value: trimmed };
}

/** A strategy list field: available when non-empty, else a typed reason. */
function listField(
  value: string[] | undefined,
  access: boolean,
  emptyReason: string
): StrategyField<string[]> {
  if (!access) return { status: 'plan_restricted' };
  const items = (value ?? []).map((v) => v.trim()).filter(Boolean);
  if (items.length === 0) return { status: 'insufficient_evidence', reason: emptyReason };
  return { status: 'available', value: items };
}

function buildStrategy(data: JobMatchDataV2, access: ReportViewAccess): StrategyView {
  const spec = data.cv_build_spec;
  const canSee = access.rewriteStrategy;
  return {
    recommendedTemplate: stringField(
      spec?.recommended_template,
      canSee,
      'No template recommendation was produced for this analysis.'
    ),
    templateRationale: stringField(
      spec?.template_rationale,
      canSee,
      'No template rationale was produced for this analysis.'
    ),
    leadProject: stringField(
      spec?.lead_project,
      canSee,
      'No verified lead project could be identified from your CV.'
    ),
    summaryAngle: stringField(
      spec?.summary_angle,
      canSee,
      'No grounded summary angle could be produced from the available evidence.'
    ),
    coverLetterAngle: stringField(
      spec?.cover_letter_angle,
      canSee,
      'No cover-letter angle was produced for this analysis.'
    ),
    skillsToSurface: listField(
      spec?.skills_to_surface,
      canSee,
      'No skills to surface were identified from your evidenced experience.'
    ),
    skillsToDeprioritise: listField(
      spec?.skills_to_deprioritise,
      canSee,
      'No skills to deprioritise were identified for this role.'
    ),
    sectionOrder: listField(
      spec?.section_order,
      canSee,
      'No section-order recommendation was produced for this analysis.'
    ),
    locked: !canSee,
  };
}

/**
 * Build the plan-aware report view model from canonical job-match data.
 * `cvText` (the raw CV) enables read-time recommendation grounding; pass it
 * whenever available.
 */
export function buildJobMatchReportView(
  canonical: JobMatchDataV2,
  access: ReportViewAccess,
  cvText?: string
): JobMatchReportView {
  // Ground user-facing recommendation text once, server-side, at read time.
  const data = groundJobMatchForDisplay(canonical, cvText);

  // Availability is DECIDED from the full canonical ledger (counts only, never
  // leaked): "not_needed" vs "insufficient_supported_evidence" must reflect real
  // gaps even when the plan cannot see them.
  const mandatory = data.requirements.filter((r) => r.importance === 'mandatory');
  const canonicalMissing = mandatory.filter((r) =>
    (UNSUPPORTED_MANDATORY_STATUSES as readonly string[]).includes(r.status)
  ).length;
  const canonicalPartial = mandatory.filter((r) => r.status === 'partial').length;

  const visible = selectVisibleRequirements(data, access);
  const totals = computeTotals(data, visible);

  // The EXPOSED gap texts (feeding the rewrite wizard) are gated to what the
  // plan may see — for full access `visible` is the whole ledger, so Pro gets
  // every gap while Free never receives locked requirement text.
  const visibleMandatory = visible.filter((r) => r.importance === 'mandatory');
  const mandatoryGaps = {
    missing: visibleMandatory
      .filter((r) => (UNSUPPORTED_MANDATORY_STATUSES as readonly string[]).includes(r.status))
      .map((r) => r.text),
    partial: visibleMandatory.filter((r) => r.status === 'partial').map((r) => r.text),
  };

  const availability = deriveRewriteAvailability(
    data,
    access,
    canonicalMissing,
    canonicalPartial
  );
  const rewrites: RewritesView = {
    availability,
    items: access.rewriteStrategy ? data.tailoredRewrites : [],
    reason: rewriteReason(availability),
  };

  return {
    overview: {
      score: data.matchScore,
      verdict: verdictFor(data.matchScore),
      summary: data.matchFeedback,
      experienceGap: data.experienceGap,
      recommendation: recommendationFor(data.matchScore, canonicalMissing),
    },
    requirements: {
      totals,
      items: visible,
      hasPersonSpecification: data.requirements.some(
        (r) => r.sourceSection === 'person_specification'
      ),
    },
    scoreExplanation: buildScoreExplanation(data, visible),
    assessments: {
      domainFit: data.domainFit,
      eligibility: buildEligibility(data, access),
    },
    rewrites,
    strategy: buildStrategy(data, access),
    mandatoryGaps,
    access,
  };
}

/**
 * Deterministic display invariants (§23). Returns the list of violated
 * invariants — empty means the view is safe to render. Callers decide whether a
 * violation degrades to an "incomplete analysis" state; this function never
 * throws so a single bad row cannot take down a route.
 */
export function validateJobMatchReportView(view: JobMatchReportView): string[] {
  const problems: string[] = [];
  const t = view.requirements.totals;

  if (t.mandatory + t.desirable !== t.total) {
    problems.push('totals: mandatory + desirable !== total');
  }
  if (t.visible + t.locked !== t.total) {
    problems.push('totals: visible + locked !== total');
  }
  if (view.requirements.items.length !== t.visible) {
    problems.push('totals: items.length !== visible');
  }
  if (view.overview.score < 0 || view.overview.score > 100) {
    problems.push('score: out of [0,100]');
  }
  if (view.scoreExplanation.total !== view.overview.score) {
    problems.push('score: explanation total !== overview score');
  }
  if (!view.scoreExplanation.reconciles) {
    problems.push('score: does not reconcile with canonical deductions');
  }
  if (view.rewrites.availability !== 'available' && view.rewrites.items.length > 0) {
    problems.push('rewrites: non-available state must not carry items');
  }
  if (view.rewrites.availability !== 'available' && !view.rewrites.reason) {
    problems.push('rewrites: zero-rewrite state must carry a typed reason');
  }
  // "not_needed" (the only state that renders positive "well aligned" copy) must
  // never coexist with an unmet mandatory gap.
  if (
    view.rewrites.availability === 'not_needed' &&
    (view.mandatoryGaps.missing.length > 0 || view.mandatoryGaps.partial.length > 0)
  ) {
    problems.push('rewrites: not_needed while mandatory gaps exist');
  }
  return problems;
}
