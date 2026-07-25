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
export const REWRITE_PROMPT_CONTEXT_VERSION = 1;

/** The model-output and source-reference contract for Stage 3 tailored rewrites. */
export const STRUCTURED_REWRITE_CONTRACT_VERSION = 1;
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
/** A claim reference the model may use only when it appeared in this generation input. */
export type RewriteSourceRef =
  | { source: 'source_cv'; section: string; entryId?: string; evidenceText?: string }
  | { source: 'ledger_evidence'; requirementId: string; evidenceIndex?: number }
  | { source: 'approved_profile'; requirementId: string; evidenceRef: { type: string; id: string } }
  | { source: 'application_context'; requirementId: string; contextId: string };
export interface ProvenancedTextBlock { text: string; sourceRefs: RewriteSourceRef[]; }
export interface ProvenancedBullet extends ProvenancedTextBlock { label?: string; }
export interface ProvenancedExperienceEntry { jobTitle: string; company: string; location?: string; type?: string; startDate?: string; endDate?: string; achievements: ProvenancedBullet[]; sourceRefs: RewriteSourceRef[]; }
export interface ProvenancedProjectEntry { name: string; skills?: string; startDate?: string; endDate?: string; achievements: ProvenancedBullet[]; sourceRefs: RewriteSourceRef[]; }
export interface ProvenancedEducationEntry { degree: string; university: string; startDate?: string; endDate?: string; grade?: string; description?: string; sourceRefs: RewriteSourceRef[]; }
export interface ProvenancedSkillGroup extends ProvenancedTextBlock { category: string; }
export interface ProvenancedCertificationEntry { name: string; issuer?: string; year?: string; sourceRefs: RewriteSourceRef[]; }
/** Raw model response. It contains content plus evidence references, never layout instructions. */
export interface StructuredCvRewriteOutput {
  identity: { name?: string; professionalTitle?: string; location?: string; contact?: { email?: string; phone?: string; website?: string; linkedin?: string; github?: string; visaStatus?: string; }; contactRefs?: string[]; sourceRefs: RewriteSourceRef[]; };
  summary?: ProvenancedTextBlock; experience: ProvenancedExperienceEntry[]; projects: ProvenancedProjectEntry[];
  education: ProvenancedEducationEntry[]; skills: ProvenancedSkillGroup[]; certifications: ProvenancedCertificationEntry[];
  generationNotes?: { unsupportedRequirementsNotAdded: string[]; omittedLowPriorityContent?: string[]; };
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
  /** Approved/current application-only evidence, retained with ids for provenance validation. */
  applicationEvidence?: RewriteApplicationEvidence[];
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
