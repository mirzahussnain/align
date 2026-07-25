import { checkCapability } from '@/shared/entitlements/server';

/** Compatibility adapter backed by the authoritative entitlement service. */
export interface EvidenceCapabilityProvider {
  canCreateProfileEvidence(userId: string): Promise<boolean>;
  canApproveEvidence(userId: string): Promise<boolean>;
  canReuseEvidence(userId: string): Promise<boolean>;
}

export const evidenceCapabilities: EvidenceCapabilityProvider = {
  async canCreateProfileEvidence(userId) {
    return (await checkCapability(userId, 'profile_evidence_storage')).allowed;
  },
  async canApproveEvidence(userId) {
    return (await checkCapability(userId, 'approve_evidence_for_application')).allowed;
  },
  async canReuseEvidence(userId) {
    return (await checkCapability(userId, 'reuse_evidence_across_applications')).allowed;
  },
};
