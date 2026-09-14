import type { Classification } from '@/shared/types/classification';
import type { CredentialRule, OccupationProfile } from './types';

/**
 * The credential rules that actually apply to a given classification.
 *
 * `appliesWhen` is how a profile says "this credential gates the regulated
 * role, not its unregulated neighbours" — NMC registration is mandatory for a
 * registered nurse and meaningless for a healthcare assistant. A caller that
 * reads `profile.credentials` directly silently ignores that gate and demands
 * credentials the candidate cannot hold, so both the deterministic scorer and
 * the AI prompt route through here rather than filtering their own way.
 */
export function applicableCredentials(
  profile: OccupationProfile,
  classification: Classification
): CredentialRule[] {
  return profile.credentials.filter(
    (rule) => !rule.appliesWhen || rule.appliesWhen(classification)
  );
}
