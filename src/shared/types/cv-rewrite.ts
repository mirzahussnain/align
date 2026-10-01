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
  AiCvBuildGuidance,
  RequirementCategory,
  RequirementImportance,
  RequirementStatus,
} from '@/shared/types/ai';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';
import type { TemplateId } from '@/shared/constants/templates';
import type { ExperienceDuration } from '@/shared/services/derived-facts';

/**
 * Bumped whenever the shape or ordering of the rewrite prompt changes, so a
 * stored GeneratedCV can be traced back to the exact prompt contract that made
 * it. Not the AI model version — the prompt-context version.
 */
export const REWRITE_PROMPT_CONTEXT_VERSION = 2;

/**
 * The model-output and source-reference contract for Stage 3 tailored rewrites.
 *
 * v2 adds optional per-skill provenance (`ProvenancedSkillGroup.items`). It is
 * additive and backward compatible: a v1 draft that carries only group-level
 * `sourceRefs` still validates exactly as before, while a v2 draft lets the
 * deterministic salvage pass keep the supported skills in a group and drop only
 * the unsupported ones instead of discarding the whole document.
 */
export const STRUCTURED_REWRITE_CONTRACT_VERSION = 2;
export const REWRITE_SOURCE_REFERENCE_SCHEMA_VERSION = 1;

/** Bumped whenever the post-generation truthfulness checks change. */
export const TRUTHFULNESS_VALIDATION_VERSION = 1;

/**
 * Bumped whenever the shape of the trusted generation context (canonical
 * snapshot + approval snapshots + derived facts + conflicts) changes, so a
 * stored GeneratedCV records which trust contract produced it.
 */
export const TRUSTED_GENERATION_CONTEXT_VERSION = 1;

/** Bumped whenever the deterministic unsupported-claim detectors change. */
export const UNSUPPORTED_CLAIM_VALIDATION_VERSION = 1;

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
  /** Stable ids into the canonical evidence registry. Prose is serialized once. */
  evidenceIds?: string[];
}

export interface CanonicalEvidenceRecord {
  id: string;
  source: 'source_cv' | 'approved_profile' | 'application_context';
  text: string;
  requirementIds: string[];
  /** Ledger coordinates retained for the existing output provenance contract. */
  ledgerRefs?: { requirementId: string; evidenceIndex: number }[];
  evidenceRef?: { type: string; id: string };
  contextId?: string;
  label?: string;
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
  /** AI-authored advisory guidance (non-authoritative); property name retained. */
  cvBuildSpec: AiCvBuildGuidance;
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

/** A server-resolved application-only evidence record. Client text is never a source. */
export interface RewriteApplicationEvidence { id: string; requirementId: string; context: UserProvidedContext; }
/** Model-output types are inferred from the one runtime/native-schema contract. */
export type {
  RewriteSourceRef, ProvenancedTextBlock, ProvenancedBullet, ProvenancedExperienceEntry,
  ProvenancedProjectEntry, ProvenancedEducationEntry, ProvenancedSkillItem,
  ProvenancedSkillGroup, ProvenancedCertificationEntry, StructuredCvRewriteOutput,
} from '@/shared/schemas/cv-rewrite-output';
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
export interface CanonicalRewriteContext {
  cvText: string;
  jobDescription: string;
  targetJob?: { title: string; employer: string; location?: string };
  rewriteContext: CompactRewriteContext;
  approvedProfileEvidence: ApprovedProfileEvidenceOverlay[];
  userContext?: UserProvidedContext[];
  /** Approved/current application-only evidence, retained with ids for provenance validation. */
  applicationEvidence?: RewriteApplicationEvidence[];
  /** De-duplicated evidence records referenced by requirement.evidenceIds. */
  evidenceRegistry?: CanonicalEvidenceRecord[];
  template: TemplateId;
  atsOptimizationData?: AtsOptimizationData;
  /**
   * The ONLY supported professional-experience duration, derived deterministically
   * from canonical Experience records. `null` means no duration is supported and
   * the model must state none. The model must never compute its own.
   */
  trustedExperienceDuration?: ExperienceDuration | null;
  /**
   * Facts the trusted context could not settle. The model must not present either
   * side as confirmed. Kept as plain field/reason pairs — no ids reach the prompt.
   */
  unresolvedConflicts?: { field: string; reason: string }[];
  /**
   * Feedback from a rejected first draft, appended on a single controlled
   * correction attempt. Absent on the first pass.
   */
  correctionNotes?: string[];
}

/** Backward-compatible name while callers migrate to the canonical contract. */
export type LedgerNativeRewriteInput = CanonicalRewriteContext;

/** Legacy caller knobs retained for compatibility; canonical facts are not sliced. */
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
  /** Retained for provenance compatibility; canonical assembly always leaves this empty. */
  droppedSections: string[];
}
