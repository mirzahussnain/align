import type { ProfileData } from './load-profile';

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
    profile.projects.length > 0,
    profile.education.length > 0,
    profile.skills.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** True only when every completeness check passes (100%). */
export function isProfileComplete(profile: ProfileData): boolean {
  return profileCompleteness(profile) === 100;
}
