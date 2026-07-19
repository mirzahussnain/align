// Profile-vs-CV reconciliation.
//
// A candidate's uploaded CV is a snapshot; their Align profile is the full
// record. When a job match runs, the profile often holds a project, skill or
// qualification that fits the JD *better* than what the CV actually shows.
// This reconciliation surfaces those, with a reason, so the user can approve
// swapping them into the tailored rewrite.

export type SwapKind = 'project' | 'experience' | 'skill' | 'education' | 'certification';

/**
 * One addressable item from the profile, handed to the AI with a stable `id`.
 * The AI may only refer to items by these ids — it is never asked to invent or
 * describe profile content, which is what keeps it from fabricating credentials.
 */
export interface ProfileCandidate {
  /** Stable, structural id, e.g. `project:2` or `skill:1:4`. */
  id: string;
  kind: SwapKind;
  /** Short display name. */
  label: string;
  /** Fuller text given to the model for relevance judgement. */
  detail: string;
}

/** A suggested change, after server-side validation against the real profile. */
export interface ProfileSwap {
  /** Id of the profile item to bring in. Guaranteed to resolve. */
  id: string;
  kind: SwapKind;
  /** Resolved from the profile, never from the model's own words. */
  profileItem: string;
  /** Fuller profile detail, for display under the suggestion. */
  profileDetail: string;
  /** What it should replace or demote in the CV; null means a pure addition. */
  cvItem: string | null;
  /** The JD requirement this satisfies. */
  jdRequirement: string;
  /** Why the profile item is the better fit. */
  rationale: string;
  confidence: 'high' | 'medium';
}

/** Raw shape the model returns, before validation. */
export interface RawProfileSwap {
  id?: unknown;
  cvItem?: unknown;
  jdRequirement?: unknown;
  rationale?: unknown;
  confidence?: unknown;
}

export interface ProfileReconciliation {
  swaps: ProfileSwap[];
  /** Set when the pass ran but found nothing worth swapping. */
  checked: boolean;
  /**
   * Whether a model was actually invoked. False when the profile held nothing to
   * compare and the pass short-circuited. Metering reads this: a run that never
   * reached a provider must not consume the user's monthly allowance.
   */
  usedAI: boolean;
}
