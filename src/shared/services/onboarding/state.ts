import { prisma } from '@/shared/lib/prisma';
import {
  OnboardingFirstValue,
  OnboardingGoal,
  OnboardingStage,
  OnboardingStatus,
} from '@/generated/prisma/client';
import { CvPipelineError } from '../cv-extraction/errors';
import {
  canTransition,
  firstValueSatisfiesGoal,
  onboardingProgress,
  stagesFor,
  type OnboardingContext,
} from './machine';

/**
 * Persistence and server-side enforcement for the onboarding journey.
 *
 * Every mutation re-reads the stored state, checks the requested move against
 * the machine, and verifies that any id in the request belongs to this user.
 * Nothing about a plan, a quota or an entitlement is stored or read here — those
 * are resolved live at the point of use, so an upgrade takes effect immediately
 * and a stale copy can never authorise anything.
 */

export interface OnboardingStateView {
  goal: OnboardingGoal | null;
  stage: OnboardingStage;
  status: OnboardingStatus;
  selectedProfileId: string | null;
  storedCvId: string | null;
  extractionId: string | null;
  importSessionId: string | null;
  firstValueType: OnboardingFirstValue | null;
  firstValueRef: string | null;
  firstValueCompletedAt: Date | null;
  lastErrorCode: string | null;
  progress: { stageIndex: number; totalStages: number; percentage: number };
  stages: OnboardingStage[];
}

type StateRow = {
  goal: OnboardingGoal | null;
  stage: OnboardingStage;
  status: OnboardingStatus;
  selectedProfileId: string | null;
  storedCvId: string | null;
  extractionId: string | null;
  importSessionId: string | null;
  firstValueType: OnboardingFirstValue | null;
  firstValueRef: string | null;
  firstValueCompletedAt: Date | null;
  lastErrorCode: string | null;
};

function toContext(row: StateRow): OnboardingContext {
  return {
    goal: row.goal,
    stage: row.stage,
    status: row.status,
    selectedProfileId: row.selectedProfileId,
    storedCvId: row.storedCvId,
    extractionId: row.extractionId,
    importSessionId: row.importSessionId,
    firstValueCompletedAt: row.firstValueCompletedAt,
  };
}

function toView(row: StateRow): OnboardingStateView {
  const context = toContext(row);
  return { ...row, progress: onboardingProgress(context), stages: stagesFor(row.goal) };
}

/**
 * Read a user's onboarding state, creating it on first look.
 *
 * Created lazily rather than at sign-up: a row per user that never starts
 * onboarding is noise, and existing users must not acquire one just by loading
 * a page.
 */
export async function getOnboardingState(userId: string): Promise<OnboardingStateView> {
  const row = await prisma.onboardingState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return toView(row);
}

/** Read without creating — for guards that must not have side effects. */
export async function peekOnboardingState(userId: string): Promise<OnboardingStateView | null> {
  const row = await prisma.onboardingState.findUnique({ where: { userId } });
  return row ? toView(row) : null;
}

/** Record the user's chosen goal and open the journey. */
export async function chooseGoal(userId: string, goal: OnboardingGoal): Promise<OnboardingStateView> {
  const current = await getOnboardingState(userId);
  if (current.status === OnboardingStatus.COMPLETED || current.status === OnboardingStatus.DISMISSED) {
    throw new CvPipelineError('INVALID_TRANSITION', 409);
  }
  // Changing the goal restarts the path at its second stage rather than keeping
  // a stage the new path may not contain.
  const path = stagesFor(goal);
  const row = await prisma.onboardingState.update({
    where: { userId },
    data: {
      goal,
      status: OnboardingStatus.IN_PROGRESS,
      stage: path[1] ?? OnboardingStage.GOAL,
      lastErrorCode: null,
    },
  });
  return toView(row);
}

export interface AdvanceInput {
  stage: OnboardingStage;
  /** Set when the user chooses to build their profile by hand instead. */
  manualPath?: boolean;
  selectedProfileId?: string;
  storedCvId?: string;
  extractionId?: string;
  importSessionId?: string;
}

/**
 * Move to a stage, having verified both the move and the ids that come with it.
 *
 * The attachments are applied BEFORE the transition is judged, because they are
 * usually what makes the next stage legal — a request that supplies a stored CV
 * id and asks for EXTRACTION is one action, not two. Each id is ownership-checked
 * against the database first: an id from another user's account is rejected, not
 * stored and then quietly ignored.
 */
export async function advanceOnboarding(userId: string, input: AdvanceInput): Promise<OnboardingStateView> {
  const current = await prisma.onboardingState.findUnique({ where: { userId } });
  if (!current) throw new CvPipelineError('ONBOARDING_STATE_MISSING', 409);

  const attachments: Partial<StateRow> = {};
  if (input.selectedProfileId) {
    const owned = await prisma.profile.findFirst({
      where: { id: input.selectedProfileId, userId },
      select: { id: true },
    });
    if (!owned) throw new CvPipelineError('FORBIDDEN', 403);
    attachments.selectedProfileId = owned.id;
  }
  if (input.storedCvId) {
    const owned = await prisma.storedCv.findFirst({
      where: { id: input.storedCvId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) throw new CvPipelineError('FORBIDDEN', 403);
    attachments.storedCvId = owned.id;
  }
  if (input.extractionId) {
    const owned = await prisma.cvExtraction.findFirst({
      where: { id: input.extractionId, storedCv: { userId, deletedAt: null } },
      select: { id: true },
    });
    if (!owned) throw new CvPipelineError('FORBIDDEN', 403);
    attachments.extractionId = owned.id;
  }
  if (input.importSessionId) {
    const owned = await prisma.cvImportSession.findFirst({
      where: { id: input.importSessionId, userId },
      select: { id: true },
    });
    if (!owned) throw new CvPipelineError('FORBIDDEN', 403);
    attachments.importSessionId = owned.id;
  }

  const context = { ...toContext(current), ...attachments } as OnboardingContext;
  const decision = canTransition(context, input.stage, { manualPath: input.manualPath });
  if (!decision.ok) {
    throw new CvPipelineError('INVALID_TRANSITION', 409, { reason: decision.reason });
  }

  const row = await prisma.onboardingState.update({
    where: { userId },
    data: {
      ...attachments,
      stage: input.stage,
      status: OnboardingStatus.IN_PROGRESS,
      lastErrorCode: null,
    },
  });
  return toView(row);
}

/**
 * Park the journey on a stage the user cannot currently get past — a full stored-CV
 * allowance, a failed extraction, an exhausted quota.
 *
 * BLOCKED is not an error state that loses anything: the stage and every
 * attachment stay exactly as they were, so removing an old CV or upgrading lets
 * the user carry on from where they stopped.
 */
export async function blockOnboarding(userId: string, errorCode: string): Promise<OnboardingStateView> {
  const row = await prisma.onboardingState.update({
    where: { userId },
    data: { status: OnboardingStatus.BLOCKED, lastErrorCode: errorCode },
  });
  return toView(row);
}

/**
 * Record that the user reached a meaningful outcome.
 *
 * Idempotent by design: the FIRST value is the one that counts, so a second
 * successful action does not overwrite it and a retried request cannot produce a
 * second completion record. Onboarding is marked COMPLETED here, which is what
 * makes "a Free user who got a deterministic ATS report has finished" true
 * without any paid operation being involved.
 */
export async function completeFirstValue(args: {
  userId: string;
  firstValueType: OnboardingFirstValue;
  firstValueRef?: string;
}): Promise<OnboardingStateView> {
  const current = await prisma.onboardingState.findUnique({ where: { userId: args.userId } });
  if (!current) throw new CvPipelineError('ONBOARDING_STATE_MISSING', 409);
  if (current.firstValueCompletedAt) return toView(current);

  const now = new Date();
  const [row] = await prisma.$transaction([
    prisma.onboardingState.update({
      where: { userId: args.userId },
      data: {
        firstValueType: args.firstValueType,
        firstValueRef: args.firstValueRef ?? null,
        firstValueCompletedAt: now,
        stage: OnboardingStage.COMPLETE,
        status: OnboardingStatus.COMPLETED,
        completedAt: now,
        lastErrorCode: null,
      },
    }),
    // Keeps the pre-existing guard honest: `onboardedAt` is what the dashboard
    // layout has always checked, and it must agree with the new state rather
    // than becoming a second, contradictory source of truth.
    prisma.user.update({ where: { id: args.userId }, data: { onboardedAt: now } }),
  ]);
  return toView(row);
}

/**
 * Record a first value from a feature route, without that route having to care
 * whether the user is onboarding at all.
 *
 * Silent and best-effort by design. Most calls come from users who finished
 * onboarding months ago and have no state row, and an analysis that succeeded
 * must never fail because a progress marker could not be written. Users who ARE
 * onboarding get their journey completed by the same call — which is what makes
 * "a Free user who received a deterministic ATS report has reached first value"
 * true without the client asserting it.
 */
export async function recordFirstValueIfOnboarding(args: {
  userId: string;
  firstValueType: OnboardingFirstValue;
  firstValueRef?: string;
}): Promise<void> {
  try {
    const state = await prisma.onboardingState.findUnique({
      where: { userId: args.userId },
      select: { status: true, firstValueCompletedAt: true, goal: true },
    });
    if (!state || state.firstValueCompletedAt) return;
    if (state.status === OnboardingStatus.COMPLETED || state.status === OnboardingStatus.DISMISSED) return;
    // Something good happened, but not the thing this user came for. Their
    // profile keeps every record just imported; the journey carries on to the
    // action they actually asked for rather than ending here.
    if (!firstValueSatisfiesGoal(state.goal, args.firstValueType)) return;
    await completeFirstValue(args);
  } catch (error) {
    console.warn(
      '[onboarding] Could not record first value:',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Let the user leave onboarding without finishing it.
 *
 * Dismissal is a UI decision and nothing else: the stored CV, the extraction,
 * the import session and every confirmed profile record stay exactly where they
 * are. The user is choosing not to be walked through the rest, not asking us to
 * throw away what they already did.
 */
export async function dismissOnboarding(userId: string): Promise<OnboardingStateView> {
  const now = new Date();
  const [row] = await prisma.$transaction([
    prisma.onboardingState.update({
      where: { userId },
      data: { status: OnboardingStatus.DISMISSED, dismissedAt: now },
    }),
    prisma.user.update({ where: { id: userId }, data: { onboardedAt: now } }),
  ]);
  return toView(row);
}

/**
 * Should this user be sent through onboarding at all?
 *
 * `onboardedAt` is the compatibility gate and is checked first: every existing
 * user already carries it, so nobody who has already been through the old wizard
 * is pulled into the new journey by this release.
 */
export async function shouldOnboard(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } });
  if (user?.onboardedAt) return false;
  const state = await prisma.onboardingState.findUnique({
    where: { userId },
    select: { status: true },
  });
  return (
    !state ||
    (state.status !== OnboardingStatus.COMPLETED && state.status !== OnboardingStatus.DISMISSED)
  );
}
