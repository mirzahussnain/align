// Resolves the explicit AnalysisContext for one run and, crucially, decides
// whether the active Profile is allowed to influence the target.
//
// This is where the leak is closed: the route hands the resolver both the CV/JD
// and the active Profile's declared target, but the resolver passes the Profile
// into the classifier ONLY when the user explicitly chose it (an explicit
// per-analysis target) or explicitly confirmed the active Profile (ATS). In
// every other case the Profile contributes nothing to the target — the target
// comes from the JD (job match) or the CV's own evidence (ATS), exactly as it
// should. The Profile's occupation is still recorded for a non-blocking mismatch
// notice, but it never silently becomes the scoring lens.

import { classifyAsGeneric, classifyCV, scoreOccupationEvidence, type ClassifyInput } from './classifier';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import type { Classification, ClassificationSource, OccupationId } from '@/shared/types/classification';
import type {
  AnalysisConfidence,
  AnalysisContext,
  AnalysisMismatch,
  EvidenceSource,
  TargetSource,
} from '@/shared/types/analysis-context';

/** A per-analysis target the user explicitly chose (free-text role and/or occupation). */
export interface ExplicitTargetInput {
  occupation?: string | null;
  roleTitle?: string | null;
  industry?: string | null;
  seniority?: string | null;
}

/** The active/selected Profile's declared target. NEVER auto-applied to an upload. */
export interface ActiveProfileTargetInput extends ExplicitTargetInput {
  profileId: string;
}

export interface ResolveAnalysisContextInput {
  mode: 'ats' | 'job_match';
  cvText: string;
  jobDescription?: string;
  /** Highest-priority target: an explicit per-analysis user choice. */
  explicitTarget?: ExplicitTargetInput;
  /** The active Profile's target — used only when the user confirmed it (ATS). */
  activeProfileTarget?: ActiveProfileTargetInput;
  /** True only when the user explicitly confirmed analysing against a Profile target (ATS). */
  confirmProfileTarget?: boolean;
  /**
   * Which Profile the confirmed target belongs to, for provenance only:
   * `active` (the request's active Profile) or `saved` (another saved Profile
   * the user picked). Ignored unless {@link confirmProfileTarget} is true.
   * Defaults to `active`.
   */
  confirmedTargetKind?: 'active' | 'saved';
  /**
   * True when the user explicitly asked for a general, occupation-neutral review
   * ("general ATS review"). Overrides every detection tier: the target is the
   * generic profile by deliberate choice, not by low-confidence fallback.
   */
  forceGeneric?: boolean;
  evidenceSource: EvidenceSource;
  /** False when the AI classification tier must not run (quota-degraded ATS). */
  aiAllowed: boolean;
}

export interface ResolvedAnalysis {
  context: AnalysisContext;
  /** The classification the scoring engine must use — the resolved target, never the Profile's silent default. */
  classification: Classification;
}

type AIClassifier = Parameters<typeof classifyCV>[1];

function isMeaningful(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function bucketConfidence(confidence: number): AnalysisConfidence {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/** Map the classifier's tier to the context's provenance vocabulary. */
function deriveTargetSource(
  source: ClassificationSource,
  explicitTargetSource: TargetSource | null
): TargetSource {
  switch (source) {
    case 'job_description':
      return 'job_description';
    case 'profile_target':
      // The classifier only reaches this tier when we passed a target, and we
      // only pass one for an explicit choice or a confirmed Profile target —
      // explicitTargetSource carries which (role / active / saved).
      return explicitTargetSource ?? 'active_profile_confirmed';
    case 'dictionary_evidence':
    case 'ai':
      return 'cv_detected';
    case 'fallback':
    default:
      return 'generic_fallback';
  }
}

/** The provenance tiers by which a confirmed Profile target set the scoring lens. */
function isProfileConfirmedSource(source: TargetSource): boolean {
  return source === 'active_profile_confirmed' || source === 'saved_profile_confirmed';
}

/**
 * The active Profile's occupation vs the CV's own detected occupation. Advisory
 * only — drives a non-blocking notice, never the resolved target. Resolved from
 * the Profile's structured occupation; a Profile that only carries a free-text
 * role title yields no mismatch (kept deliberately conservative).
 */
function computeMismatch(
  cvText: string,
  profile: ActiveProfileTargetInput | undefined
): AnalysisMismatch | null {
  if (!profile || !isKnownOccupation(profile.occupation) || profile.occupation === 'generic') {
    return null;
  }
  const detected = scoreOccupationEvidence(cvText);
  if (detected.occupation === 'generic' || detected.occupation === profile.occupation) {
    return null;
  }
  return { detectedOccupation: detected.occupation, profileOccupation: profile.occupation };
}

function profileIdFromEvidence(evidenceSource: EvidenceSource): string | null {
  return evidenceSource.type === 'cv_only' ? null : evidenceSource.profileId;
}

/** The CV's own detected occupation, plus a mismatch against a Profile target. */
export interface CvTargetDetection {
  occupation: OccupationId;
  /** Human-readable occupation label (e.g. "Warehouse Operative"). */
  label: string;
  confidence: AnalysisConfidence;
  /** Present when the detected occupation differs from the given Profile target. */
  mismatch: AnalysisMismatch | null;
}

/**
 * Deterministic, AI-free detection of what an uploaded CV is *itself* for, used
 * by the post-upload "What is this CV intended for?" step. Runs the same
 * evidence scorer the ATS classifier uses at its dictionary tier, so the value
 * the user is shown is exactly what the analysis would resolve to if they accept
 * the detected target. `profileOccupation`, when supplied, drives the mismatch.
 */
export function detectCvTarget(
  cvText: string,
  profileOccupation?: string | null
): CvTargetDetection {
  const evidence = scoreOccupationEvidence(cvText);
  const occupation = evidence.occupation;
  const mismatch =
    isKnownOccupation(profileOccupation) &&
    profileOccupation !== 'generic' &&
    occupation !== 'generic' &&
    occupation !== profileOccupation
      ? { detectedOccupation: occupation, profileOccupation }
      : null;
  return {
    occupation,
    label: getOccupationProfile(occupation).label,
    confidence: bucketConfidence(evidence.confidence),
    mismatch,
  };
}

export async function resolveAnalysisContext(
  input: ResolveAnalysisContextInput,
  aiClassifier?: AIClassifier
): Promise<ResolvedAnalysis> {
  const {
    mode,
    cvText,
    jobDescription,
    explicitTarget,
    activeProfileTarget,
    confirmProfileTarget,
    confirmedTargetKind,
    forceGeneric,
    evidenceSource,
    aiAllowed,
  } = input;

  // A deliberately general review short-circuits every detection tier. It is the
  // user's explicit choice, so it is not a low-confidence guess and it never
  // shows a mismatch (they opted out of targeting). ATS only — a job match's
  // target is always the JD.
  if (mode === 'ats' && forceGeneric) {
    const classification = classifyAsGeneric(cvText);
    const context: AnalysisContext = {
      mode,
      evidenceSource,
      targetSource: 'user_selected_generic',
      resolvedTargetOccupation: classification.occupation,
      confidence: 'high',
      regulatedEvidence: null,
      profileId: activeProfileTarget?.profileId ?? profileIdFromEvidence(evidenceSource),
      targetProfileId: null,
      mismatch: null,
    };
    return { context, classification };
  }

  // Decide whether — and why — a target is handed to the classifier. The active
  // Profile is never passed unless the user confirmed it; this single gate is
  // what stops the Profile silently determining an upload's occupation rules.
  let passedTarget: ClassifyInput['profileTarget'];
  let explicitTargetSource: TargetSource | null = null;

  const explicitIsResolvable =
    explicitTarget &&
    (isMeaningful(explicitTarget.occupation) || isMeaningful(explicitTarget.roleTitle));

  if (explicitIsResolvable) {
    passedTarget = explicitTarget;
    explicitTargetSource = 'user_selected_role';
  } else if (mode === 'ats' && confirmProfileTarget && activeProfileTarget) {
    passedTarget = activeProfileTarget;
    // Distinguish confirming the active Profile from picking another saved one,
    // so history/provenance can show which choice the user actually made.
    explicitTargetSource =
      confirmedTargetKind === 'saved' ? 'saved_profile_confirmed' : 'active_profile_confirmed';
  }
  // Job match never passes the active Profile: for a vacancy the Profile is
  // evidence only, and the target is the JD.

  const classification = await classifyCV(
    {
      cvText,
      mode,
      jobDescription: mode === 'job_match' ? jobDescription : undefined,
      profileTarget: passedTarget,
      aiAllowed,
    },
    aiClassifier
  );

  const resolvedTargetRole = isMeaningful(explicitTarget?.roleTitle)
    ? explicitTarget!.roleTitle!.trim()
    : undefined;

  const targetSource = deriveTargetSource(classification.source, explicitTargetSource);

  const context: AnalysisContext = {
    mode,
    evidenceSource,
    targetSource,
    resolvedTargetOccupation: classification.occupation,
    ...(resolvedTargetRole ? { resolvedTargetRole } : {}),
    confidence: bucketConfidence(classification.confidence),
    // Whether the (regulated) resolved target is corroborated by the CV, so the
    // UI can surface a non-blocking "no evidence of the regulated profession"
    // notice without re-running classification. Null for non-regulated targets.
    regulatedEvidence: classification.regulatedEvidence ?? null,
    profileId: activeProfileTarget?.profileId ?? profileIdFromEvidence(evidenceSource),
    // Recorded only when a Profile's target actually became the scoring lens, so
    // history can reopen showing which Profile was chosen as the target.
    targetProfileId: isProfileConfirmedSource(targetSource)
      ? activeProfileTarget?.profileId ?? null
      : null,
    mismatch: computeMismatch(cvText, activeProfileTarget),
  };

  return { context, classification };
}
