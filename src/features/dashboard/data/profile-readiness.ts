import {
  evaluateProfileCompleteness,
  type CompletenessCheckId,
  type CompletenessInput,
} from './profile-completeness';

/**
 * Career Profile lifecycle, DERIVED from confirmed data rather than stored.
 *
 * A stored `status` column would be a second opinion about something the data
 * already answers, and the two would drift the moment a user deleted their last
 * job or an import added one: a profile marked READY with nothing in it is worse
 * than no marker at all. Deriving it means the answer is always current and
 * there is nothing to migrate or repair.
 */
export type ProfileLifecycle = 'DRAFT' | 'READY';

/**
 * What a DRAFT profile needs before it can be persisted at all.
 *
 * Almost nothing, on purpose. A draft exists so an import or a manual flow has
 * somewhere to put things; demanding a complete profile before one can be
 * created is what forced the old wizard to make six fields mandatory on the
 * first screen. Ownership is the only real requirement, and the database
 * supplies a default label.
 */
export const DRAFT_PROFILE_REQUIREMENTS: readonly CompletenessCheckId[] = [];

/**
 * What makes a profile READY: it says who the person is, what track it is for,
 * and has at least one piece of substantive history.
 *
 * Deliberately weaker than 100% completeness. A warehouse operative with a name,
 * a target role and three jobs has a usable profile even with no education rows
 * and no summary — holding "ready" to mean "every check passes" would keep
 * perfectly good profiles out of CV generation for want of an optional section.
 */
export const READY_PROFILE_REQUIREMENTS: readonly CompletenessCheckId[] = [
  'full-name',
  'career-direction',
];

export interface ProfileReadiness {
  lifecycle: ProfileLifecycle;
  completeness: number;
  /** Checks still outstanding, for "what's missing" messaging. */
  missing: CompletenessCheckId[];
  /** Ready-state requirements not yet met — the blockers, not every gap. */
  blocking: CompletenessCheckId[];
  /** True when the profile holds at least one substantive history record. */
  hasSubstantiveContent: boolean;
}

/**
 * Assess a profile's lifecycle and what stands between it and READY.
 *
 * `blocking` is intentionally separate from `missing`: the UI can tell a user
 * "add a target role to use this profile" without also nagging them about an
 * optional professional summary, which is the difference between guidance and
 * a checklist nobody finishes.
 */
export function evaluateProfileReadiness(input: CompletenessInput): ProfileReadiness {
  const { percentage, missingChecks } = evaluateProfileCompleteness(input);
  const hasSubstantiveContent =
    input.experience > 0 || input.education > 0 || input.skills > 0 || input.projects > 0;

  const blocking = READY_PROFILE_REQUIREMENTS.filter((check) => missingChecks.includes(check));
  const lifecycle: ProfileLifecycle =
    blocking.length === 0 && hasSubstantiveContent ? 'READY' : 'DRAFT';

  return { lifecycle, completeness: percentage, missing: missingChecks, blocking, hasSubstantiveContent };
}

/**
 * Which actions a profile can currently support.
 *
 * Answers the "explain which missing fields affect which actions" requirement
 * directly, and keeps the answer in one place so the dashboard, the onboarding
 * flow and the generation wizard cannot disagree about whether a profile is
 * usable.
 *
 * Deterministic ATS is absent on purpose: it scores an uploaded CV, not a
 * profile, so it needs nothing from here at all.
 */
export interface ProfileActionAvailability {
  /** Job match files its result against a profile and needs a real target. */
  jobMatch: { available: boolean; missing: CompletenessCheckId[] };
  /** Generating a CV from the profile needs content to write about. */
  cvGeneration: { available: boolean; missing: CompletenessCheckId[] };
}

export function profileActionAvailability(input: CompletenessInput): ProfileActionAvailability {
  const readiness = evaluateProfileReadiness(input);
  const cvGenerationMissing = [
    ...readiness.blocking,
    ...(readiness.hasSubstantiveContent ? [] : (['experience'] as CompletenessCheckId[])),
  ];
  return {
    jobMatch: {
      available: readiness.blocking.length === 0,
      missing: readiness.blocking,
    },
    cvGeneration: {
      available: cvGenerationMissing.length === 0,
      missing: cvGenerationMissing,
    },
  };
}

/** Human labels for the checks, for "what's missing" lists. */
export const CHECK_LABELS: Record<CompletenessCheckId, string> = {
  'full-name': 'Your name',
  'career-direction': 'Target role',
  'professional-summary': 'Professional summary',
  experience: 'Work experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
};
