// The client/server contract for the post-upload "What is this CV intended
// for?" step. The /api/analyze/detect route produces {@link DetectResponse}; the
// target-selection UI consumes it and submits a {@link TargetSelectionPayload}
// back to /api/analyze, which re-resolves the choice authoritatively. Nothing
// here is trusted as a resolved target — it only drives what the picker shows.

import type { AnalysisConfidence } from './analysis-context';

/** The CV's own deterministically-detected occupation (no AI, no quota). */
export interface DetectedTarget {
  /** OccupationId, or 'generic' when nothing resolved confidently. */
  occupation: string;
  label: string;
  confidence: AnalysisConfidence;
  /** True when the detected occupation is a regulated profession. */
  regulated: boolean;
}

/** One saved career-track target the user can analyse against. */
export interface ProfileTargetOption {
  profileId: string;
  label: string;
  isDefault: boolean;
  /** OccupationId or '' when the track declares no structured occupation. */
  occupation: string;
  occupationLabel: string;
  roleTitle: string;
  /** True when this target's occupation is a regulated profession. */
  regulated: boolean;
}

/** A disagreement between the CV's detected occupation and the active Profile's. */
export interface DetectMismatch {
  detectedOccupation: string;
  detectedLabel: string;
  profileOccupation: string;
  profileLabel: string;
}

/** The full payload the detect endpoint returns for the picker. */
export interface DetectResponse {
  detected: DetectedTarget;
  activeProfile: ProfileTargetOption | null;
  savedProfiles: ProfileTargetOption[];
  mismatch: DetectMismatch | null;
}

/** The five explicit answers to "What is this CV intended for?". */
export type TargetChoice =
  | 'detected'
  | 'active_profile'
  | 'saved_profile'
  | 'custom_role'
  | 'generic';

/**
 * The extra form fields the analyze route reads for the chosen target. The
 * server maps `targetSelection` to a resolver decision and re-resolves it, so a
 * tampered payload cannot force an occupation.
 */
export interface TargetSelectionPayload {
  targetSelection: TargetChoice;
  /** Required when targetSelection === 'saved_profile'. */
  savedProfileId?: string;
  /** Required when targetSelection === 'custom_role'. */
  targetRole?: string;
}
