export type ProfileFieldOption = { value: string; label: string };
export const LANGUAGE_PROFICIENCY_OPTIONS = [
  { value: 'beginner', label: 'Beginner' }, { value: 'elementary', label: 'Elementary proficiency' }, { value: 'limited_working', label: 'Limited working proficiency' }, { value: 'professional_working', label: 'Professional working proficiency' }, { value: 'full_professional', label: 'Full professional proficiency' }, { value: 'native_bilingual', label: 'Native / Bilingual' },
] as const satisfies readonly ProfileFieldOption[];
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCY_OPTIONS)[number]['value'];
export const CERTIFICATION_STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'in_progress', label: 'In progress' }, { value: 'no_expiry', label: 'No expiry' }, { value: 'unknown', label: 'Unknown' }] as const satisfies readonly ProfileFieldOption[];
export const TRAINING_STATUS_OPTIONS = [{ value: 'completed', label: 'Completed' }, { value: 'in_progress', label: 'In progress' }] as const satisfies readonly ProfileFieldOption[];
export const LICENCE_STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'suspended', label: 'Suspended' }, { value: 'pending', label: 'Pending' }, { value: 'unknown', label: 'Unknown' }] as const satisfies readonly ProfileFieldOption[];
export const REGISTRATION_STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'expired', label: 'Expired' }, { value: 'suspended', label: 'Suspended' }, { value: 'pending', label: 'Pending' }, { value: 'unknown', label: 'Unknown' }] as const satisfies readonly ProfileFieldOption[];
export const VERIFICATION_STATUS_OPTIONS = [{ value: 'user_confirmed_unverified', label: 'User-confirmed, unverified' }, { value: 'verified', label: 'Verified' }] as const satisfies readonly ProfileFieldOption[];

/**
 * Map a stored controlled value to its human-readable label, shared by every
 * evidence formatter so a raw code (`native_bilingual`) never reaches a CV,
 * prompt, evidence selector, or provenance snapshot. Empty/unset stays empty.
 */
function labelLookup(options: readonly ProfileFieldOption[]) {
  const byValue = new Map(options.map((option) => [option.value, option.label] as const));
  return (value: string | null | undefined): string => (value ? byValue.get(value) ?? value : '');
}
export const languageProficiencyLabel = labelLookup(LANGUAGE_PROFICIENCY_OPTIONS);
export const certificationStatusLabel = labelLookup(CERTIFICATION_STATUS_OPTIONS);
export const trainingStatusLabel = labelLookup(TRAINING_STATUS_OPTIONS);
export const licenceStatusLabel = labelLookup(LICENCE_STATUS_OPTIONS);
export const registrationStatusLabel = labelLookup(REGISTRATION_STATUS_OPTIONS);
export const verificationStatusLabel = labelLookup(VERIFICATION_STATUS_OPTIONS);

/** Human label for any controlled value drawn from a known option set; leaves unknown/empty untouched. */
export function optionLabel(options: readonly ProfileFieldOption[], value: string | null | undefined): string {
  return labelLookup(options)(value);
}