/**
 * The one authoritative billing configuration module (§15).
 *
 * Product plans, precedence, offers, launch pricing, supported providers and the
 * payment-failure grace period are all reachable from here. The billing page, the
 * upgrade modal and any future checkout consume this — the £12.99 lives in
 * {@link BILLING_OFFERS} and is formatted here; it appears nowhere else.
 */
import {
  DEFAULT_PRODUCT_PLAN_ID,
  PRODUCT_PLANS,
  publicPlansByRank,
  type ProductPlanId,
} from './product-plans';
import {
  publicOfferForPlan,
  type BillingCurrency,
  type BillingInterval,
  type BillingOfferDefinition,
} from './offers';
import { enabledProviderIds } from './providers';

/**
 * How long paid access is retained after a payment failure (PAST_DUE) before the
 * plan drops to Free. Centrally configurable — grace logic reads this and nothing
 * scatters its own duration (§8).
 */
export const BILLING_GRACE_PERIOD_DAYS = 3;

const CURRENCY_SYMBOL: Record<BillingCurrency, string> = { GBP: '£' };

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  MONTH: '/month',
  YEAR: '/year',
};

/** Minor units → display string, e.g. (1299, 'GBP') → "£12.99". */
export function formatMinorPrice(priceMinor: number, currency: BillingCurrency): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const major = priceMinor / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `${symbol}${text}`;
}

export interface OfferPresentation {
  offerId: string;
  priceLabel: string;
  periodLabel: string;
}

/** Presentation for a plan's public paid offer, if it has one (launch: PRO). */
export function offerPresentationForPlan(planId: ProductPlanId): OfferPresentation | null {
  const offer = publicOfferForPlan(planId);
  if (!offer) return null;
  return {
    offerId: offer.id,
    priceLabel: formatMinorPrice(offer.priceMinor, offer.currency),
    periodLabel: offer.interval ? INTERVAL_LABEL[offer.interval] : '',
  };
}

export interface PlanPresentation {
  id: ProductPlanId;
  displayName: string;
  description: string;
  /** Free renders as "Free"; a paid plan renders its offer price. */
  priceLabel: string;
  periodLabel: string;
}

/** Public plans, low→high rank, with the price label sourced from config. */
export function planPresentations(): PlanPresentation[] {
  return publicPlansByRank().map((plan) => {
    const offer = offerPresentationForPlan(plan.id);
    return {
      id: plan.id,
      displayName: plan.displayName,
      description: plan.description,
      priceLabel: offer?.priceLabel ?? '\u00A30',
      periodLabel: offer?.periodLabel ?? '',
    };
  });
}

/** A compact, serialisable snapshot of the launch billing configuration. */
export const BILLING_LAUNCH = {
  defaultPlanId: DEFAULT_PRODUCT_PLAN_ID,
  planIds: publicPlansByRank().map((p) => p.id),
  providers: enabledProviderIds(),
  gracePeriodDays: BILLING_GRACE_PERIOD_DAYS,
} as const;

export { PRODUCT_PLANS };
export type { BillingOfferDefinition };
