import { describe, expect, it } from 'vitest';
import {
  canTransition,
  firstValueSatisfiesGoal,
  nextStage,
  onboardingProgress,
  stagesFor,
  type OnboardingContext,
} from '../machine';

/**
 * The state machine on its own, with no database in sight.
 *
 * "May this user move from EXTRACTION to IMPORT_REVIEW" has one answer and it
 * does not depend on Postgres, so it is proved here where the cases are cheap
 * enough to enumerate exhaustively.
 */

function context(overrides: Partial<OnboardingContext> = {}): OnboardingContext {
  return {
    goal: 'CHECK_CV',
    stage: 'GOAL',
    status: 'IN_PROGRESS',
    selectedProfileId: null,
    storedCvId: null,
    extractionId: null,
    importSessionId: null,
    firstValueCompletedAt: null,
    ...overrides,
  };
}

describe('goal paths', () => {
  it('gives the no-CV goal a path with no upload, extraction or import stages', () => {
    const path = stagesFor('NO_CV');
    expect(path).not.toContain('UPLOAD');
    expect(path).not.toContain('EXTRACTION');
    expect(path).not.toContain('IMPORT_REVIEW');
    expect(path).toContain('PROFILE_SELECTION');
  });

  it('takes the CV goals through upload, extraction and review', () => {
    for (const goal of ['CHECK_CV', 'MATCH_JOB'] as const) {
      expect(stagesFor(goal)).toEqual([
        'GOAL',
        'CV_SOURCE',
        'UPLOAD',
        'EXTRACTION',
        'PROFILE_SELECTION',
        'CAREER_DIRECTION',
        'IMPORT_REVIEW',
        'ELIGIBILITY_BASICS',
        'FIRST_ACTION',
        'COMPLETE',
      ]);
    }
  });

  it('offers only the goal screen before a goal is chosen', () => {
    expect(stagesFor(null)).toEqual(['GOAL']);
  });
});

describe('forward transitions', () => {
  it('allows the next stage on the path', () => {
    expect(canTransition(context({ stage: 'GOAL' }), 'CV_SOURCE')).toEqual({ ok: true });
  });

  it('rejects skipping a stage', () => {
    expect(canTransition(context({ stage: 'GOAL' }), 'UPLOAD')).toEqual({
      ok: false,
      reason: 'stage_skipped',
    });
  });

  it('rejects a stage that is not on this goal’s path at all', () => {
    expect(canTransition(context({ goal: 'NO_CV', stage: 'GOAL' }), 'UPLOAD')).toEqual({
      ok: false,
      reason: 'stage_not_in_path',
    });
  });

  it('requires a goal before anything but the goal screen', () => {
    expect(canTransition(context({ goal: null, stage: 'GOAL' }), 'CV_SOURCE')).toEqual({
      ok: false,
      reason: 'goal_required',
    });
  });
});

describe('backwards navigation', () => {
  it('always allows going back within the path', () => {
    const at = context({ stage: 'IMPORT_REVIEW', selectedProfileId: 'p1', storedCvId: 's1' });
    expect(canTransition(at, 'CAREER_DIRECTION')).toEqual({ ok: true });
    expect(canTransition(at, 'UPLOAD')).toEqual({ ok: true });
    expect(canTransition(at, 'GOAL')).toEqual({ ok: true });
  });
});

describe('prerequisites', () => {
  it('will not extract without a stored CV', () => {
    expect(canTransition(context({ stage: 'UPLOAD' }), 'EXTRACTION')).toEqual({
      ok: false,
      reason: 'stored_cv_required',
    });
    expect(canTransition(context({ stage: 'UPLOAD', storedCvId: 's1' }), 'EXTRACTION')).toEqual({
      ok: true,
    });
  });

  it('will not set a career direction without a profile to set it on', () => {
    const at = context({ stage: 'PROFILE_SELECTION', storedCvId: 's1', extractionId: 'e1' });
    expect(canTransition(at, 'CAREER_DIRECTION')).toEqual({ ok: false, reason: 'profile_required' });
  });

  it('will not open import review without an extraction and a session', () => {
    const withProfile = context({
      stage: 'CAREER_DIRECTION',
      selectedProfileId: 'p1',
      storedCvId: 's1',
    });
    expect(canTransition(withProfile, 'IMPORT_REVIEW')).toEqual({
      ok: false,
      reason: 'extraction_required',
    });
    expect(canTransition({ ...withProfile, extractionId: 'e1' }, 'IMPORT_REVIEW')).toEqual({
      ok: false,
      reason: 'import_session_required',
    });
    expect(
      canTransition({ ...withProfile, extractionId: 'e1', importSessionId: 'i1' }, 'IMPORT_REVIEW')
    ).toEqual({ ok: true });
  });

  it('will not complete without a first value', () => {
    const at = context({ stage: 'FIRST_ACTION', selectedProfileId: 'p1' });
    expect(canTransition(at, 'COMPLETE')).toEqual({ ok: false, reason: 'first_value_required' });
    expect(canTransition({ ...at, firstValueCompletedAt: new Date() }, 'COMPLETE')).toEqual({
      ok: true,
    });
  });
});

describe('finished journeys', () => {
  it('rejects every move once completed or dismissed', () => {
    for (const status of ['COMPLETED', 'DISMISSED'] as const) {
      expect(canTransition(context({ status, stage: 'GOAL' }), 'CV_SOURCE')).toEqual({
        ok: false,
        reason: 'already_finished',
      });
    }
  });
});

describe('manual path', () => {
  it('lets a user leave the upload path for manual entry without changing goal', () => {
    // Mid-upload, on a CV goal, choosing to type it in instead.
    const at = context({ stage: 'UPLOAD' });
    expect(canTransition(at, 'PROFILE_SELECTION', { manualPath: true })).toEqual({ ok: true });
  });

  it('still enforces prerequisites on the manual path', () => {
    const at = context({ stage: 'PROFILE_SELECTION' });
    expect(canTransition(at, 'CAREER_DIRECTION', { manualPath: true })).toEqual({
      ok: false,
      reason: 'profile_required',
    });
  });
});

describe('next stage', () => {
  it('walks the path and stops at the end', () => {
    expect(nextStage(context({ stage: 'GOAL' }))).toBe('CV_SOURCE');
    expect(nextStage(context({ stage: 'COMPLETE' }))).toBeNull();
  });
});

describe('onboarding progress', () => {
  it('measures journey stages, not profile completeness', () => {
    // The regression this guards: opening the second screen used to be reported
    // as "Profile 40% complete" for a profile with nothing in it.
    const early = onboardingProgress(context({ stage: 'CV_SOURCE' }));
    expect(early.stageIndex).toBe(1);
    expect(early.totalStages).toBe(9);
    expect(early.percentage).toBeLessThan(20);
  });

  it('reaches 100% only at the end of the journey', () => {
    expect(onboardingProgress(context({ stage: 'COMPLETE' })).percentage).toBe(100);
  });

  it('scales to the shorter no-CV path', () => {
    const progress = onboardingProgress(context({ goal: 'NO_CV', stage: 'CAREER_DIRECTION' }));
    expect(progress.totalStages).toBe(4);
    expect(progress.stageIndex).toBe(2);
  });
});

describe('a first value must be the thing the user came for', () => {
  it('does not let a filled-in profile end a journey that exists to check a CV', () => {
    // The regression this guards: confirming imported CV details part-way
    // through CHECK_CV made the profile usable, which was recorded as a first
    // value, which marked onboarding COMPLETE at stage 6 of 9 — so the user was
    // redirected to the dashboard having never been offered the ATS check.
    expect(firstValueSatisfiesGoal('CHECK_CV', 'PROFILE_CREATED')).toBe(false);
    expect(firstValueSatisfiesGoal('MATCH_JOB', 'PROFILE_CREATED')).toBe(false);
    // Six stages in, with two still to go — the machine already said as much.
    expect(stagesFor('CHECK_CV').indexOf('IMPORT_REVIEW')).toBe(6);
    expect(stagesFor('CHECK_CV')).toContain('FIRST_ACTION');
  });

  it('does let it end a journey that exists to build one', () => {
    expect(firstValueSatisfiesGoal('BUILD_PROFILE', 'PROFILE_CREATED')).toBe(true);
    expect(firstValueSatisfiesGoal('NO_CV', 'PROFILE_CREATED')).toBe(true);
    // Nothing was promised, so nothing is cut short.
    expect(firstValueSatisfiesGoal(null, 'PROFILE_CREATED')).toBe(true);
  });

  it('treats an analysis result as an outcome under every goal', () => {
    for (const goal of ['CHECK_CV', 'MATCH_JOB', 'BUILD_PROFILE', 'NO_CV'] as const) {
      expect(firstValueSatisfiesGoal(goal, 'DETERMINISTIC_ATS')).toBe(true);
      expect(firstValueSatisfiesGoal(goal, 'AI_ATS')).toBe(true);
      expect(firstValueSatisfiesGoal(goal, 'JOB_MATCH')).toBe(true);
    }
  });
});
