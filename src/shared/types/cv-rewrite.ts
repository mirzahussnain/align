/**
 * Ledger-native CV rewrite contract.
 *
 * The tailored-CV rewriter consumes JobMatchDataV2 through a compact,
 * generation-specific projection — never the full ledger, profile, or UI
 * result. Everything here exists to keep the model prompt small and to keep
 * generation honest: the rewriter may only restate evidence that already
 * exists, never invent claims. The former mandatory/desirable adapter arrays
 * are gone; this is the whole surface the rewriter now sees.
 */
import type {
  CvBuildSpec,
  RequirementCategory,
  RequirementImportance,
  RequirementStatus,
} from '@/shared/types/ai';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';
import type { TemplateId } from '@/shared/constants/templates';

/**
 * Bumped whenever the shape or ordering of the rewrite prompt changes, so a
 * stored GeneratedCV can be traced back to the exact prompt contract that made
 * it. Not the AI model version — the prompt-context version.
 */
export const REWRITE_PROMPT_CONTEXT_VERSION = 1;

/** Bumped whenever the post-generation truthfulness checks change. */
export const TRUTHFULNESS_VALIDATION_VERSION = 1;

/**
 * One requirement, projected for generation. Deliberately omits confidence,
 * deduction points/reasons, UI metadata, and every other scoring field — none
 * of it should be paid for in prompt tokens or acted on by the rewriter.
 */
export interface RewriteRequirement {
  id: string;
  text: string;
  importance: RequirementImportance;
  status: RequirementStatus;
  category: RequirementCategory;
  /** Canonical CV wording that evidences this requirement, if any. */
  cvEvidence: string[];
  /** User-approved profile wording tied to this requirement, if any. */
  approvedProfileEvidence: string[];
}

export interface RewriteDomainFit {
  status: 'aligned' | 'partial' | 'mismatch';
  detail: string;
}

/**
 * Eligibility/availability constraints surfaced so the rewriter never writes a
 * work-authorisation or availability claim the ledger contradicts.
 */
export interface RewriteEligibilityConstraint {
  requirementId: string;
  text: string;
  status: RequirementStatus;
}

/** The compact ledger the model actually sees. */
export interface CompactRewriteContext {
  requirements: RewriteRequirement[];
  domainFit?: RewriteDomainFit;
  eligibilityConstraints: RewriteEligibilityConstraint[];
  cvBuildSpec: CvBuildSpec;
}

/**
 * One explicit free-text note the user typed about a specific requirement.
 * Kept separate from CV and profile evidence, and never upgraded into verified
 * profile data.
 */
export interface UserProvidedContext {
  /** The skill/requirement the note is about. */
  label: string;
  /** The user's own words. */
  text: string;
}

/**
 * Truth-preserving ATS emphasis inputs. Nothing here authorises fabrication:
 * present keywords may be surfaced (the CV already has them), clichés avoided.
 * The former on/off JSON blob carried categories that were never rendered.
 */
export interface AtsOptimizationData {
  /** Keywords the CV already contains, safe to surface prominently. */
  presentKeywords: string[];
  /** Recommendation headlines from the analysis, as guidance only. */
  recommendations: string[];
  /** Cliché phrases to strip out. */
  aiClichesToAvoid: string[];
}

/** The entire input the ledger-native rewriter consumes. */
export interface LedgerNativeRewriteInput {
  cvText: string;
  jobDescription: string;
  rewriteContext: CompactRewriteContext;
  approvedProfileEvidence: ApprovedProfileEvidenceOverlay[];
  userContext?: UserProvidedContext[];
  template: TemplateId;
  atsOptimizationData?: AtsOptimizationData;
}

/** Deterministic prompt-budget knobs. */
export interface PromptBudgetLimits {
  maxPromptTokens: number;
  maxRequirementEvidenceChars: number;
  maxCvChars: number;
  maxJobDescriptionChars: number;
}

/** Non-user-facing diagnostics, persisted in provenance for later tracing. */
export interface RewritePromptDebug {
  promptContextVersion: number;
  estimatedPromptTokens: number;
  requirementCount: number;
  /** Low-priority sections dropped to fit the budget, in the order dropped. */
  droppedSections: string[];
}
