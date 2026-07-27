/**
 * Provider-neutral billing contract.
 *
 * This is the boundary every external payment service is adapted to. Nothing in
 * the entitlement layer, routes, reports or UI imports a payment SDK — they speak
 * only these shapes. A new provider (Paddle, Lemon Squeezy, a manual grant tool)
 * is added by implementing {@link BillingProviderAdapter}, never by leaking its
 * types outward.
 *
 * Only the launch provider is enabled now; the id list is designed so future
 * values compile-fail every switch/registry that has not handled them yet.
 */

export const BILLING_PROVIDER_IDS = ['STRIPE'] as const;
export type BillingProviderId = (typeof BILLING_PROVIDER_IDS)[number];

/**
 * Future provider ids the architecture must accommodate. Kept as a separate,
 * non-enabled list so the type system knows they exist (documentation + future
 * `providerPriceEnvKeys` typing) without any of them being launch-supported.
 */
export const FUTURE_BILLING_PROVIDER_IDS = ['PADDLE', 'LEMON_SQUEEZY', 'MANUAL'] as const;
export type FutureBillingProviderId = (typeof FUTURE_BILLING_PROVIDER_IDS)[number];

/** Every provider id the domain can *name* (launch + future), for typing maps. */
export type AnyBillingProviderId = BillingProviderId | FutureBillingProviderId;

export function isBillingProviderId(value: unknown): value is BillingProviderId {
  return typeof value === 'string' && (BILLING_PROVIDER_IDS as readonly string[]).includes(value);
}

// ── Provider I/O ──────────────────────────────────────────────────────────────

export interface CreateCheckoutInput {
  /** The Align user initiating the purchase; ownership is bound server-side. */
  userId: string;
  /** Internal billing-account id, carried in provider metadata for webhook linkage. */
  billingAccountId: string;
  /** Server allow-listed offer id (never trusted from the client). */
  offerId: string;
  /** The product plan the offer grants — carried for the return event mapping. */
  planId: string;
  /** Provider-specific price id, resolved from server env — never client input. */
  providerPriceId: string;
  /** Existing provider customer id to reuse, if the account already has one. */
  providerCustomerId?: string | null;
  /** Email to seed a new provider customer with (convenience only, not authority). */
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Stable server-side idempotency key so a repeated request returns one session. */
  idempotencyKey?: string;
}

export interface CreateCheckoutResult {
  /** The hosted checkout URL to redirect the customer to. */
  url: string;
  /** Provider's id for this checkout session, for later reconciliation. */
  providerCheckoutId: string;
}

export interface FindOrCreateCustomerInput {
  userId: string;
  billingAccountId: string;
  email?: string | null;
  /** An existing provider customer id to verify and reuse if still valid. */
  existingCustomerId?: string | null;
}

export interface FindOrCreateCustomerResult {
  providerCustomerId: string;
  /** True when a replacement customer was created (e.g. the old one was deleted). */
  created: boolean;
}

export interface CreatePortalInput {
  userId: string;
  providerCustomerId: string;
  returnUrl: string;
}

export interface CreatePortalResult {
  url: string;
}

export interface CancelPurchaseInput {
  providerPurchaseId: string;
  /** Cancel at period end (default) vs immediately. */
  atPeriodEnd?: boolean;
}

/**
 * A read of the provider's current view of a purchase, mapped to provider-neutral
 * fields. The adapter is responsible for translating the provider's own status
 * strings into our internal statuses; raw provider status is never surfaced.
 */
export interface ProviderPurchaseSnapshot {
  providerPurchaseId: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerPriceId?: string | null;
  /** Internal, provider-neutral status. */
  status: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  /**
   * Whether the subscription is scheduled to END with the current period rather
   * than renew. This is a NEUTRAL fact the adapter derives — providers express it
   * in more than one way (see the Stripe adapter's billing-mode note), so callers
   * must never assume it maps 1:1 to any single provider field.
   */
  cancelAtPeriodEnd?: boolean;
  /**
   * The exact instant the provider will end the subscription, when one is
   * scheduled. Kept alongside `cancelAtPeriodEnd` because a cancellation can be
   * scheduled for a date BEYOND the current period, in which case the
   * subscription still renews at least once and `cancelAtPeriodEnd` is false.
   */
  cancelAt?: Date | null;
  trialEndsAt?: Date | null;
}

// ── Verified webhook events (future-ready, not yet processed) ─────────────────

export type BillingEventType =
  | 'PURCHASE_CREATED'
  | 'PURCHASE_UPDATED'
  | 'PURCHASE_CANCELLED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'TRIAL_STARTED'
  | 'TRIAL_ENDED'
  | 'REFUND_CREATED';

/**
 * A webhook that the adapter has cryptographically verified and normalised. The
 * `provider*Id` fields are opaque references used to locate the owning purchase;
 * the neutral processor (Stage 2) never sees the raw payload.
 */
export interface VerifiedBillingEvent {
  provider: BillingProviderId;
  /** Provider's unique event id — the idempotency key for future processing. */
  providerEventId: string;
  type: BillingEventType;
  occurredAt: Date;
  customerRef?: string;
  purchaseRef?: string;
  subscriptionRef?: string;
  /**
   * The provider checkout/session reference this event came from, when it had one.
   * A LINKING reference only: it lets a checkout-completion event converge onto a
   * purchase already associated with that checkout. It is never used to resolve
   * ownership, and never used as the subscription to fetch.
   */
  checkoutRef?: string;
  priceRef?: string;
  /** Our internal user id, read from provider metadata we set at checkout. */
  userRef?: string;
  /** Our internal billing-account id, read from provider metadata we set at checkout. */
  accountRef?: string;
  /** Provider-native status string, kept only for the adapter's own mapping. */
  status?: string;
  rawVersion?: string;
}

/**
 * The single interface every payment provider is adapted to. Stage 1 ships the
 * boundary and a Stripe adapter that fails clearly until checkout/webhooks are
 * implemented in Stage 2 — no method here performs real payment work yet.
 */
export interface BillingProviderAdapter {
  readonly id: BillingProviderId;
  findOrCreateCustomer(input: FindOrCreateCustomerInput): Promise<FindOrCreateCustomerResult>;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  createCustomerPortal(input: CreatePortalInput): Promise<CreatePortalResult>;
  cancelPurchase(input: CancelPurchaseInput): Promise<void>;
  getPurchase(providerPurchaseId: string): Promise<ProviderPurchaseSnapshot>;
  verifyWebhook(request: Request): Promise<VerifiedBillingEvent>;
}
