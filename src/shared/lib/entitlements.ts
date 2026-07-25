/**
 * Compatibility projection for storage and the legacy aggregate usage meter.
 * Product policy itself lives in shared/entitlements/registry.ts.
 */
import {
  getPlanEntitlement,
  normalizePlanId,
  type PlanId,
} from '@/shared/entitlements/registry';

export type Tier = 'free' | 'pro';

export interface Entitlements {
  tier: Tier;
  billedTier: Tier;
  maxProfiles: number;
  maxStoredCvs: number;
  maxStoredAnalyses: number;
  sourceRetentionDays: number | null;
  profileReasoning: boolean;
  monthlyLimits: {
    aiAnalyses: number | null;
    cvGenerations: number | null;
    profileReasoning: number | null;
  };
}

function numericLimit(plan: PlanId, capability: Parameters<typeof getPlanEntitlement>[1]): number | null {
  const entitlement = getPlanEntitlement(plan, capability);
  return entitlement.mode === 'quota' || entitlement.mode === 'resource_limit'
    ? entitlement.limit
    : null;
}

function project(plan: PlanId): Omit<Entitlements, 'tier' | 'billedTier'> {
  const retention = getPlanEntitlement(plan, 'source_file_retention');
  const retained = retention.mode === 'partial' ? Number.parseInt(retention.accessLevel, 10) : NaN;
  const storedAnalyses = getPlanEntitlement(plan, 'stored_analyses');
  return {
    maxProfiles: numericLimit(plan, 'additional_career_profiles') ?? 1,
    maxStoredCvs: numericLimit(plan, 'stored_generated_cvs') ?? Infinity,
    maxStoredAnalyses:
      storedAnalyses.mode === 'resource_limit' ? storedAnalyses.limit : Infinity,
    sourceRetentionDays: Number.isFinite(retained) ? retained : null,
    profileReasoning: getPlanEntitlement(plan, 'profile_reconciliation').mode !== 'disabled',
    monthlyLimits: {
      aiAnalyses: numericLimit(plan, 'ai_enhanced_ats_analysis'),
      cvGenerations: numericLimit(plan, 'cv_regeneration'),
      profileReasoning: numericLimit(plan, 'profile_reconciliation'),
    },
  };
}

/** Unknown or absent stored values safely resolve to FREE. */
export function entitlementsFor(subscriptionTier: string | null | undefined): Entitlements {
  const plan = normalizePlanId(subscriptionTier);
  const tier: Tier = plan === 'PRO' ? 'pro' : 'free';
  return { tier, billedTier: tier, ...project(plan) };
}

export function limitsForTier(tier: Tier): Omit<Entitlements, 'tier' | 'billedTier'> {
  return project(tier === 'pro' ? 'PRO' : 'FREE');
}

export const MAX_PROFILES_CEILING = Math.max(
  numericLimit('FREE', 'additional_career_profiles') ?? 0,
  numericLimit('PRO', 'additional_career_profiles') ?? 0
);

export function sourceExpiryFrom(entitlements: Entitlements, now = new Date()): Date | null {
  if (entitlements.sourceRetentionDays === null) return null;
  return new Date(now.getTime() + entitlements.sourceRetentionDays * 24 * 60 * 60 * 1000);
}
