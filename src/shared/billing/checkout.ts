/**
 * Server-authoritative checkout (§5, §6, §7).
 *
 * The client submits only an allow-listed offer id. Everything else — the provider
 * price, the customer, the URLs, the metadata — is resolved on the server. Access
 * is NEVER granted here; only a verified webhook can do that. This module:
 *
 *  - validates the offer against the registry (public + active);
 *  - confirms the provider is enabled and configured;
 *  - resolves the provider price from server env (never client input);
 *  - refuses a duplicate subscription (ALREADY_SUBSCRIBED → use the portal);
 *  - reuses or creates the provider customer, bound to the account;
 *  - creates a hosted checkout session under a stable idempotency key.
 */
import { requireOffer } from './offers';
import { BillingError } from './errors';
import { getServerPriceId, getPublicAppUrl } from './env';
import { resolveProviderAdapter, isProviderConfigured } from './providers';
import { resolveBillingAccess } from './access';
import { planRank, isProductPlanId } from './product-plans';
import { ensureBillingAccount, setAccountCustomer } from './account';
import { logBillingEvent } from './logging';
import type { BillingProviderId } from './provider-contract';

export interface StartCheckoutResult {
  url: string;
}

/** The launch provider for an offer — Stripe is the only enabled one. */
function providerForOffer(offer: { providerPriceEnvKeys: Partial<Record<string, string>> }): BillingProviderId {
  if (offer.providerPriceEnvKeys.STRIPE) return 'STRIPE';
  throw new BillingError('CHECKOUT_UNAVAILABLE', 'No enabled provider is configured for this offer.');
}

export async function startCheckout(
  userId: string,
  offerId: string,
  userEmail?: string | null
): Promise<StartCheckoutResult> {
  // ── Offer validation (registry is the only source of truth) ──────────────────
  const offer = requireOffer(offerId); // throws UNKNOWN_OFFER for anything unlisted
  if (!offer.isPublic || !offer.isActive || offer.priceMinor <= 0) {
    throw new BillingError('INVALID_OFFER', `Offer ${offer.id} is not a public, active paid offer.`);
  }

  // ── Provider readiness ───────────────────────────────────────────────────────
  const provider = providerForOffer(offer);
  if (!isProviderConfigured(provider)) {
    throw new BillingError('BILLING_NOT_CONFIGURED', 'The billing provider is not configured.');
  }
  const envKey = offer.providerPriceEnvKeys[provider];
  if (!envKey) throw new BillingError('CHECKOUT_UNAVAILABLE', 'This offer is not sold through the provider.');
  const providerPriceId = getServerPriceId(envKey); // throws PROVIDER_NOT_CONFIGURED if unset

  logBillingEvent('checkout_started', { userId, offerId: offer.id, planId: offer.planId, provider });

  // ── Duplicate-subscription guard (§6) ────────────────────────────────────────
  // If the user already holds active recurring access to this plan (or higher),
  // send them to the portal rather than creating a second subscription.
  const access = await resolveBillingAccess(userId);
  const activeRecurring =
    access.source === 'RECURRING_PURCHASE' || access.source === 'TRIAL';
  const grantsThisPlanOrHigher =
    isProductPlanId(access.effectivePlan) && planRank(access.effectivePlan) >= planRank(offer.planId);
  const activeStatus =
    access.status === 'ACTIVE' ||
    access.status === 'TRIALING' ||
    access.status === 'PAST_DUE_GRACE' ||
    access.status === 'CANCELLED_ACTIVE';
  if (activeRecurring && grantsThisPlanOrHigher && activeStatus) {
    logBillingEvent('checkout_blocked_already_subscribed', { userId, offerId: offer.id, planId: offer.planId, provider });
    throw new BillingError('ALREADY_SUBSCRIBED', 'You already have an active subscription; manage it in the billing portal.');
  }

  // ── Account + customer (server-owned) ────────────────────────────────────────
  const account = await ensureBillingAccount(userId);
  const adapter = resolveProviderAdapter(provider);
  const customer = await adapter.findOrCreateCustomer({
    userId,
    billingAccountId: account.id,
    email: userEmail ?? null,
    existingCustomerId: account.providerCustomerId,
  });
  if (customer.created || account.providerCustomerId !== customer.providerCustomerId) {
    await setAccountCustomer(account.id, provider, customer.providerCustomerId);
  }

  // ── Hosted checkout session ──────────────────────────────────────────────────
  const appUrl = getPublicAppUrl().replace(/\/$/, '');
  const result = await adapter.createCheckout({
    userId,
    billingAccountId: account.id,
    offerId: offer.id,
    planId: offer.planId,
    providerPriceId,
    providerCustomerId: customer.providerCustomerId,
    customerEmail: userEmail ?? null,
    successUrl: `${appUrl}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/dashboard/billing/cancelled`,
    // Stable key so a double-click / retry within Stripe's idempotency window
    // returns the same session instead of creating a duplicate (§6).
    idempotencyKey: `checkout:${provider}:${userId}:${offer.id}`,
  });

  logBillingEvent('checkout_session_created', { userId, offerId: offer.id, planId: offer.planId, provider });
  return { url: result.url };
}
