// The canonical, explicit context for a single analysis run (ATS or job match).
//
// Before this contract the code conflated concepts that must stay separate:
// the EVIDENCE being analysed (what the candidate has actually done) and the
// TARGET being analysed against (what they are evaluated for). The active
// Profile silently supplied both, so an uploaded Warehouse CV analysed while a
// Software profile was active was scored as software. That is the leak this
// contract closes, generically across every role/profile pair.
//
// Ownership rule: the resolved target occupation below is the ONLY scoring lens.
// A Profile can influence it only after an explicit user confirmation, through
// `active_profile_confirmed` (the active Profile) or `saved_profile_confirmed`
// (another saved Profile the user picked) — never silently.

import type { OccupationId } from './classification';

/**
 * Where the evidence being analysed comes from. The uploaded-CV analysis paths
 * resolve to `cv_only` today; `profile` and `cv_and_profile` are reserved for
 * the deferred profile-as-evidence pipeline. The evidence source NEVER changes
 * the resolved target (asserted in tests) — it only affects whether/how the
 * candidate is shown to meet that target.
 */
export type EvidenceSource =
  | { type: 'cv_only' }
  | { type: 'profile'; profileId: string }
  | { type: 'cv_and_profile'; profileId: string };

/**
 * Which resolution tier decided the target. Provenance, not a rule input — the
 * resolved occupation is authoritative regardless. A Profile may set the target
 * only by one of two confirmed tiers, kept distinct so history and the
 * provenance panel can show WHICH Profile choice the user made:
 *   - `active_profile_confirmed`: the user confirmed the ACTIVE Profile's target.
 *   - `saved_profile_confirmed`:  the user picked another SAVED Profile's target.
 * Both carry {@link AnalysisContext.targetProfileId} identifying the Profile.
 *
 * `generic_fallback` vs `user_selected_generic` are kept distinct on purpose:
 * the first is "we could not resolve a target", the second is "the user asked
 * for a general, occupation-neutral review". They read differently in the
 * provenance panel and must round-trip differently.
 */
export type TargetSource =
  | 'job_description'
  | 'user_selected_role'
  | 'cv_detected'
  | 'active_profile_confirmed'
  | 'saved_profile_confirmed'
  | 'user_selected_generic'
  | 'generic_fallback';

/**
 * The user's explicit answer to "What is this CV intended for?" (ATS post-upload
 * step). This is the REQUEST-level selection; the server maps it to resolver
 * inputs and produces the authoritative {@link TargetSource} above. Kept separate
 * so a tampered/absent selection is re-resolved server-side, never trusted.
 */
export type TargetSelection =
  | 'detected'
  | 'active_profile'
  | 'saved_profile'
  | 'custom_role'
  | 'generic';

/** Narrowing helper: the discriminant of {@link EvidenceSource}. */
export type EvidenceSourceType = EvidenceSource['type'];

/**
 * Evidence sources the analysis-scoring pipeline can actually honour today. The
 * contract above is deliberately broader so Profile-backed evidence can be added
 * without reworking AnalysisContext, but until that scoring path exists the API
 * boundary accepts only this set. Bump as new scoring paths land.
 */
export const SUPPORTED_EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = ['cv_only'];

export type AnalysisConfidence = 'high' | 'medium' | 'low';

/**
 * A disagreement between the CV's own detected occupation and the active
 * Profile's occupation. Surfaced for a non-blocking UI notice and persisted for
 * provenance; it NEVER silently overrides the resolved target.
 */
export interface AnalysisMismatch {
  detectedOccupation: OccupationId;
  profileOccupation: OccupationId;
}

export interface AnalysisContext {
  mode: 'ats' | 'job_match';
  evidenceSource: EvidenceSource;
  targetSource: TargetSource;
  /** Free-text target role where one was supplied (user-entered or JD-derived). */
  resolvedTargetRole?: string;
  /** Authoritative scoring lens: an existing occupation-profile id. */
  resolvedTargetOccupation: OccupationId;
  /**
   * Reserved slot for a future coarse, PRESENTATION-ONLY family label. Kept so
   * the contract is extensible without reworking scoring ownership — scoring
   * stays with `resolvedTargetOccupation`; this label must never become a
   * scoring input.
   */
  resolvedTargetFamilyLabel?: string;
  confidence: AnalysisConfidence;
  /**
   * For a regulated resolved occupation, whether the CV corroborates it:
   * `present` (matching regulated title or mandatory credential found) or
   * `absent` (an explicitly-confirmed regulated target retained without
   * corroboration — registration missing/unclear, to be surfaced as a
   * non-blocking notice). `null`/omitted for non-regulated targets. Never an
   * assertion that the candidate is registered.
   */
  regulatedEvidence?: 'present' | 'absent' | null;
  /** Profile filed against / offered for confirmation, if any. */
  profileId?: string | null;
  /**
   * The Profile whose declared target was used as the scoring lens — set for
   * `active_profile_confirmed` (the active Profile) and `saved_profile_confirmed`
   * (another saved Profile the user picked as the target). Distinct from
   * {@link profileId}, which is the filing/associated track. Lets history reopen
   * showing the exact target choice without re-running classification.
   */
  targetProfileId?: string | null;
  /** Present when the CV's detected occupation differs from the active Profile's. */
  mismatch?: AnalysisMismatch | null;
}

/** Bump when the persisted context shape changes. */
export const ANALYSIS_CONTEXT_VERSION = 2;
