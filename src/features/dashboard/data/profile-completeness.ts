import type { ProfileData } from './load-profile';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import type { SectionPresence } from '@/shared/occupations/types';

/**
 * One thing a profile is checked for. Deliberately NOT called a "section":
 * three of these are scalar fields, not content sections, and the ones that
 * *are* sections use the profile-table vocabulary (`skills`, `projects`)
 * rather than the CV-heading vocabulary (`core-skills`, `key-projects`).
 * `CHECK_TO_CV_SECTION` maps between the two.
 */
export type CompletenessCheckId =
  | 'full-name'
  | 'career-direction'
  | 'professional-summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects';

/**
 * Completeness check to the CV section heading it produces, for the checks
 * that render as a section at all. Values are keys of SECTION_HEADINGS_MAP
 * (src/shared/constants/scoring-config.ts) — the same ids occupation profiles
 * use in `sections.rules`.
 */
export const CHECK_TO_CV_SECTION: Partial<Record<CompletenessCheckId, string>> = {
  'professional-summary': 'professional-summary',
  experience: 'professional-experience',
  education: 'education',
  skills: 'core-skills',
  projects: 'key-projects',
};

/**
 * The minimum a caller must know to compute completeness.
 *
 * Counts rather than arrays so `listProfiles()` can answer from Prisma
 * `_count` aggregates without loading every track's full content, and the
 * onboarding wizard can answer from its own per-step state. Both project into
 * this shape; neither re-implements the checks.
 */
export interface CompletenessInput {
  /** OccupationId, or '' when unset. */
  targetOccupation: string;
  fullName: boolean;
  /**
   * Whether the track states what it is FOR — its target role title.
   *
   * A Career Profile is a career track, and a track with no direction cannot be
   * meaningfully scored, matched or rewritten against anything: it is the one
   * field that distinguishes "Warehouse Operative" from an untitled bag of
   * history. `targetOccupation` remains optional and is deliberately not a
   * check — it is an internal classification lens the user need never see.
   */
  careerDirection: boolean;
  professionalSummary: boolean;
  experience: number;
  education: number;
  skills: number;
  projects: number;
}

export interface ProfileCompletenessResult {
  percentage: number;
  /** The checks that apply to this occupation — the denominator. */
  relevantChecks: CompletenessCheckId[];
  completedChecks: CompletenessCheckId[];
  missingChecks: CompletenessCheckId[];
}

/**
 * How strongly this occupation expects a projects section. Unknown or unset
 * occupations fall back to `optional`, matching the generic profile: before a
 * user has chosen an occupation there are no grounds to hide anything.
 */
export function projectsPresenceFor(targetOccupation: string): SectionPresence {
  if (!isKnownOccupation(targetOccupation)) return 'optional';
  const rule = getOccupationProfile(targetOccupation).sections.rules.find(
    (r) => r.section === 'key-projects'
  );
  return rule?.presence ?? 'optional';
}

/**
 * Whether a projects section is genuinely expected for an occupation — i.e.
 * whether its absence should count against completeness. A warehouse operative
 * or nurse must be able to reach 100% (and generate a CV from their profile)
 * without inventing a projects section.
 */
export function projectsExpectedFor(targetOccupation: string): boolean {
  const presence = projectsPresenceFor(targetOccupation);
  return presence === 'required' || presence === 'expected';
}

/**
 * Whether to show the projects step/section at all.
 *
 * Distinct from `projectsExpectedFor`: `optional` occupations (and users who
 * have not picked one yet) still get the section, they just aren't marked
 * incomplete for leaving it empty.
 *
 * The `existingProjectCount` escape hatch prevents orphaned data. A software
 * engineer who fills in three projects and then retargets as a nurse would
 * otherwise keep rows that are invisible in the UI but still reachable by CV
 * generation — undeletable and unexplained. Where rows exist the section stays
 * visible regardless of what the occupation expects.
 */
export function projectsSectionVisible(
  targetOccupation: string,
  existingProjectCount: number
): boolean {
  return projectsPresenceFor(targetOccupation) !== 'irrelevant' || existingProjectCount > 0;
}

/**
 * The single completeness calculation. Every surface that reports a percentage
 * — dashboard, profile switcher, onboarding wizard — routes through here, so a
 * nurse can never be 100% complete on one screen and 83% on another.
 */
export function evaluateProfileCompleteness(
  input: CompletenessInput
): ProfileCompletenessResult {
  const checks: [CompletenessCheckId, boolean][] = [
    ['full-name', input.fullName],
    ['career-direction', input.careerDirection],
    ['professional-summary', input.professionalSummary],
    // The CV evaluation type (targetOccupation) is NOT a completeness check.
    // It is optional: a missing one resolves safely through the classifier and
    // the Generic fallback, and the target ROLE remains the required
    // career-direction field. It still gates the projects check below, since it
    // decides whether a projects section is even expected.
    ['experience', input.experience > 0],
    ['education', input.education > 0],
    ['skills', input.skills > 0],
  ];

  // Projects only count against completeness where the occupation actually
  // expects them (e.g. software engineers) — never for operatives or nurses.
  if (projectsExpectedFor(input.targetOccupation)) {
    checks.push(['projects', input.projects > 0]);
  }

  const relevantChecks = checks.map(([id]) => id);
  const completedChecks = checks.filter(([, done]) => done).map(([id]) => id);
  const missingChecks = checks.filter(([, done]) => !done).map(([id]) => id);

  return {
    percentage: Math.round((completedChecks.length / relevantChecks.length) * 100),
    relevantChecks,
    completedChecks,
    missingChecks,
  };
}

/**
 * Project per-section "has content" flags into the shape the calculation
 * needs. This is the onboarding wizard's view of the world: it tracks whether
 * each step was filled, not how many rows it holds. Shared rather than inlined
 * so the wizard and the dashboard demonstrably agree.
 */
export function toCompletenessInputFromFlags(flags: {
  targetOccupation: string;
  fullName: boolean;
  careerDirection: boolean;
  professionalSummary: boolean;
  experience: boolean;
  education: boolean;
  skills: boolean;
  projects: boolean;
}): CompletenessInput {
  return {
    targetOccupation: flags.targetOccupation,
    fullName: flags.fullName,
    careerDirection: flags.careerDirection,
    professionalSummary: flags.professionalSummary,
    experience: flags.experience ? 1 : 0,
    education: flags.education ? 1 : 0,
    skills: flags.skills ? 1 : 0,
    projects: flags.projects ? 1 : 0,
  };
}

/** Project a fully loaded profile into the shape the calculation needs. */
export function toCompletenessInput(profile: ProfileData): CompletenessInput {
  return {
    targetOccupation: profile.personal.targetOccupation,
    fullName: Boolean(profile.personal.fullName),
    careerDirection: Boolean(profile.personal.targetRoleTitle.trim()),
    professionalSummary: Boolean(profile.personal.professionalSummary),
    experience: profile.experience.length,
    education: profile.education.length,
    skills: profile.skills.length,
    projects: profile.projects.length,
  };
}

/**
 * The sections that make a profile "complete" enough to rebuild a CV from
 * with no analysis or upload. Kept in its own Prisma-free module so client
 * components (the dashboard views) can share it with the server-side generate
 * route without dragging the `pg` adapter into the browser bundle.
 */
export function profileCompleteness(profile: ProfileData): number {
  return evaluateProfileCompleteness(toCompletenessInput(profile)).percentage;
}

/** True only when every completeness check passes (100%). */
export function isProfileComplete(profile: ProfileData): boolean {
  return profileCompleteness(profile) === 100;
}
