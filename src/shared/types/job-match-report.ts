// Server-derived job-match REPORT view model (presentation contract).
//
// This is deliberately separate from the canonical analysis contract
// (`JobMatchDataV2` in ./ai). The canonical ledger is authoritative and is
// NEVER recomputed on the client; this view model is the single, plan-aware
// projection of it that the report UI renders faithfully. It carries true
// totals, a reconciling score explanation, and typed states for rewrites and
// strategy so the UI can never invent a conclusion from absent/sliced data
// (e.g. "perfectly tailored" from an empty array, or "3 essential" from a
// preview slice).
//
// Built server-side by `services/job-match-report-view.ts`. Locked (plan-gated)
// content is represented by a typed state, never by leaking the hidden value.

import type {
  DomainFitV2,
  JobRequirementLedgerEntry,
  RequirementStatus,
  TailoredRewrite,
} from './ai';

/** Why zero rewrites — never inferred from an empty array by the UI. */
export type RewriteAvailability =
  | 'available'
  | 'not_needed'
  | 'insufficient_supported_evidence'
  | 'analysis_incomplete'
  | 'generation_failed'
  | 'plan_restricted';

/** Typed state for every strategy field, so the UI never renders a blank card. */
export type StrategyField<T> =
  | { status: 'available'; value: T }
  | { status: 'not_applicable'; reason: string }
  | { status: 'insufficient_evidence'; reason: string }
  | { status: 'analysis_incomplete'; reason: string }
  | { status: 'generation_failed'; reason: string }
  | { status: 'plan_restricted' };

export interface RequirementTotals {
  mandatory: number;
  desirable: number;
  /** Mandatory requirements with status `met` (drives the "X/Y Essential" badge). */
  mandatoryMet: number;
  /** Desirable requirements with status `met`. */
  desirableMet: number;
  met: number;
  partial: number;
  notMet: number;
  unclear: number;
  contradicted: number;
  /** Requirements actually present in `items` (after plan projection). */
  visible: number;
  /** Requirements withheld by plan projection. */
  locked: number;
  /** mandatory + desirable (== visible + locked). */
  total: number;
}

/** One line in the deterministic score explanation. */
export interface ScoreDeductionRow {
  id: string;
  item: string;
  classification: RequirementStatus | DomainFitV2['status'];
  points: number;
  reason: string;
}

export interface ScoreExplanationView {
  /** Deductive model: every match starts from 100. */
  startingScore: number;
  /** Deductions for requirements the plan is allowed to see. */
  visibleDeductions: ScoreDeductionRow[];
  /** Domain-fit deduction (not plan-gated), when non-zero. */
  domainDeduction: ScoreDeductionRow | null;
  /** Aggregate points from requirements withheld by plan projection. */
  lockedDeductionTotal: number;
  lockedDeductionCount: number;
  /** Final match score (== canonical matchScore). */
  total: number;
  /**
   * True when startingScore − (all deductions) reconciles to `total`, subject to
   * documented [0,100] clamping. Computed from CANONICAL data, so it is
   * independent of what the plan is allowed to see.
   */
  reconciles: boolean;
}

export interface EligibilityView {
  /**
   * Cautious, non-legal summary derived from eligibility/availability
   * requirements. Present for every plan (Free gets the summary only).
   */
  summary: string;
  /** Whether any eligibility requirement is an explicit, confirmed blocker. */
  hardBlocker: boolean;
  /** Full requirement detail — populated only when the plan may see it. */
  items: JobRequirementLedgerEntry[];
  /** True when detail is withheld by plan projection. */
  locked: boolean;
}

export interface RewritesView {
  availability: RewriteAvailability;
  items: TailoredRewrite[];
  /** Human-readable explanation for any non-`available` state. */
  reason?: string;
}

export interface StrategyView {
  recommendedTemplate: StrategyField<string>;
  templateRationale: StrategyField<string>;
  leadProject: StrategyField<string>;
  summaryAngle: StrategyField<string>;
  coverLetterAngle: StrategyField<string>;
  skillsToSurface: StrategyField<string[]>;
  skillsToDeprioritise: StrategyField<string[]>;
  sectionOrder: StrategyField<string[]>;
  /** True when the whole strategy is withheld by plan projection. */
  locked: boolean;
}

export interface JobMatchReportView {
  overview: {
    score: number;
    verdict: string;
    summary: string;
    experienceGap: string;
    recommendation: string;
  };
  requirements: {
    totals: RequirementTotals;
    items: JobRequirementLedgerEntry[];
    /** Person-specification (essential/desirable list) present in the JD. */
    hasPersonSpecification: boolean;
  };
  scoreExplanation: ScoreExplanationView;
  assessments: {
    domainFit: DomainFitV2;
    eligibility: EligibilityView;
  };
  rewrites: RewritesView;
  strategy: StrategyView;
  /** Mandatory gaps from the CANONICAL ledger — drives the rewrite wizard. */
  mandatoryGaps: { missing: string[]; partial: string[] };
  access: {
    fullReport: boolean;
    requirementLedger: boolean;
    rewriteStrategy: boolean;
    eligibility: boolean;
  };
}
