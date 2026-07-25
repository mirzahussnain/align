import { prisma } from '@/shared/lib/prisma';
import { APIError } from '@/shared/utils/api-error';
import {
  getPlanEntitlement,
  normalizePlanId,
  PLAN_ENTITLEMENTS,
  PRODUCT_CAPABILITIES,
  type CapabilityDecision,
  type CapabilityEntitlement,
  type EntitlementPeriod,
  type PlanId,
  type ProductCapability,
} from './registry';
import { checkQuota, recordUsage, type MeteredAction } from '@/shared/services/usage-meter';
import { entitlementsFor } from '@/shared/lib/entitlements';

const LEGACY_METER: Partial<Record<ProductCapability, MeteredAction>> = {
  ai_enhanced_ats_analysis: 'aiAnalyses',
  job_match_analysis: 'aiAnalyses',
  profile_reconciliation: 'profileReasoning',
  cv_regeneration: 'cvGenerations',
};

export interface EntitlementSnapshot {
  plan: PlanId;
  capabilities: Record<ProductCapability, CapabilityDecision>;
}

export interface EntitlementErrorBody extends Record<string, unknown> {
  code: 'ENTITLEMENT_REQUIRED';
  capability: ProductCapability;
  reason: CapabilityDecision['reason'];
  plan: PlanId;
  upgradeTarget?: PlanId;
  limit?: number;
  used?: number;
  remaining?: number;
  period?: EntitlementPeriod;
  accessLevel?: string;
}

export function entitlementErrorBody(decision: CapabilityDecision): EntitlementErrorBody {
  return {
    code: 'ENTITLEMENT_REQUIRED',
    capability: decision.capability,
    reason: decision.reason,
    plan: decision.plan,
    ...(decision.upgradeTarget ? { upgradeTarget: decision.upgradeTarget } : {}),
    ...(decision.limit !== undefined ? { limit: decision.limit } : {}),
    ...(decision.used !== undefined ? { used: decision.used } : {}),
    ...(decision.remaining !== undefined ? { remaining: decision.remaining } : {}),
    ...(decision.period ? { period: decision.period } : {}),
    ...(decision.accessLevel ? { accessLevel: decision.accessLevel } : {}),
  };
}

export class EntitlementRequiredError extends APIError {
  readonly decision: CapabilityDecision;

  constructor(decision: CapabilityDecision) {
    super(
      'This capability is not available on your current plan.',
      decision.reason === 'quota_exhausted' ? 429 : 403,
      entitlementErrorBody(decision)
    );
    this.name = 'EntitlementRequiredError';
    this.decision = decision;
  }
}

export async function getUserPlan(userId: string): Promise<PlanId> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    return normalizePlanId(user?.subscriptionTier);
  } catch (error) {
    console.warn('[entitlements] Failed to resolve user plan; defaulting to FREE:', error instanceof Error ? error.message : error);
    return 'FREE';
  }
}

function upgradeTargetFor(
  plan: PlanId,
  capability: ProductCapability,
  entitlement: CapabilityEntitlement
): PlanId | undefined {
  if (plan === 'PRO') return undefined;
  const pro = PLAN_ENTITLEMENTS.PRO[capability];
  if (entitlement.mode === 'disabled' && pro.mode === 'disabled') return undefined;
  return 'PRO';
}

async function countProfileEvidence(userId: string): Promise<number> {
  const profiles = await prisma.profile.findMany({ where: { userId }, select: { id: true } });
  const profileIds = profiles.map(({ id }) => id);
  if (profileIds.length === 0) return 0;
  const where = { profileId: { in: profileIds } };
  const counts = await Promise.all([
    prisma.experience.count({ where }),
    prisma.projectEntry.count({ where }),
    prisma.education.count({ where }),
    prisma.skill.count({ where }),
    prisma.certification.count({ where }),
    prisma.training.count({ where }),
    prisma.licence.count({ where }),
    prisma.professionalRegistration.count({ where }),
    prisma.language.count({ where }),
    prisma.volunteering.count({ where }),
    prisma.otherEvidence.count({ where }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

export async function getCapabilityUsage(
  userId: string,
  capability: ProductCapability,
  plan?: PlanId
): Promise<number> {
  const action = LEGACY_METER[capability];
  if (action) {
    const resolvedPlan = plan ?? (await getUserPlan(userId));
    const check = await checkQuota(userId, action, entitlementsFor(resolvedPlan));
    return check.used;
  }
  if (capability === 'human_evidence_capture') {
    try {
      return await prisma.capabilityUsageEvent.count({
        where: { userId, capability, period: periodKey('month') },
      });
    } catch (error) {
      console.warn('[entitlements] Failed to read capability usage:', error instanceof Error ? error.message : error);
    }
  }
  return 0;
}

export async function getResourceCount(userId: string, capability: ProductCapability): Promise<number> {
  if (capability === 'additional_career_profiles') {
    return prisma.profile.count({ where: { userId } });
  }
  if (capability === 'stored_generated_cvs') {
    return prisma.generatedCV.count({ where: { userId } });
  }
  if (capability === 'stored_analyses') {
    return prisma.analysis.count({ where: { userId } });
  }
  if (capability === 'profile_evidence_storage') return countProfileEvidence(userId);
  return 0;
}

async function decideForPlan(
  userId: string,
  plan: PlanId,
  capability: ProductCapability
): Promise<CapabilityDecision> {
  const entitlement = getPlanEntitlement(plan, capability);
  const base = { capability, plan, mode: entitlement.mode } as const;
  switch (entitlement.mode) {
    case 'enabled':
      return { ...base, allowed: true, reason: 'allowed' };
    case 'partial':
      return {
        ...base,
        allowed: true,
        accessLevel: entitlement.accessLevel,
        reason: 'allowed',
        ...(entitlement.accessLevel === 'full' ? {} : { upgradeTarget: upgradeTargetFor(plan, capability, entitlement) }),
      };
    case 'disabled': {
      const upgradeTarget = upgradeTargetFor(plan, capability, entitlement);
      return {
        ...base,
        allowed: false,
        reason: upgradeTarget ? 'plan_required' : 'feature_unavailable',
        ...(upgradeTarget ? { upgradeTarget } : {}),
      };
    }
    case 'quota': {
      const used = await getCapabilityUsage(userId, capability, plan);
      const remaining = Math.max(0, entitlement.limit - used);
      const allowed = remaining > 0;
      const upgradeTarget = allowed ? undefined : upgradeTargetFor(plan, capability, entitlement);
      return {
        ...base,
        allowed,
        limit: entitlement.limit,
        used,
        remaining,
        period: entitlement.period,
        reason: allowed ? 'quota_available' : 'quota_exhausted',
        ...(upgradeTarget ? { upgradeTarget } : {}),
      };
    }
    case 'resource_limit': {
      const used = await getResourceCount(userId, capability);
      const remaining = Math.max(0, entitlement.limit - used);
      const allowed = remaining > 0;
      const upgradeTarget = allowed ? undefined : upgradeTargetFor(plan, capability, entitlement);
      return {
        ...base,
        allowed,
        limit: entitlement.limit,
        used,
        remaining,
        reason: allowed ? 'allowed' : 'resource_limit_reached',
        ...(upgradeTarget ? { upgradeTarget } : {}),
      };
    }
  }
}

export async function getEntitlement(userId: string, capability: ProductCapability): Promise<CapabilityDecision> {
  return decideForPlan(userId, await getUserPlan(userId), capability);
}

export const checkCapability = getEntitlement;

export async function assertCapability(userId: string, capability: ProductCapability): Promise<CapabilityDecision> {
  const decision = await getEntitlement(userId, capability);
  if (!decision.allowed) throw new EntitlementRequiredError(decision);
  return decision;
}

export function periodKey(period: EntitlementPeriod, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  if (period === 'lifetime') return 'lifetime';
  if (period === 'month') return `${year}-${month}`;
  if (period === 'day') return `${year}-${month}-${day}`;
  const date = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - first.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Consume after success. The unique operation key makes retries a no-op. */
export async function consumeCapability(
  userId: string,
  capability: ProductCapability,
  operationId: string,
  now = new Date()
): Promise<boolean> {
  const plan = await getUserPlan(userId);
  const entitlement = getPlanEntitlement(plan, capability);
  if (entitlement.mode !== 'quota') return false;
  try {
    await prisma.capabilityUsageEvent.create({
      data: { userId, capability, period: periodKey(entitlement.period, now), operationId },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return false;
    // Keep the established aggregate counter available while this ledger is deployed.
    console.warn('[entitlements] Failed to record idempotency event:', error instanceof Error ? error.message : error);
  }
  const action = LEGACY_METER[capability];
  if (action) await recordUsage(userId, action);
  return true;
}

export async function getEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot> {
  const plan = await getUserPlan(userId);
  const entries = await Promise.all(PRODUCT_CAPABILITIES.map(async (capability) => [capability, await decideForPlan(userId, plan, capability)] as const));
  return { plan, capabilities: Object.fromEntries(entries) as EntitlementSnapshot['capabilities'] };
}
