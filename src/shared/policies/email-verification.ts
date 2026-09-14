import type { ProductCapability } from '@/shared/entitlements/registry';

export const VERIFIED_EMAIL_CAPABILITIES = new Set<ProductCapability>([
  'ai_enhanced_ats_analysis',
  'job_match_analysis',
  'profile_reconciliation',
  'cv_import_reconciliation',
  'tailored_cv_generation',
  'cv_regeneration',
  'human_evidence_capture',
]);

export function requiresVerifiedEmail(capability: ProductCapability): boolean {
  return VERIFIED_EMAIL_CAPABILITIES.has(capability);
}
