import type { ProfileData } from './load-profile';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';

/**
 * Whether a projects section is genuinely expected for an occupation. A
 * warehouse operative or nurse must be able to reach 100% (and generate a CV
 * from their profile) without inventing a projects section — the occupation
 * profile marks it irrelevant/optional for them.
 */
export function projectsExpectedFor(targetOccupation: string): boolean {
  if (!isKnownOccupation(targetOccupation)) return false;
  const rule = getOccupationProfile(targetOccupation).sections.rules.find(
    (r) => r.section === 'key-projects'
  );
  return rule?.presence === 'required' || rule?.presence === 'expected';
}

/**
 * The sections that make a profile "complete" enough to rebuild a CV from
 * with no analysis or upload. Kept in its own Prisma-free module so client
 * components (the dashboard views) can share it with the server-side generate
 * route without dragging the `pg` adapter into the browser bundle.
 *
 * Must stay in sync with the count-based mirror in load-profile.ts
 * `listProfiles()`.
 */
export function profileCompleteness(profile: ProfileData): number {
  const checks = [
    Boolean(profile.personal.fullName),
    Boolean(profile.personal.professionalSummary),
    // The target occupation selects which evaluation profile scores this
    // track — without it every analysis falls back to generic rules.
    Boolean(profile.personal.targetOccupation),
    profile.experience.length > 0,
    profile.education.length > 0,
    profile.skills.length > 0,
    // Projects only count against completeness where the occupation actually
    // expects them (e.g. software engineers) — never for operatives or nurses.
    ...(projectsExpectedFor(profile.personal.targetOccupation) ? [profile.projects.length > 0] : []),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** True only when every completeness check passes (100%). */
export function isProfileComplete(profile: ProfileData): boolean {
  return profileCompleteness(profile) === 100;
}
