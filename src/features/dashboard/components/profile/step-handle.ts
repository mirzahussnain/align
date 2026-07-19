/**
 * Imperative handle the profile section forms expose when embedded in the
 * onboarding wizard. The wizard holds a ref to the active step and calls
 * `save()` on "Continue" so there's a single button instead of the form's own
 * "Save changes" plus a wizard "Next".
 */
export interface ProfileStepHandle {
  save: () => Promise<void>;
}
