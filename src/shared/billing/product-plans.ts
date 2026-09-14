/**
 * Product plans — WHAT capabilities and limits a user receives.
 *
 * A product plan is deliberately NOT a commercial arrangement. Billing interval,
 * price and term live on {@link BillingOfferDefinition}, never here. Plan ids are
 * therefore `FREE`/`PRO`, never `PRO_MONTHLY` — that would conflate the plan with
 * one way of paying for it.
 *
 * Precedence (`rank`) is central to this module so no route ever hard-codes
 * "PRO beats FREE"; the resolver and any future overlap logic read it from here.
 */
import type { PlanId } from '@/shared/entitlements/registry';

export const PRODUCT_PLAN_IDS = ['FREE', 'PRO'] as const;
export type ProductPlanId = (typeof PRODUCT_PLAN_IDS)[number];

/**
 * Compile-time coupling between the billing product-plan set and the entitlement
 * plan set. These two MUST stay identical: a product plan with no entitlement
 * configuration is a plan a user can hold but receive nothing for. Adding
 * `"PREMIUM"` to one list without the other makes `_planSetParity` fail to
 * type-check, which is the intended forcing function for a future tier.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _planSetParity: Exact<ProductPlanId, PlanId> = true;

export interface ProductPlanDefinition {
  id: ProductPlanId;
  displayName: string;
  description: string;
  /** Higher rank wins when two access grants overlap. Central precedence. */
  rank: number;
  /** Whether the plan is offered to the public (Free is public as the default). */
  isPublic: boolean;
  /** The entitlement registry key this plan draws its capabilities from. */
  entitlementPlanId: ProductPlanId;
}

/**
 * The launch product plans. `satisfies Record<ProductPlanId, …>` forces an entry
 * for every plan id, so adding a new id to `PRODUCT_PLAN_IDS` fails to compile
 * until its definition (and, via `entitlementPlanId`, its entitlements) exist.
 */
export const PRODUCT_PLANS = {
  FREE: {
    id: 'FREE',
    displayName: 'Free',
    description: 'Check where your CV stands before you commit.',
    rank: 0,
    isPublic: true,
    entitlementPlanId: 'FREE',
  },
  PRO: {
    id: 'PRO',
    displayName: 'Pro',
    description: 'For an active job search across multiple roles.',
    rank: 10,
    isPublic: true,
    entitlementPlanId: 'PRO',
  },
} as const satisfies Record<ProductPlanId, ProductPlanDefinition>;

/** The plan every account holds when no paid access grant is active. */
export const DEFAULT_PRODUCT_PLAN_ID: ProductPlanId = 'FREE';

export function isProductPlanId(value: unknown): value is ProductPlanId {
  return typeof value === 'string' && (PRODUCT_PLAN_IDS as readonly string[]).includes(value);
}

export function getProductPlan(id: ProductPlanId): ProductPlanDefinition {
  return PRODUCT_PLANS[id];
}

export function planRank(id: ProductPlanId): number {
  return PRODUCT_PLANS[id].rank;
}

/** The higher-ranked of two plans; ties return the first argument. */
export function higherRankedPlan(a: ProductPlanId, b: ProductPlanId): ProductPlanId {
  return planRank(b) > planRank(a) ? b : a;
}

/** Public plans ordered low→high rank, for presentation. */
export function publicPlansByRank(): ProductPlanDefinition[] {
  return PRODUCT_PLAN_IDS.map((id) => PRODUCT_PLANS[id])
    .filter((plan) => plan.isPublic)
    .sort((a, b) => a.rank - b.rank);
}
