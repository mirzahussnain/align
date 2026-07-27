import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { toCompletenessInput } from '@/features/dashboard/data/profile-completeness';
import { evaluateProfileReadiness } from '@/features/dashboard/data/profile-readiness';
import { recordFirstValueIfOnboarding } from './state';

/**
 * "A usable Career Profile was created" as a first value.
 *
 * This is the outcome for users who have no CV to upload, and it is judged from
 * the profile's actual content rather than from finishing a form: a wizard the
 * user clicked through while skipping every step has not produced anything
 * useful, and telling them it has is how the old flow ended up congratulating
 * people on empty profiles.
 *
 * Best-effort and idempotent, like every first-value record — a user who already
 * reached one keeps it. Whether a usable profile actually FINISHES onboarding is
 * decided downstream by the user's goal: it does for someone who came to build a
 * profile, and does not for someone who came to check their CV and still has the
 * check ahead of them.
 *
 * The boolean says the profile is ready, not that onboarding ended.
 */
export async function recordProfileFirstValue(userId: string, profileId: string): Promise<boolean> {
  try {
    const profile = await loadOwnedProfileData(userId, profileId);
    if (!profile) return false;

    const readiness = evaluateProfileReadiness(toCompletenessInput(profile));
    if (readiness.lifecycle !== 'READY') return false;

    await recordFirstValueIfOnboarding({
      userId,
      firstValueType: 'PROFILE_CREATED',
      firstValueRef: profile.profileId,
    });
    return true;
  } catch (error) {
    console.warn(
      '[onboarding] Could not evaluate profile first value:',
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
