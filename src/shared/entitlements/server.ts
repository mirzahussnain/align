import { prisma } from '@/shared/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import { APIError } from '@/shared/utils/api-error';
import {
  getPlanEntitlement,
  periodKey,
  PLAN_ENTITLEMENTS,
  PRODUCT_CAPABILITIES,
  type CapabilityDecision,
  type CapabilityEntitlement,
  type EntitlementPeriod,
  type PlanId,
  type ProductCapability,
} from './registry';
import { countActiveUsage } from '@/shared/services/capability-reservation';
import { resolveBillingAccess } from '@/shared/billing/access';

// The reservation ledger is the authoritative usage store. `consumeCapability`
// (post-success charge) is re-exported from it so existing call sites keep their
// import path while the atomic lifecycle lives in one module.
export { consumeCapability } from '@/shared/services/capability-reservation';

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

/**
 * The user's effective product plan — obtained ONLY through the billing resolver
 * (§9). Provider status, raw price ids and the legacy `subscriptionTier` never
 * decide capability limits here; the resolver establishes access to a product
 * plan, and the entitlement registry alone maps that plan to limits.
 */
export async function getUserPlan(userId: string): Promise<PlanId> {
  try {
    const { effectivePlan } = await resolveBillingAccess(userId);
    return effectivePlan;
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

/** Any client that can count the reusable-evidence table (base or tx). */
type StoredEvidenceCountClient = Pick<Prisma.TransactionClient, 'otherEvidence'>;

/**
 * THE authoritative reusable-evidence count for `profile_evidence_storage`.
 *
 * Canonical Career Profile records — Experience, ProjectEntry, Education, Skill,
 * Certification, Training, Licence, ProfessionalRegistration, Language,
 * Volunteering — describe the user's career history. They are not commercial
 * evidence and must never consume this allowance merely by existing; adding one
 * education row or one skill is ordinary profile completion.
 *
 * `OtherEvidence` is the one reusable-evidence entity: a free-form claim,
 * achievement or supporting fact, which `validateStructuredEvidence` explicitly
 * refuses to accept career-history content into. Nothing else is counted —
 * not stored CVs, analyses, generated CVs, ProfileIdentity, application
 * approvals (`ApplicationEvidenceContext` / `ProfileEvidenceApproval`, which
 * have their own per-application limit), nor reconciliation output, which is
 * never persisted. Referencing one evidence record from several applications
 * still counts once, because only the record itself is counted.
 */
export async function countStoredEvidence(
  userId: string,
  client: StoredEvidenceCountClient = prisma
): Promise<number> {
  return client.otherEvidence.count({ where: { profile: { userId } } });
}

export async function getCapabilityUsage(
  userId: string,
  capability: ProductCapability,
  plan?: PlanId
): Promise<number> {
  const resolvedPlan = plan ?? (await getUserPlan(userId));
  const entitlement = getPlanEntitlement(resolvedPlan, capability);
  if (entitlement.mode !== 'quota') return 0;
  try {
    // Committed usage plus still-active reservations, per capability. Counting
    // reservations (not a shared aggregate column) keeps ai_enhanced_ats_analysis
    // and job_match_analysis on independent quotas, and reflects in-flight holds.
    return await countActiveUsage(prisma, userId, capability, periodKey(entitlement.period), new Date());
  } catch (error) {
    // A read failure must not hard-fail the request; under-reporting is the safe
    // direction here, matching the prior meter's lenient read behaviour.
    console.warn('[entitlements] Failed to read capability usage:', error instanceof Error ? error.message : error);
    return 0;
  }
}

export async function getResourceCount(userId: string, capability: ProductCapability): Promise<number> {
  if (capability === 'additional_career_profiles') {
    return prisma.profile.count({ where: { userId } });
  }
  if (capability === 'stored_source_cvs') {
    return countStoredSourceCvs(userId);
  }
  if (capability === 'stored_generated_cvs') {
    return prisma.generatedCV.count({ where: { userId } });
  }
  if (capability === 'stored_analyses') {
    const [ats, matches] = await Promise.all([
      prisma.atsAnalysis.count({ where: { userId } }),
      prisma.jobMatch.count({ where: { userId } }),
    ]);
    return ats + matches;
  }
  if (capability === 'saved_jobs') return prisma.savedJob.count({ where: { userId } });
  if (capability === 'profile_evidence_storage') return countStoredEvidence(userId);
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

// ── Reusable stored-evidence limit ───────────────────────────────────────────

const STORED_EVIDENCE_CAPABILITY: ProductCapability = 'profile_evidence_storage';

function storedEvidenceDecision(plan: PlanId, limit: number, used: number): CapabilityDecision {
  const remaining = Math.max(0, limit - used);
  const allowed = remaining > 0;
  return {
    capability: STORED_EVIDENCE_CAPABILITY,
    plan,
    mode: 'resource_limit',
    allowed,
    limit,
    used,
    remaining,
    reason: allowed ? 'allowed' : 'resource_limit_reached',
    ...(!allowed && plan === 'FREE' ? { upgradeTarget: 'PRO' as const } : {}),
  };
}

/**
 * Enforce the reusable stored-evidence limit before a NEW qualifying evidence
 * record is created. Call this INSIDE the transaction that creates the record:
 * it takes the same per-(user, capability) Postgres advisory lock the
 * reservation ledger uses, so two concurrent creations serialise here and the
 * count-then-create can never exceed the limit.
 *
 * This is a resource count, not a metered AI operation, so it deliberately does
 * not go through the reservation ledger — there is nothing to hold, release or
 * refund. Deleting a record frees a slot on the next count; editing one never
 * reaches this check, so users at (or above, after a downgrade) the limit keep
 * full edit and delete access.
 *
 * Only canonical evidence kinds that create an `OtherEvidence` row qualify;
 * ordinary Career Profile records must not call this.
 */
export async function assertStoredEvidenceLimit(
  userId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const plan = await getUserPlan(userId);
  const entitlement = getPlanEntitlement(plan, STORED_EVIDENCE_CAPABILITY);
  if (entitlement.mode !== 'resource_limit') return;
  // `hashtext` collisions only ever over-serialise unrelated pairs. Acquired
  // after any reservation lock the caller already holds, never before, so the
  // two lock orders cannot form a cycle.
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    userId,
    STORED_EVIDENCE_CAPABILITY
  );
  const used = await countStoredEvidence(userId, tx);
  const decision = storedEvidenceDecision(plan, entitlement.limit, used);
  if (!decision.allowed) throw new EntitlementRequiredError(decision);
}

// ── Stored source-CV limit ───────────────────────────────────────────────────

const STORED_SOURCE_CV_CAPABILITY: ProductCapability = 'stored_source_cvs';

/** Any client that can count the stored-CV table (base or tx). */
type StoredSourceCvCountClient = Pick<Prisma.TransactionClient, 'storedCv'>;

/**
 * THE authoritative count for `stored_source_cvs`: original uploaded CVs the
 * user still holds. Soft-deleted rows are excluded — deleting a stored CV frees
 * its slot immediately, while the row stays behind to carry the provenance of
 * anything already imported from it.
 *
 * Nothing else is counted here: generated CVs have `stored_generated_cvs`,
 * analyses have `stored_analyses`, and reusable evidence has its own allowance.
 */
export async function countStoredSourceCvs(
  userId: string,
  client: StoredSourceCvCountClient = prisma
): Promise<number> {
  return client.storedCv.count({ where: { userId, deletedAt: null } });
}

function storedSourceCvDecision(plan: PlanId, limit: number, used: number): CapabilityDecision {
  const remaining = Math.max(0, limit - used);
  const allowed = remaining > 0;
  return {
    capability: STORED_SOURCE_CV_CAPABILITY,
    plan,
    mode: 'resource_limit',
    allowed,
    limit,
    used,
    remaining,
    reason: allowed ? 'allowed' : 'resource_limit_reached',
    ...(!allowed && plan === 'FREE' ? { upgradeTarget: 'PRO' as const } : {}),
  };
}

/**
 * Enforce the stored source-CV limit before a NEW stored CV row is created. Call
 * this INSIDE the transaction that creates the row and BEFORE any bytes are sent
 * to object storage, so a user at their limit never starts a partial upload.
 *
 * Takes the same per-(user, capability) advisory lock the reservation ledger
 * uses, so two concurrent uploads serialise here and the count-then-create can
 * never exceed the limit. It is a resource count, not a metered AI operation, so
 * it deliberately does not go through the reservation ledger.
 *
 * A downgraded user above the limit keeps full read, re-import and delete access;
 * only creating another stored CV is blocked.
 */
export async function assertStoredSourceCvLimit(
  userId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const plan = await getUserPlan(userId);
  const entitlement = getPlanEntitlement(plan, STORED_SOURCE_CV_CAPABILITY);
  if (entitlement.mode !== 'resource_limit') return;
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    userId,
    STORED_SOURCE_CV_CAPABILITY
  );
  const used = await countStoredSourceCvs(userId, tx);
  const decision = storedSourceCvDecision(plan, entitlement.limit, used);
  if (!decision.allowed) throw new EntitlementRequiredError(decision);
}

// ── Per-application approval limit ───────────────────────────────────────────
//
// `approve_evidence_for_application` is a resource limit counted PER APPLICATION
// (per analysis), so it cannot use the generic global resource-limit path. The
// count of "approved evidence items for an application" is every active,
// application-scoped approval for that analysis: captured application evidence
// (ApplicationEvidenceContext) plus approved profile-evidence snapshots
// (ProfileEvidenceApproval). Withdrawing/deleting an approval removes its row and
// frees a slot; editing an approval never changes the count.

const APPROVAL_CAPABILITY: ProductCapability = 'approve_evidence_for_application';

/** Any client that can count the two application-approval tables (base or tx). */
type ApprovalCountClient = Pick<
  Prisma.TransactionClient,
  'applicationEvidenceContext' | 'profileEvidenceApproval'
>;

async function countApplicationApprovals(
  client: ApprovalCountClient,
  userId: string,
  analysisId: string
): Promise<number> {
  const [contexts, approvals] = await Promise.all([
    client.applicationEvidenceContext.count({ where: { userId, jobMatchId: analysisId } }),
    client.profileEvidenceApproval.count({ where: { userId, jobMatchId: analysisId } }),
  ]);
  return contexts + approvals;
}

function approvalDecision(plan: PlanId, limit: number, used: number): CapabilityDecision {
  const remaining = Math.max(0, limit - used);
  const allowed = remaining > 0;
  return {
    capability: APPROVAL_CAPABILITY,
    plan,
    mode: 'resource_limit',
    allowed,
    limit,
    used,
    remaining,
    reason: allowed ? 'allowed' : 'resource_limit_reached',
    ...(!allowed && plan === 'FREE' ? { upgradeTarget: 'PRO' as const } : {}),
  };
}

function approvalLimitFor(plan: PlanId): number {
  const entitlement = getPlanEntitlement(plan, APPROVAL_CAPABILITY);
  return entitlement.mode === 'resource_limit' ? entitlement.limit : Number.POSITIVE_INFINITY;
}

/**
 * The per-application approval decision for the UI (e.g. "1 of 2 approved"). Reads
 * the effective plan and the live count of active approvals for the analysis.
 */
export async function getApplicationApprovalDecision(
  userId: string,
  analysisId: string
): Promise<CapabilityDecision> {
  const plan = await getUserPlan(userId);
  const used = await countApplicationApprovals(prisma, userId, analysisId);
  return approvalDecision(plan, approvalLimitFor(plan), used);
}

/**
 * Enforce the per-application approval cap before a NEW application-scoped
 * approval is created. Throws {@link EntitlementRequiredError} with the canonical
 * decision when the limit is reached; the caller must not mutate approval state.
 * Pass the surrounding transaction client so the count is consistent with the
 * create it guards.
 */
export async function assertApplicationApprovalLimit(
  userId: string,
  analysisId: string,
  client: ApprovalCountClient = prisma
): Promise<void> {
  const plan = await getUserPlan(userId);
  const limit = approvalLimitFor(plan);
  if (!Number.isFinite(limit)) return;
  const used = await countApplicationApprovals(client, userId, analysisId);
  if (used >= limit) throw new EntitlementRequiredError(approvalDecision(plan, limit, used));
}

export async function getEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot> {
  const plan = await getUserPlan(userId);
  const entries = await Promise.all(PRODUCT_CAPABILITIES.map(async (capability) => [capability, await decideForPlan(userId, plan, capability)] as const));
  return { plan, capabilities: Object.fromEntries(entries) as EntitlementSnapshot['capabilities'] };
}
