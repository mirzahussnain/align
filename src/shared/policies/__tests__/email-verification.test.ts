import { describe, expect, it } from 'vitest';
import { requiresVerifiedEmail } from '@/shared/policies';

describe('email verification policy', () => {
  it('keeps deterministic ATS analysis available before verification', () => {
    expect(requiresVerifiedEmail('ats_analysis')).toBe(false);
  });

  it.each([
    'ai_enhanced_ats_analysis',
    'job_match_analysis',
    'profile_reconciliation',
    'cv_import_reconciliation',
    'tailored_cv_generation',
    'cv_regeneration',
    'human_evidence_capture',
  ] as const)('requires verification for provider-backed capability %s', (capability) => {
    expect(requiresVerifiedEmail(capability)).toBe(true);
  });

  it('does not gate non-provider account capabilities', () => {
    expect(requiresVerifiedEmail('career_profile')).toBe(false);
    expect(requiresVerifiedEmail('stored_source_cvs')).toBe(false);
  });
});
