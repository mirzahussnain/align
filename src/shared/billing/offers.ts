/**
 * Billing offers — WHAT the customer buys, for how much and for how long.
 *
 * An offer references a product plan; it never *is* one. Interval, term and price
 * live here so the same `PRO` plan can later be sold monthly, annually or as a
 * fixed-term pass without the plan identity ever changing.
 *
 * The launch config exposes exactly one public paid offer (`PRO_MONTHLY`). Future
 * offers (annual, a 15-day pass, a Premium tier) are representable by this shape
 * but deliberately absent — adding one must not require touching entitlement
 * logic, only this registry.
 */
import { isProductPlanId, type ProductPlanId } from './product-plans';
import type { AnyBillingProviderId, BillingProviderId } from './provider-contract';
import { BillingError } from './errors';

export type BillingArrangement = 'RECURRING' | 'FIXED_TERM' | 'ONE_TIME' | 'MANUAL';
export type BillingInterval = 'MONTH' | 'YEAR';
export type BillingCurrency = 'GBP';

export interface BillingOfferDefinition {
  id: string;
  planId: ProductPlanId;

  displayName: string;
  description: string;

  arrangement: BillingArrangement;
  /** Required for RECURRING offers; absent otherwise. */
  interval?: BillingInterval;
  /** Required for FIXED_TERM offers; the access window length in days. */
  fixedTermDays?: number;

  /** Price in minor units (pence). 0 for the free default; never a float. */
  priceMinor: number;
  currency: BillingCurrency;

  isPublic: boolean;
  isActive: boolean;

  /** Server env var name holding each provider's price id. Never a literal id. */
  providerPriceEnvKeys: Partial<Record<AnyBillingProviderId, string>>;
}

/**
 * Launch offers. `PRO_MONTHLY` is the only public paid offer. The £12.99 price
 * lives here and nowhere else in the codebase (§15).
 */
export const BILLING_OFFERS = {
  PRO_MONTHLY: {
    id: 'PRO_MONTHLY',
    planId: 'PRO',
    displayName: 'Pro Monthly',
    description: 'Full reports, higher AI limits and advanced tools, billed monthly.',
    arrangement: 'RECURRING',
    interval: 'MONTH',
    priceMinor: 1299,
    currency: 'GBP',
    isPublic: true,
    isActive: true,
    providerPriceEnvKeys: { STRIPE: 'STRIPE_PRO_MONTHLY_PRICE_ID' },
  },
} as const satisfies Record<string, BillingOfferDefinition>;

export type BillingOfferId = keyof typeof BILLING_OFFERS;

export function getOffer(id: string): BillingOfferDefinition | undefined {
  return (BILLING_OFFERS as Record<string, BillingOfferDefinition>)[id];
}

export function isKnownOfferId(id: unknown): id is BillingOfferId {
  return typeof id === 'string' && id in BILLING_OFFERS;
}

/**
 * Resolve a server allow-listed offer, or throw. This is the only sanctioned way
 * a route turns a client-supplied offer id into an offer — an unknown id is
 * rejected (`UNKNOWN_OFFER`) rather than trusted.
 */
export function requireOffer(id: unknown): BillingOfferDefinition {
  if (!isKnownOfferId(id)) {
    throw new BillingError('UNKNOWN_OFFER', `Unknown billing offer: ${String(id)}`);
  }
  return BILLING_OFFERS[id];
}

export function publicPaidOffers(): BillingOfferDefinition[] {
  return Object.values(BILLING_OFFERS).filter((o) => o.isPublic && o.isActive && o.priceMinor > 0);
}

/** The single active public offer for a plan, if any (launch: PRO → PRO_MONTHLY). */
export function publicOfferForPlan(planId: ProductPlanId): BillingOfferDefinition | undefined {
  return publicPaidOffers().find((o) => o.planId === planId);
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Structural validation of a single offer. Returns the problems found (empty =
 * valid). Runs against the launch registry at module load via
 * {@link assertOffersValid}, and is exported so tests can assert future shapes
 * (annual, fixed-term) validate without any entitlement changes.
 */
export function validateOffer(offer: BillingOfferDefinition): string[] {
  const problems: string[] = [];

  if (!isProductPlanId(offer.planId)) {
    problems.push(`offer ${offer.id}: planId ${offer.planId} is not a known product plan`);
  }
  if (!Number.isInteger(offer.priceMinor) || offer.priceMinor < 0) {
    problems.push(`offer ${offer.id}: priceMinor must be a non-negative integer (minor units)`);
  }

  switch (offer.arrangement) {
    case 'RECURRING':
      if (!offer.interval) problems.push(`offer ${offer.id}: recurring offers require an interval`);
      if (offer.fixedTermDays != null) {
        problems.push(`offer ${offer.id}: recurring offers must not set fixedTermDays`);
      }
      break;
    case 'FIXED_TERM':
      if (!offer.fixedTermDays || offer.fixedTermDays <= 0) {
        problems.push(`offer ${offer.id}: fixed-term offers require a positive fixedTermDays`);
      }
      if (offer.interval) problems.push(`offer ${offer.id}: fixed-term offers must not set a recurring interval`);
      break;
    case 'ONE_TIME':
      if (offer.interval) problems.push(`offer ${offer.id}: one-time offers must not require a recurring interval`);
      break;
    case 'MANUAL':
      break;
  }

  const isPaid = offer.priceMinor > 0;
  if (offer.planId === 'FREE' && isPaid) {
    problems.push(`offer ${offer.id}: the Free plan must not have a paid offer`);
  }

  if (offer.isPublic && isPaid) {
    // Every public paid offer must be purchasable somewhere: at least one enabled
    // provider must have a price env key mapped.
    const providerKeys = Object.entries(offer.providerPriceEnvKeys).filter(([, v]) => Boolean(v));
    if (providerKeys.length === 0) {
      problems.push(`offer ${offer.id}: a public paid offer must map to at least one provider price`);
    }
    for (const [, envKey] of providerKeys) {
      // No provider price *id* may be committed — only the env var name that holds it.
      if (envKey && /^price_|^sk_|^pi_/.test(envKey)) {
        problems.push(`offer ${offer.id}: providerPriceEnvKeys must hold env var NAMES, not literal ids (${envKey})`);
      }
    }
  }

  return problems;
}

/** Throws if any offer in the registry is structurally invalid. */
export function assertOffersValid(): void {
  const problems = Object.values(BILLING_OFFERS).flatMap(validateOffer);
  if (problems.length > 0) {
    throw new BillingError('INVALID_OFFER', `Invalid billing offer configuration:\n- ${problems.join('\n- ')}`);
  }
}

// Fail fast at load: a malformed launch offer registry is a deploy-blocking bug.
assertOffersValid();

/**
 * The server env var name holding this offer's price id for a provider, if the
 * offer is sold through that provider. The value itself is read via
 * {@link import('./env').getServerPriceId} — never returned to the client.
 */
export function priceEnvKeyFor(
  offer: BillingOfferDefinition,
  provider: BillingProviderId
): string | undefined {
  return offer.providerPriceEnvKeys[provider];
}
