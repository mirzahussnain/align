import {
  OnboardingFirstValue,
  OnboardingGoal,
  OnboardingStage,
  OnboardingStatus,
} from '@/generated/prisma/client';

/**
 * The onboarding state machine, as pure data and pure functions.
 *
 * Kept free of Prisma so it can be reasoned about and tested on its own: the
 * question "may this user move from EXTRACTION to IMPORT_REVIEW" has one answer
 * and it does not depend on a database.
 *
 * The client is never trusted to say where it is. It proposes a target stage and
 * the server decides, because a stage is what unlocks upload, import and the
 * first action — a client that could set its own stage could skip past the
 * checks each of those depends on.
 */

/** The stages each goal actually visits, in order. */
const GOAL_PATHS: Record<OnboardingGoal, OnboardingStage[]> = {
  // "Check my CV" and "Match my CV to a job" share a path: both need a CV in,
  // extracted, attached to a profile and reviewed before the first action.
  CHECK_CV: [
    OnboardingStage.GOAL,
    OnboardingStage.CV_SOURCE,
    OnboardingStage.UPLOAD,
    OnboardingStage.EXTRACTION,
    OnboardingStage.PROFILE_SELECTION,
    OnboardingStage.CAREER_DIRECTION,
    OnboardingStage.IMPORT_REVIEW,
    OnboardingStage.ELIGIBILITY_BASICS,
    OnboardingStage.FIRST_ACTION,
    OnboardingStage.COMPLETE,
  ],
  MATCH_JOB: [
    OnboardingStage.GOAL,
    OnboardingStage.CV_SOURCE,
    OnboardingStage.UPLOAD,
    OnboardingStage.EXTRACTION,
    OnboardingStage.PROFILE_SELECTION,
    OnboardingStage.CAREER_DIRECTION,
    OnboardingStage.IMPORT_REVIEW,
    OnboardingStage.ELIGIBILITY_BASICS,
    OnboardingStage.FIRST_ACTION,
    OnboardingStage.COMPLETE,
  ],
  BUILD_PROFILE: [
    OnboardingStage.GOAL,
    OnboardingStage.CV_SOURCE,
    OnboardingStage.UPLOAD,
    OnboardingStage.EXTRACTION,
    OnboardingStage.PROFILE_SELECTION,
    OnboardingStage.CAREER_DIRECTION,
    OnboardingStage.IMPORT_REVIEW,
    OnboardingStage.FIRST_ACTION,
    OnboardingStage.COMPLETE,
  ],
  // No CV to upload, so there is nothing to store, extract or review. The user
  // goes straight to creating a profile and filling it in by hand.
  NO_CV: [
    OnboardingStage.GOAL,
    OnboardingStage.PROFILE_SELECTION,
    OnboardingStage.CAREER_DIRECTION,
    OnboardingStage.FIRST_ACTION,
    OnboardingStage.COMPLETE,
  ],
};

/** Before a goal is chosen the only stage that exists is the goal screen. */
export function stagesFor(goal: OnboardingGoal | null | undefined): OnboardingStage[] {
  return goal ? GOAL_PATHS[goal] : [OnboardingStage.GOAL];
}

/**
 * Users who choose to build their profile by hand leave the upload path without
 * changing their goal — "I said check my CV, but I'll type it in" is a normal
 * thing to do and should not throw away the goal they picked.
 */
export const MANUAL_PATH_STAGES: OnboardingStage[] = [
  OnboardingStage.PROFILE_SELECTION,
  OnboardingStage.CAREER_DIRECTION,
  OnboardingStage.FIRST_ACTION,
  OnboardingStage.COMPLETE,
];

/**
 * Does this outcome deliver what the user said they came to do?
 *
 * Reaching a first value ENDS onboarding, so it has to be the thing the user
 * actually wanted. A filled-in Career Profile is the destination for someone who
 * came to build one — but for someone who came to check their CV it is a step on
 * the way, six stages into a nine-stage path, and treating it as the finish line
 * closes the journey before they ever see the check they asked for.
 *
 * An analysis result satisfies every goal: it is a real outcome in its own right,
 * and a user who has one has unambiguously got somewhere.
 */
export function firstValueSatisfiesGoal(
  goal: OnboardingGoal | null | undefined,
  firstValue: OnboardingFirstValue
): boolean {
  if (firstValue !== OnboardingFirstValue.PROFILE_CREATED) return true;
  // No stated goal means nothing was promised, so a usable profile is a real
  // outcome rather than an interruption of one.
  return !goal || goal === OnboardingGoal.BUILD_PROFILE || goal === OnboardingGoal.NO_CV;
}

export interface OnboardingContext {
  goal: OnboardingGoal | null;
  stage: OnboardingStage;
  status: OnboardingStatus;
  selectedProfileId: string | null;
  storedCvId: string | null;
  extractionId: string | null;
  importSessionId: string | null;
  firstValueCompletedAt: Date | null;
}

export type TransitionRejection =
  | 'goal_required'
  | 'stage_not_in_path'
  | 'stage_skipped'
  | 'profile_required'
  | 'stored_cv_required'
  | 'extraction_required'
  | 'import_session_required'
  | 'first_value_required'
  | 'already_finished';

export type TransitionResult = { ok: true } | { ok: false; reason: TransitionRejection };

/**
 * What each stage requires to have already happened.
 *
 * These are the real prerequisites, not UI ordering: you cannot review an import
 * without an import session, and you cannot finish without a first value. Every
 * one of them is checked server-side against persisted state rather than against
 * anything the request claims.
 */
function prerequisiteFor(stage: OnboardingStage, context: OnboardingContext): TransitionRejection | null {
  switch (stage) {
    case OnboardingStage.EXTRACTION:
      return context.storedCvId ? null : 'stored_cv_required';
    case OnboardingStage.PROFILE_SELECTION:
      return null;
    case OnboardingStage.CAREER_DIRECTION:
      return context.selectedProfileId ? null : 'profile_required';
    case OnboardingStage.IMPORT_REVIEW:
      if (!context.selectedProfileId) return 'profile_required';
      if (!context.extractionId) return 'extraction_required';
      return context.importSessionId ? null : 'import_session_required';
    case OnboardingStage.ELIGIBILITY_BASICS:
    case OnboardingStage.FIRST_ACTION:
      return context.selectedProfileId ? null : 'profile_required';
    case OnboardingStage.COMPLETE:
      return context.firstValueCompletedAt ? null : 'first_value_required';
    default:
      return null;
  }
}

/**
 * May this user move to `target` from where they actually are?
 *
 * Backwards is always allowed within the path — going back to change an answer
 * is a normal thing to do and nothing behind you can be invalidated by looking
 * at it. Forwards is allowed one stage at a time, and only when that stage's
 * prerequisites are genuinely met.
 */
export function canTransition(
  context: OnboardingContext,
  target: OnboardingStage,
  options: { manualPath?: boolean } = {}
): TransitionResult {
  if (context.status === OnboardingStatus.COMPLETED || context.status === OnboardingStatus.DISMISSED) {
    return { ok: false, reason: 'already_finished' };
  }
  if (target !== OnboardingStage.GOAL && !context.goal) {
    return { ok: false, reason: 'goal_required' };
  }

  // The manual path is a legitimate shortcut out of the upload stages, not a
  // way to skip the checks — its own prerequisites still apply below.
  const path = options.manualPath
    ? [OnboardingStage.GOAL, ...MANUAL_PATH_STAGES]
    : stagesFor(context.goal);

  const currentIndex = path.indexOf(context.stage);
  const targetIndex = path.indexOf(target);
  if (targetIndex === -1) return { ok: false, reason: 'stage_not_in_path' };

  // A current stage outside the path happens when the user switches to manual
  // entry mid-upload; treat it as being at the start of the new path.
  const from = currentIndex === -1 ? 0 : currentIndex;
  if (targetIndex > from + 1) return { ok: false, reason: 'stage_skipped' };

  const missing = prerequisiteFor(target, context);
  return missing ? { ok: false, reason: missing } : { ok: true };
}

/** The next stage on this user's path, or null at the end. */
export function nextStage(
  context: OnboardingContext,
  options: { manualPath?: boolean } = {}
): OnboardingStage | null {
  const path = options.manualPath ? [OnboardingStage.GOAL, ...MANUAL_PATH_STAGES] : stagesFor(context.goal);
  const index = path.indexOf(context.stage);
  return index === -1 || index === path.length - 1 ? null : path[index + 1];
}

/**
 * Onboarding progress — how far through the STAGES the user is.
 *
 * Deliberately not profile completeness, and never mixed with it. Opening the
 * second screen means the journey is 2 stages in; it says nothing about how much
 * of the user's Career Profile is filled in, and reporting one as the other is
 * what made the old wizard claim "Profile 40% complete" for an empty profile.
 */
export function onboardingProgress(context: OnboardingContext): {
  stageIndex: number;
  totalStages: number;
  percentage: number;
} {
  const path = stagesFor(context.goal);
  const index = Math.max(0, path.indexOf(context.stage));
  // COMPLETE is the terminal marker, not a step the user performs, so the
  // denominator is the number of stages they actually pass through.
  const total = Math.max(1, path.length - 1);
  return {
    stageIndex: index,
    totalStages: total,
    percentage: Math.min(100, Math.round((index / total) * 100)),
  };
}
