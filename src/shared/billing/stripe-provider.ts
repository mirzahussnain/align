/**
 * Stripe adapter boundary.
 *
 * ALL Stripe-specific code lives behind this class. No entitlement, route, report
 * or UI module imports the Stripe SDK — they go through {@link BillingProviderAdapter}.
 * Every method translates Stripe objects into the provider-neutral contract and
 * maps Stripe failures to safe {@link BillingError}s; a raw Stripe object shape or
 * error message never escapes this module.
 */
import Stripe from 'stripe';
import type {
  BillingProviderAdapter,
  BillingProviderId,
  CreateCheckoutInput,
  CreateCheckoutResult,
  CreatePortalInput,
  CreatePortalResult,
  CancelPurchaseInput,
  FindOrCreateCustomerInput,
  FindOrCreateCustomerResult,
  ProviderPurchaseSnapshot,
  VerifiedBillingEvent,
  BillingEventType,
} from './provider-contract';
import { BillingError } from './errors';
import { getStripeServerConfig, hasServerEnv } from './env';
import { mapStripeSubscriptionStatus } from './stripe-status';

/** The API version this adapter is written against (pinned; see SDK apiVersion). */
const STRIPE_API_VERSION = '2026-06-24.dahlia';

function secondsToDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/** Map any Stripe error into a safe BillingError; never leak the raw message out. */
function mapStripeError(error: unknown, op: string): BillingError {
  if (error instanceof BillingError) return error;
  if (error instanceof Stripe.errors.StripeError) {
    // Connection/rate errors are transient → provider-unavailable; everything else
    // is a provider error. The raw message stays in this BillingError for server
    // logs only (safeBillingMessage is what the client ever sees).
    const transient =
      error.type === 'StripeConnectionError' || error.type === 'StripeAPIError' || error.type === 'StripeRateLimitError';
    return new BillingError(
      transient ? 'BILLING_PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
      `Stripe ${op} failed: ${error.type}${error.code ? ` (${error.code})` : ''}`
    );
  }
  return new BillingError('PROVIDER_ERROR', `Stripe ${op} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
}

/**
 * Whether this subscription is scheduled to END with the current period rather
 * than renew.
 *
 * `cancel_at_period_end` ALONE is not sufficient, and relying on it silently
 * loses portal cancellations. Stripe has two billing modes:
 *
 *  - classic:  a portal cancellation sets `cancel_at_period_end = true` and
 *              mirrors `cancel_at` to the period end;
 *  - flexible: a portal cancellation sets `cancel_at` to the period end and
 *              leaves `cancel_at_period_end = FALSE`.
 *
 * Flexible is the default for subscriptions created on API version
 * `2025-09-30.clover` and later — which includes the version this adapter pins —
 * so the boolean reads false for a subscription Stripe is genuinely about to end.
 * Both signals are therefore read.
 *
 * A `cancel_at` BEYOND the current period end is a scheduled cancellation but not
 * an end-of-this-period one: the subscription still renews at least once, so this
 * returns false and the date travels on the snapshot's `cancelAt` instead.
 */
function scheduledToEndWithPeriod(sub: Stripe.Subscription, currentPeriodEnd: Date | null): boolean {
  if (sub.cancel_at_period_end === true) return true;
  const cancelAt = secondsToDate(sub.cancel_at);
  if (cancelAt == null) return false;
  return currentPeriodEnd == null || cancelAt.getTime() <= currentPeriodEnd.getTime();
}

/** Stripe's event names → our provider-neutral event type. Unlisted names ignore. */
const EVENT_TYPE_MAP: Record<string, BillingEventType> = {
  'checkout.session.completed': 'PURCHASE_CREATED',
  'checkout.session.async_payment_succeeded': 'PAYMENT_SUCCEEDED',
  'checkout.session.async_payment_failed': 'PAYMENT_FAILED',
  'customer.subscription.created': 'PURCHASE_CREATED',
  'customer.subscription.updated': 'PURCHASE_UPDATED',
  'customer.subscription.deleted': 'PURCHASE_CANCELLED',
  'invoice.paid': 'PAYMENT_SUCCEEDED',
  'invoice.payment_failed': 'PAYMENT_FAILED',
  'invoice.payment_action_required': 'PAYMENT_FAILED',
};

export class StripeBillingProvider implements BillingProviderAdapter {
  readonly id: BillingProviderId = 'STRIPE';

  private client: Stripe | null = null;

  /** Whether the server env needed to actually call Stripe is present. */
  static isConfigured(): boolean {
    try {
      return hasServerEnv('STRIPE_SECRET_KEY') && hasServerEnv('STRIPE_WEBHOOK_SECRET');
    } catch {
      // hasServerEnv throws only in the browser; treat that as "not configured".
      return false;
    }
  }

  /**
   * Asserts the adapter can reach Stripe and returns a memoised client. Surfaces a
   * stable `PROVIDER_NOT_CONFIGURED` (via getStripeServerConfig) rather than an
   * opaque SDK error when the env is missing.
   */
  private stripe(): Stripe {
    if (this.client) return this.client;
    const { secretKey } = getStripeServerConfig();
    this.client = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.StripeConfig['apiVersion'],
      typescript: true,
      appInfo: { name: 'Align', version: '0.1.0' },
    });
    return this.client;
  }

  ensureConfigured(): void {
    getStripeServerConfig();
  }

  private metadata(input: { userId: string; billingAccountId: string; offerId?: string; planId?: string }) {
    return {
      userId: input.userId,
      billingAccountId: input.billingAccountId,
      ...(input.offerId ? { offerId: input.offerId } : {}),
      ...(input.planId ? { planId: input.planId } : {}),
    };
  }

  async findOrCreateCustomer(input: FindOrCreateCustomerInput): Promise<FindOrCreateCustomerResult> {
    const stripe = this.stripe();
    try {
      if (input.existingCustomerId) {
        try {
          const existing = await stripe.customers.retrieve(input.existingCustomerId);
          // A deleted customer must not be reused — fall through to create one.
          if (!('deleted' in existing) || !existing.deleted) {
            return { providerCustomerId: existing.id, created: false };
          }
        } catch (error) {
          // Missing customer (deleted/never existed): create a replacement. Any
          // other error is a real failure.
          if (!(error instanceof Stripe.errors.StripeError) || error.code !== 'resource_missing') {
            throw error;
          }
        }
      }
      const created = await stripe.customers.create({
        email: input.email ?? undefined,
        metadata: this.metadata(input),
      });
      return { providerCustomerId: created.id, created: true };
    } catch (error) {
      throw mapStripeError(error, 'customer resolution');
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const stripe = this.stripe();
    const meta = this.metadata(input);
    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [{ price: input.providerPriceId, quantity: 1 }],
          // Reuse the account's customer when known; otherwise seed with the email
          // for convenience. Ownership is never taken from the client.
          ...(input.providerCustomerId
            ? { customer: input.providerCustomerId }
            : input.customerEmail
              ? { customer_email: input.customerEmail }
              : {}),
          client_reference_id: input.userId,
          metadata: meta,
          subscription_data: { metadata: meta },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          // Promotions deliberately disabled at launch (§5); automatic tax deferred.
          allow_promotion_codes: false,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
      );
      if (!session.url) {
        throw new BillingError('CHECKOUT_UNAVAILABLE', 'Stripe returned a checkout session without a URL.');
      }
      return { url: session.url, providerCheckoutId: session.id };
    } catch (error) {
      throw mapStripeError(error, 'checkout creation');
    }
  }

  async createCustomerPortal(input: CreatePortalInput): Promise<CreatePortalResult> {
    const stripe = this.stripe();
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: input.providerCustomerId,
        return_url: input.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      throw mapStripeError(error, 'portal creation');
    }
  }

  async cancelPurchase(input: CancelPurchaseInput): Promise<void> {
    const stripe = this.stripe();
    try {
      if (input.atPeriodEnd === false) {
        // Immediate cancellation — only used when explicitly requested.
        await stripe.subscriptions.cancel(input.providerPurchaseId);
      } else {
        // Default: cancel at period end, preserving paid access until it lapses.
        await stripe.subscriptions.update(input.providerPurchaseId, { cancel_at_period_end: true });
      }
    } catch (error) {
      throw mapStripeError(error, 'cancellation');
    }
  }

  async getPurchase(providerPurchaseId: string): Promise<ProviderPurchaseSnapshot> {
    const stripe = this.stripe();
    try {
      const sub = await stripe.subscriptions.retrieve(providerPurchaseId);
      return this.snapshotFromSubscription(sub);
    } catch (error) {
      throw mapStripeError(error, 'subscription read');
    }
  }

  /** Translate a Stripe Subscription into the provider-neutral snapshot. */
  private snapshotFromSubscription(sub: Stripe.Subscription): ProviderPurchaseSnapshot {
    // Period dates moved to the subscription item in recent API versions; read
    // them from the first item, never the (removed) top-level fields.
    const item = sub.items.data[0];
    const currentPeriodEnd = secondsToDate(item?.current_period_end);
    return {
      providerPurchaseId: sub.id,
      providerCustomerId: idOf(sub.customer),
      providerSubscriptionId: sub.id,
      providerPriceId: item?.price?.id ?? null,
      status: mapStripeSubscriptionStatus(sub.status),
      currentPeriodStart: secondsToDate(item?.current_period_start),
      currentPeriodEnd,
      cancelAtPeriodEnd: scheduledToEndWithPeriod(sub, currentPeriodEnd),
      cancelAt: secondsToDate(sub.cancel_at),
      trialEndsAt: secondsToDate(sub.trial_end),
    };
  }

  async verifyWebhook(request: Request): Promise<VerifiedBillingEvent> {
    const { webhookSecret } = getStripeServerConfig();
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      throw new BillingError('WEBHOOK_SIGNATURE_INVALID', 'Missing Stripe signature header.');
    }
    // The RAW body is required for signature verification — never a parsed object.
    const rawBody = await request.text();
    const stripe = this.stripe();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch {
      // Do not leak the verification detail; a failed signature is always the same
      // safe, opaque rejection.
      throw new BillingError('WEBHOOK_SIGNATURE_INVALID', 'Stripe webhook signature verification failed.');
    }

    const type = EVENT_TYPE_MAP[event.type];
    if (!type) {
      throw new BillingError('WEBHOOK_EVENT_UNSUPPORTED', `Unsupported Stripe event: ${event.type}`);
    }
    return this.mapEvent(event, type);
  }

  /** Extract provider-neutral references from a verified event's object. */
  private mapEvent(event: Stripe.Event, type: BillingEventType): VerifiedBillingEvent {
    const base: VerifiedBillingEvent = {
      provider: 'STRIPE',
      providerEventId: event.id,
      type,
      occurredAt: new Date(event.created * 1000),
    };
    const object = event.data.object as unknown as Record<string, unknown>;

    if (event.type.startsWith('checkout.session.')) {
      const session = object as unknown as Stripe.Checkout.Session;
      const meta = session.metadata ?? {};
      return {
        ...base,
        customerRef: idOf(session.customer) ?? undefined,
        subscriptionRef: idOf(session.subscription) ?? undefined,
        // The session id is carried as a LINK only, never as `purchaseRef` — the
        // handler falls back to `purchaseRef` as the subscription to fetch, and a
        // `cs_…` id is not retrievable as a subscription.
        checkoutRef: session.id || undefined,
        userRef: meta.userId ?? undefined,
        accountRef: meta.billingAccountId ?? undefined,
      };
    }

    if (event.type.startsWith('customer.subscription.')) {
      const sub = object as unknown as Stripe.Subscription;
      const meta = sub.metadata ?? {};
      return {
        ...base,
        customerRef: idOf(sub.customer) ?? undefined,
        subscriptionRef: sub.id,
        purchaseRef: sub.id,
        priceRef: sub.items.data[0]?.price?.id ?? undefined,
        userRef: meta.userId ?? undefined,
        accountRef: meta.billingAccountId ?? undefined,
        status: sub.status,
      };
    }

    // Invoice events: extract the subscription id best-effort across API shapes.
    // Current versions expose it on `parent.subscription_details`; older ones on a
    // top-level `subscription`; a line item's parent carries it in both. An invoice
    // we cannot tie to a subscription is genuinely unactionable and is ignored —
    // but payment recovery depends on this resolving, so all three are tried.
    const invoice = object as unknown as Stripe.Invoice & {
      subscription?: string | { id: string } | null;
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
    };
    const lineSubscription = invoice.lines?.data?.reduce<string | null>((found, line) => {
      if (found) return found;
      const parent = (line as unknown as {
        subscription?: string | { id: string } | null;
        parent?: { subscription_item_details?: { subscription?: string | { id: string } | null } | null } | null;
      }) ?? {};
      return idOf(parent.subscription) ?? idOf(parent.parent?.subscription_item_details?.subscription);
    }, null);
    const subscriptionRef =
      idOf(invoice.subscription) ??
      idOf(invoice.parent?.subscription_details?.subscription) ??
      lineSubscription ??
      undefined;
    return {
      ...base,
      customerRef: idOf(invoice.customer) ?? undefined,
      subscriptionRef,
    };
  }
}
