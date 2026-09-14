/**
 * Effective-access resolver — the single server-authoritative answer to "what
 * product plan does this user have right now, and why?".
 *
 * It reads provider-neutral {@link BillingPurchase} rows (never a provider status
 * directly), validates each against the central plan/offer registries, decides
 * which are active at `now`, and selects a deterministic winner. The entitlement
 * service consumes only `effectivePlan` — Stripe or any other provider merely
 * establishes access to a product plan; it never determines capability limits.
 *
 * Determinism when grants overlap (§7):
 *   1. higher-ranked plan wins;
 *   2. equal rank → latest effective access-end wins (open-ended = latest);
 *   3. still tied → most recently created purchase;
 *   4. still tied → higher purchase id.
 * This exact order is what the tests pin.
 */
import { prisma } from '@/shared/lib/prisma';
import type { BillingPurchase, Prisma } from '@/generated/prisma/client';
import {
  DEFAULT_PRODUCT_PLAN_ID,
  isProductPlanId,
  planRank,
  publicPlansByRank,
  type ProductPlanId,
} from './product-plans';
import { getOffer, publicOfferForPlan } from './offers';
import { BILLING_GRACE_PERIOD_DAYS } from './config';
import { enabledProviderIds, isProviderConfigured } from './providers';
import { isBillingProviderId, type BillingProviderId } from './provider-contract';

export type BillingAccessSource =
  | 'FREE_DEFAULT'
  | 'RECURRING_PURCHASE'
  | 'FIXED_TERM_PURCHASE'
  | 'ONE_TIME_PURCHASE'
  | 'TRIAL'
  | 'MANUAL_GRANT';

export type BillingAccessStatus =
  | 'FREE'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE_GRACE'
  | 'CANCELLED_ACTIVE'
  | 'EXPIRED'
  | 'UNPAID'
  | 'INCOMPLETE';

export interface BillingAccessResolution {
  effectivePlan: ProductPlanId;
  source: BillingAccessSource;

  activePurchaseId?: string;
  activeOfferId?: string;
  provider?: BillingProviderId;

  status: BillingAccessStatus;

  accessStartsAt?: Date;
  accessEndsAt?: Date;

  cancelAtPeriodEnd: boolean;
  graceEndsAt?: Date;

  checkoutAvailable: boolean;
  portalAvailable: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface GrantCandidate {
  purchase: BillingPurchase;
  planId: ProductPlanId;
  rank: number;
  source: BillingAccessSource;
  status: Extract<BillingAccessStatus, 'ACTIVE' | 'TRIALING' | 'PAST_DUE_GRACE' | 'CANCELLED_ACTIVE'>;
  accessStartsAt?: Date;
  accessEndsAt?: Date;
  graceEndsAt?: Date;
}

function sourceFor(purchase: BillingPurchase): BillingAccessSource {
  switch (purchase.arrangement) {
    case 'RECURRING':
      return 'RECURRING_PURCHASE';
    case 'FIXED_TERM':
      return 'FIXED_TERM_PURCHASE';
    case 'ONE_TIME':
      return 'ONE_TIME_PURCHASE';
    case 'MANUAL':
      return 'MANUAL_GRANT';
    default:
      return 'ONE_TIME_PURCHASE';
  }
}

/** The access window's start/end, choosing the field set appropriate to the arrangement. */
function accessWindow(purchase: BillingPurchase): { start?: Date; end?: Date } {
  if (purchase.arrangement === 'RECURRING') {
    return {
      start: purchase.accessStartsAt ?? purchase.currentPeriodStart ?? undefined,
      end: purchase.currentPeriodEnd ?? purchase.accessEndsAt ?? undefined,
    };
  }
  // Fixed-term, one-time and manual grants use the explicit access window and
  // are never forced into recurring period fields.
  return {
    start: purchase.accessStartsAt ?? undefined,
    end: purchase.accessEndsAt ?? purchase.currentPeriodEnd ?? undefined,
  };
}

/**
 * Evaluate one purchase into an active grant candidate, or null if it grants no
 * access at `now`. Encodes the status/date access policy of §8.
 */
function evaluate(purchase: BillingPurchase, now: Date): GrantCandidate | null {
  // Registry validation: an unknown plan or offer is treated as granting nothing,
  // never trusted. Failing safely here is deliberate (§7).
  if (!isProductPlanId(purchase.planId)) return null;
  if (!getOffer(purchase.offerId)) return null;

  const planId = purchase.planId;
  const { start, end } = accessWindow(purchase);
  const notStarted = start != null && start > now;
  const ended = end != null && end <= now;
  const base = {
    purchase,
    planId,
    rank: planRank(planId),
    accessStartsAt: start,
    accessEndsAt: end,
  };

  switch (purchase.status) {
    case 'ACTIVE':
      if (notStarted || ended) return null;
      return { ...base, source: sourceFor(purchase), status: 'ACTIVE' };

    case 'TRIALING': {
      const trialEnd = purchase.trialEndsAt ?? end;
      if (notStarted) return null;
      if (trialEnd != null && trialEnd <= now) return null;
      return { ...base, source: 'TRIAL', status: 'TRIALING', accessEndsAt: trialEnd ?? end };
    }

    case 'PAST_DUE': {
      // Grace: retain access for a configurable window after payment failure.
      const graceEnd =
        purchase.graceEndsAt ?? new Date((end ?? now).getTime() + BILLING_GRACE_PERIOD_DAYS * DAY_MS);
      if (graceEnd <= now) return null;
      return { ...base, source: sourceFor(purchase), status: 'PAST_DUE_GRACE', graceEndsAt: graceEnd };
    }

    case 'CANCELLED':
      // Cancelled but still inside the paid window keeps access until it ends.
      if (notStarted || ended) return null;
      return { ...base, source: sourceFor(purchase), status: 'CANCELLED_ACTIVE' };

    default:
      // PENDING, UNPAID, EXPIRED, REFUNDED, INCOMPLETE, INCOMPLETE_EXPIRED grant
      // nothing.
      return null;
  }
}

/** The non-granting status a purchase explains, for the no-active-grant fallback. */
type ExplanatoryStatus = 'UNPAID' | 'EXPIRED' | 'INCOMPLETE';

function explanatoryStatus(purchase: BillingPurchase, now: Date): ExplanatoryStatus | null {
  switch (purchase.status) {
    case 'UNPAID':
      return 'UNPAID';
    case 'PENDING':
    case 'INCOMPLETE':
    case 'INCOMPLETE_EXPIRED':
      return 'INCOMPLETE';
    case 'EXPIRED':
    case 'REFUNDED':
      return 'EXPIRED';
    case 'CANCELLED': {
      const { end } = accessWindow(purchase);
      return end != null && end <= now ? 'EXPIRED' : null;
    }
    case 'PAST_DUE': {
      const graceEnd =
        purchase.graceEndsAt ?? new Date((accessWindow(purchase).end ?? now).getTime() + BILLING_GRACE_PERIOD_DAYS * DAY_MS);
      return graceEnd <= now ? 'UNPAID' : null;
    }
    default:
      return null;
  }
}

/** Effective end for tie-breaking: open-ended grants sort as the latest. */
function endMs(candidate: GrantCandidate): number {
  return candidate.accessEndsAt ? candidate.accessEndsAt.getTime() : Number.POSITIVE_INFINITY;
}

function pickWinner(candidates: GrantCandidate[]): GrantCandidate {
  return [...candidates].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const endDiff = endMs(b) - endMs(a);
    if (endDiff !== 0) return endDiff;
    const aCreated = a.purchase.createdAt?.getTime() ?? 0;
    const bCreated = b.purchase.createdAt?.getTime() ?? 0;
    if (bCreated !== aCreated) return bCreated - aCreated;
    return b.purchase.id < a.purchase.id ? -1 : 1;
  })[0];
}

function upgradeAvailable(effectivePlan: ProductPlanId): boolean {
  const currentRank = planRank(effectivePlan);
  return publicPlansByRank().some(
    (plan) => plan.rank > currentRank && publicOfferForPlan(plan.id) != null
  );
}

function anyProviderReady(): boolean {
  return enabledProviderIds().some((id) => isProviderConfigured(id));
}

function freeResolution(status: BillingAccessStatus): BillingAccessResolution {
  return {
    effectivePlan: DEFAULT_PRODUCT_PLAN_ID,
    source: 'FREE_DEFAULT',
    status,
    cancelAtPeriodEnd: false,
    checkoutAvailable: upgradeAvailable(DEFAULT_PRODUCT_PLAN_ID) && anyProviderReady(),
    portalAvailable: false,
  };
}

/**
 * Any Prisma client that can read the user + billing rows — the top-level client
 * or an interactive-transaction client. The reservation ledger passes its `tx` so
 * the effective plan is resolved under the same advisory lock as the reservation,
 * without a second connection.
 */
export type BillingAccessClient = Pick<Prisma.TransactionClient, 'user'>;

/**
 * Resolve a user's effective billing access. Loads all access-granting purchases
 * they own (a user can never see another user's purchases — the query is scoped
 * to `userId`) and selects a deterministic winner. Provider-neutral purchases are
 * the SOLE authority for the effective plan — the legacy `subscriptionTier`
 * compatibility bridge was removed in Stage 2, so there is no dual authority.
 */
export async function resolveBillingAccess(
  userId: string,
  now: Date = new Date(),
  client: BillingAccessClient = prisma
): Promise<BillingAccessResolution> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      billingAccount: { select: { purchases: true } },
    },
  });

  const purchases = user?.billingAccount?.purchases ?? [];
  const candidates = purchases
    .map((purchase) => evaluate(purchase, now))
    .filter((c): c is GrantCandidate => c !== null);

  if (candidates.length > 0) {
    const winner = pickWinner(candidates);
    const provider = isBillingProviderId(winner.purchase.provider)
      ? winner.purchase.provider
      : undefined;
    const isPaidSource =
      winner.source === 'RECURRING_PURCHASE' ||
      winner.source === 'FIXED_TERM_PURCHASE' ||
      winner.source === 'ONE_TIME_PURCHASE' ||
      winner.source === 'TRIAL';

    return {
      effectivePlan: winner.planId,
      source: winner.source,
      activePurchaseId: winner.purchase.id,
      activeOfferId: winner.purchase.offerId,
      ...(provider ? { provider } : {}),
      status: winner.status,
      ...(winner.accessStartsAt ? { accessStartsAt: winner.accessStartsAt } : {}),
      ...(winner.accessEndsAt ? { accessEndsAt: winner.accessEndsAt } : {}),
      cancelAtPeriodEnd: winner.purchase.cancelAtPeriodEnd,
      ...(winner.graceEndsAt ? { graceEndsAt: winner.graceEndsAt } : {}),
      checkoutAvailable: upgradeAvailable(winner.planId) && anyProviderReady(),
      portalAvailable:
        isPaidSource && Boolean(winner.purchase.providerCustomerId) && provider != null && anyProviderReady(),
    };
  }

  // No active grant. Surface the most recent purchase's non-granting status (payment failed /
  // lapsed / incomplete) so the UI can explain why the user is on Free.
  const explanatory = purchases
    .map((purchase) => ({ purchase, status: explanatoryStatus(purchase, now) }))
    .filter((e): e is { purchase: BillingPurchase; status: ExplanatoryStatus } => e.status !== null)
    .sort((a, b) => (b.purchase.updatedAt?.getTime() ?? 0) - (a.purchase.updatedAt?.getTime() ?? 0))[0];

  return freeResolution(explanatory?.status ?? 'FREE');
}
