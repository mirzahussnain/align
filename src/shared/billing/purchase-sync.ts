/**
 * Provider-neutral purchase synchronisation (§11, §12, §14, §15).
 *
 * A verified event is reduced to a {@link ProviderPurchaseSnapshot} (already
 * mapped to internal status by the adapter) plus its occurrence time, and this
 * service reconciles the owning {@link BillingPurchase} row. It is the single
 * place a provider subscription becomes internal access state:
 *
 *  - resolves the owning billing account (never cross-user);
 *  - maps the provider price to a KNOWN offer (an unknown price grants nothing);
 *  - applies status/period/cancellation/grace transitions;
 *  - rejects stale/out-of-order events using `lastEventAt`.
 *
 * CONVERGENCE. Stripe emits several DISTINCT events for one subscription
 * (`checkout.session.completed`, `customer.subscription.created`,
 * `customer.subscription.updated`, `invoice.paid`) with different event ids, often
 * delivered concurrently. Event-id idempotency alone therefore cannot stop two of
 * them racing to create the same purchase. {@link syncProviderPurchase} is the one
 * authoritative operation they all funnel through: it takes a subscription-scoped
 * advisory lock, looks the purchase up by subscription id (then by a
 * checkout-linked purchase reference), and updates rather than creates whenever a
 * row already exists. The unique constraints remain the final backstop — a loser
 * of a race raises P2002, which the caller classifies via
 * {@link classifyPurchaseConflict} and recovers by re-running the whole operation,
 * which then finds the winner and applies the intended update.
 *
 * It performs NO network calls and holds NO Stripe types — the adapter fetched the
 * authoritative snapshot outside the transaction; this runs inside it.
 */
import type { Prisma, BillingPurchase, BillingPurchaseStatus } from '@/generated/prisma/client';
import type { ProviderPurchaseSnapshot } from './provider-contract';
import type { BillingProviderId } from './provider-contract';
import { getServerPriceId } from './env';
import { BILLING_OFFERS, type BillingOfferDefinition } from './offers';
import { BILLING_GRACE_PERIOD_DAYS } from './config';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SyncOutcome = 'processed' | 'ignored' | 'failed';

export interface SyncResult {
  outcome: SyncOutcome;
  /** Machine reason for an ignored/failed sync, for the receipt + logs. */
  reason?:
    | 'stale_event'
    | 'unknown_price'
    | 'ownership_conflict'
    | 'purchase_ref_conflict'
    | 'account_not_found'
    | 'no_subscription';
  purchaseId?: string;
  planId?: string;
  status?: BillingPurchaseStatus;
  /** Direction of the effective access change this sync caused, for logging. */
  accessChange?: 'upgraded' | 'downgraded' | 'unchanged';
  /** Whether this sync inserted the row or converged onto an existing one. */
  mutation?: 'created' | 'updated';
  /** Which lookup established the owning account, for diagnosing a no-access event. */
  accountSource?: AccountResolutionSource;
  /** True when this sync closed an open grace window by restoring paid status. */
  paymentRecovered?: boolean;
  /**
   * What the sync decided and wrote, for diagnosable logging. Populated whenever
   * a purchase was located, including on an ignored/failed outcome, so a dropped
   * event can be explained without re-reading the database.
   */
  diagnostics?: {
    /** `lastEventAt` already on the row when this event arrived. */
    storedLastEventAt?: Date | null;
    /** Whether this event was older than, equal to, or newer than that. */
    staleDecision: 'no_prior_event' | 'applied_newer' | 'applied_equal' | 'rejected_older';
    /** The scheduled-cancellation flag the snapshot mapped to. */
    cancelAtPeriodEnd?: boolean;
    /** The period end the snapshot mapped to. */
    currentPeriodEnd?: Date | null;
    /** True when this sync flipped the stored cancellation flag on. */
    cancellationScheduled?: boolean;
  };
}

// ── Concurrency conflict classification ───────────────────────────────────────

/**
 * The kind of database conflict a concurrent webhook produced. Deliberately
 * narrow: only these are safe to recover from by re-running the sync. Anything
 * else propagates, so an ownership or unknown-price failure is never hidden.
 */
export type PurchaseConflictCategory =
  | 'unique_subscription'
  | 'unique_purchase'
  | 'unique_event_receipt'
  | 'unique_other'
  | 'serialization';

/** The Prisma error code (`P2002`, `P2034`, …) of a known request error, if any. */
export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : undefined;
}

/**
 * The constraint columns a P2002 names. Prisma reports this in two different
 * shapes: `meta.target` on the classic engine, and — with the pg driver adapter
 * this app uses — nested under `meta.driverAdapterError.cause.constraint`, where
 * `meta.target` is absent entirely. Both are read so the logged conflict category
 * is accurate on the real stack, not just in unit tests.
 */
function conflictTarget(error: unknown): string {
  const meta = (error as { meta?: Record<string, unknown> } | null)?.meta;
  if (!meta) return '';

  const target = meta.target;
  if (Array.isArray(target)) return target.map(String).join(',');
  if (typeof target === 'string') return target;

  const constraint = (
    meta.driverAdapterError as { cause?: { constraint?: { fields?: unknown; index?: unknown } } } | undefined
  )?.cause?.constraint;
  if (Array.isArray(constraint?.fields)) return constraint.fields.map(String).join(',');
  if (typeof constraint?.index === 'string') return constraint.index;
  return '';
}

/**
 * Classify a transaction failure as a recoverable convergence conflict, or null
 * when it is something else entirely (which must NOT be swallowed). `P2002` is a
 * unique clash — another valid event created the same row milliseconds earlier;
 * `P2034` is a write conflict / deadlock the database asked us to retry.
 */
export function classifyPurchaseConflict(error: unknown): PurchaseConflictCategory | null {
  const code = prismaErrorCode(error);
  if (code === 'P2034') return 'serialization';
  if (code !== 'P2002') return null;
  const target = conflictTarget(error);
  if (target.includes('providerSubscriptionId')) return 'unique_subscription';
  if (target.includes('providerPurchaseId')) return 'unique_purchase';
  if (target.includes('providerEventId')) return 'unique_event_receipt';
  return 'unique_other';
}

/**
 * The offer whose configured provider price id matches `priceId`, or undefined.
 * Reads the price id from server env (never a committed literal), so an event
 * carrying a price we do not sell resolves to nothing and grants no access.
 */
export function offerForProviderPrice(
  provider: BillingProviderId,
  priceId: string
): BillingOfferDefinition | undefined {
  for (const offer of Object.values(BILLING_OFFERS) as BillingOfferDefinition[]) {
    const envKey = offer.providerPriceEnvKeys[provider];
    if (!envKey) continue;
    let configured: string | undefined;
    try {
      configured = getServerPriceId(envKey);
    } catch {
      continue; // price not configured in this environment
    }
    if (configured === priceId) return offer;
  }
  return undefined;
}

export interface SyncParams {
  provider: BillingProviderId;
  snapshot: ProviderPurchaseSnapshot;
  /** Internal user id from provider metadata, when the event carried it. */
  userRef?: string;
  /** Internal billing-account id from provider metadata, when present. */
  accountRef?: string;
  /**
   * A checkout-session (or equivalent) reference the event carried. Used ONLY as
   * a secondary lookup key so a purchase already linked to that checkout converges
   * onto the same row instead of being duplicated. Never used to resolve ownership.
   */
  checkoutRef?: string;
  occurredAt: Date;
  now?: Date;
}

/** Namespace for the subscription-scoped advisory lock (mirrors the reservation ledger). */
const PURCHASE_LOCK_NAMESPACE = 'billing:purchase';

/**
 * Serialise ALL purchase reconciliation for one (provider, subscription) pair for
 * the life of the transaction. Two webhooks describing the same subscription block
 * here until the first commits, so the find-then-create below cannot race. This is
 * the same `pg_advisory_xact_lock(hashtext, hashtext)` pattern the reservation
 * ledger uses; a `hashtext` collision only ever over-serialises unrelated
 * subscriptions, which is never a correctness problem.
 *
 * `$executeRawUnsafe` (not `$queryRawUnsafe`): the lock function returns void,
 * which the query path cannot deserialize.
 */
export async function acquirePurchaseLock(
  tx: Prisma.TransactionClient,
  provider: BillingProviderId,
  subscriptionId: string
): Promise<void> {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    PURCHASE_LOCK_NAMESPACE,
    `${provider}:${subscriptionId}`
  );
}

/**
 * THE authoritative convergent synchronisation operation. Every provider event
 * that describes a subscription — checkout completion, subscription created /
 * updated / deleted, invoice paid / failed — goes through this and only this.
 *
 * Must be called inside a transaction: the advisory lock is transaction-scoped, so
 * it is released exactly when the purchase mutation commits or rolls back. The
 * caller fetches the provider snapshot BEFORE opening the transaction, so no
 * network call is ever made while the lock is held.
 */
export async function syncProviderPurchase(
  tx: Prisma.TransactionClient,
  params: SyncParams
): Promise<SyncResult> {
  const { snapshot } = params;
  const subscriptionId = snapshot.providerSubscriptionId ?? snapshot.providerPurchaseId;
  if (!subscriptionId) return { outcome: 'ignored', reason: 'no_subscription' };

  await acquirePurchaseLock(tx, params.provider, subscriptionId);
  return syncPurchaseFromSnapshot(tx, params);
}

/** Whether a status grants paid access (used to log upgrade/downgrade direction). */
function grantsAccess(status: BillingPurchaseStatus, cancelAtPeriodEnd: boolean, periodEnd: Date | null, graceEnd: Date | null, now: Date): boolean {
  switch (status) {
    case 'ACTIVE':
    case 'TRIALING':
      return true;
    case 'CANCELLED':
      return periodEnd != null && periodEnd > now;
    case 'PAST_DUE':
      return graceEnd != null && graceEnd > now;
    default:
      return false;
  }
}

/**
 * Locate the purchase this snapshot belongs to, in convergence order:
 *
 *  1. `provider + providerSubscriptionId` — the authoritative identity of a
 *     recurring purchase. Every subscription-derived event resolves here, which is
 *     what makes distinct Stripe events converge on one row.
 *  2. `provider + providerPurchaseId` against any reference this event carries
 *     (the snapshot's purchase id, and a checkout-session link) — catches a row
 *     written before the subscription id was known.
 *
 * A step-2 match already bound to a DIFFERENT subscription is NOT adopted: that is
 * a genuine identity conflict, reported rather than silently re-homed or blindly
 * re-created into a guaranteed unique violation.
 */
async function findConvergentPurchase(
  tx: Prisma.TransactionClient,
  params: SyncParams,
  subscriptionId: string
): Promise<{ purchase: BillingPurchase | null; conflict?: true }> {
  const { provider, snapshot } = params;

  const bySubscription = await tx.billingPurchase.findFirst({
    where: { provider, providerSubscriptionId: subscriptionId },
  });
  if (bySubscription) return { purchase: bySubscription };

  const purchaseRefs = [...new Set([snapshot.providerPurchaseId, params.checkoutRef])].filter(
    (ref): ref is string => typeof ref === 'string' && ref.length > 0
  );
  if (purchaseRefs.length === 0) return { purchase: null };

  const byPurchaseRef = await tx.billingPurchase.findFirst({
    where: { provider, providerPurchaseId: { in: purchaseRefs } },
  });
  if (!byPurchaseRef) return { purchase: null };
  if (byPurchaseRef.providerSubscriptionId && byPurchaseRef.providerSubscriptionId !== subscriptionId) {
    return { purchase: null, conflict: true };
  }
  return { purchase: byPurchaseRef };
}

/** Which lookup in the ownership ladder resolved the account. */
export type AccountResolutionSource =
  /** `billingAccountId` carried in trusted provider metadata. */
  | 'metadata_account'
  /** `userId` carried in trusted provider metadata. */
  | 'metadata_user'
  /** A BillingPurchase already bound to this provider customer. */
  | 'purchase_customer'
  /** The BillingAccount the provider customer was bound to at first checkout. */
  | 'account_customer';

interface AccountResolution {
  accountId: string | null;
  source?: AccountResolutionSource;
  /** The event's claimed owner disagrees with the customer's stored binding. */
  crossUserConflict?: true;
}

/**
 * Resolve WHICH account this event's subscription belongs to.
 *
 * Invoice events are the reason this is a ladder rather than a metadata read.
 * `checkout.session.completed` and `customer.subscription.*` carry `userId` /
 * `billingAccountId` in metadata; `invoice.paid` and `invoice.payment_failed`
 * carry NEITHER — only a customer and a subscription. So an invoice event that
 * beats the checkout/subscription events (routine: Stripe emits them in parallel)
 * has nothing but the customer to identify the owner with. Lookup order:
 *
 *  1. the purchase already bound to this subscription — handled by the caller via
 *     {@link findConvergentPurchase}; its account is the incumbent owner;
 *  2. a purchase already bound to this provider CUSTOMER;
 *  3. the BillingAccount bound to that customer. Checkout persists the customer on
 *     the account BEFORE the session is created (see `startCheckout`), so this
 *     resolves even when no purchase row exists yet — this is the step whose
 *     absence made an early `invoice.paid` fail with `account_not_found`;
 *  4. the trusted metadata the event carried.
 *
 * Steps 2–3 read the customer's STORED, server-established binding; step 4 is the
 * event's CLAIM. They are resolved independently and then compared, so a claim
 * naming a different account than the customer is already bound to is a cross-user
 * conflict — refused, never silently re-homed. Both metadata forms are validated
 * against a real row, so a stale or bogus id resolves to nothing (and falls
 * through to the customer binding) rather than masquerading as a conflict.
 */
async function resolveEventAccount(
  tx: Prisma.TransactionClient,
  params: SyncParams
): Promise<AccountResolution> {
  const { provider, snapshot } = params;

  // ── (2) + (3): the account this provider customer is already bound to ────────
  // The customer comes from the LIVE subscription snapshot, never from the event
  // payload, so it is as trustworthy as the subscription read itself.
  const customerId = snapshot.providerCustomerId ?? null;
  let customerAccountId: string | null = null;
  let customerSource: AccountResolutionSource | undefined;
  if (customerId) {
    const byPurchase = await tx.billingPurchase.findFirst({
      where: { provider, providerCustomerId: customerId },
      select: { billingAccountId: true },
    });
    if (byPurchase) {
      customerAccountId = byPurchase.billingAccountId;
      customerSource = 'purchase_customer';
    } else {
      const byAccount = await tx.billingAccount.findFirst({
        where: { provider, providerCustomerId: customerId },
        select: { id: true },
      });
      if (byAccount) {
        customerAccountId = byAccount.id;
        customerSource = 'account_customer';
      }
    }
  }

  // ── (4): the ownership the event itself claims, via provider metadata ────────
  let claimedAccountId: string | null = null;
  let claimedSource: AccountResolutionSource | undefined;
  if (params.accountRef) {
    const byId = await tx.billingAccount.findUnique({ where: { id: params.accountRef }, select: { id: true } });
    if (byId) {
      claimedAccountId = byId.id;
      claimedSource = 'metadata_account';
    }
  }
  if (!claimedAccountId && params.userRef) {
    const byUser = await tx.billingAccount.findUnique({ where: { userId: params.userRef }, select: { id: true } });
    if (byUser) {
      claimedAccountId = byUser.id;
      claimedSource = 'metadata_user';
    }
  }

  // A customer already bound to a DIFFERENT account is never re-homed by a claim.
  if (claimedAccountId && customerAccountId && claimedAccountId !== customerAccountId) {
    return { accountId: null, crossUserConflict: true };
  }

  if (claimedAccountId) return { accountId: claimedAccountId, source: claimedSource };
  if (customerAccountId) return { accountId: customerAccountId, source: customerSource };
  return { accountId: null };
}

/**
 * Reconcile the purchase for a snapshot, inside the caller's transaction. Returns
 * a structured outcome; only genuinely unexpected DB errors throw.
 *
 * Prefer {@link syncProviderPurchase}, which wraps this in the subscription-scoped
 * lock that makes concurrent events converge. This entry point stays exported for
 * callers that already hold the lock and for direct reconciliation tests.
 */
export async function syncPurchaseFromSnapshot(
  tx: Prisma.TransactionClient,
  params: SyncParams
): Promise<SyncResult> {
  const { provider, snapshot, occurredAt } = params;
  const now = params.now ?? new Date();

  const subscriptionId = snapshot.providerSubscriptionId ?? snapshot.providerPurchaseId;
  if (!subscriptionId) return { outcome: 'ignored', reason: 'no_subscription' };

  // ── Offer / plan mapping ─────────────────────────────────────────────────────
  const priceId = snapshot.providerPriceId ?? undefined;
  const offer = priceId ? offerForProviderPrice(provider, priceId) : undefined;
  if (!offer) {
    // An unmapped price must grant nothing and stay diagnosable (§11).
    return { outcome: 'failed', reason: 'unknown_price' };
  }

  // ── Locate the one purchase this subscription converges onto ─────────────────
  const located = await findConvergentPurchase(tx, params, subscriptionId);
  if (located.conflict) return { outcome: 'failed', reason: 'purchase_ref_conflict' };
  const existing = located.purchase;

  // The account the EVENT points to. Resolved independently of the existing
  // purchase so an event claiming a different owner is detectable as a conflict
  // rather than silently adopting the existing owner.
  const resolved = await resolveEventAccount(tx, params);

  // ── Ownership: a subscription can never be reassigned across accounts ─────────
  // Two ways this is violated, both refused with no access granted: the event
  // claims an owner other than the one the provider customer is already bound to,
  // or it names an account other than the one already owning this subscription.
  if (resolved.crossUserConflict) {
    return { outcome: 'failed', reason: 'ownership_conflict', ...(existing ? { purchaseId: existing.id } : {}) };
  }
  const eventAccountId = resolved.accountId;
  if (existing && eventAccountId && existing.billingAccountId !== eventAccountId) {
    return { outcome: 'failed', reason: 'ownership_conflict', purchaseId: existing.id };
  }

  const billingAccountId = existing?.billingAccountId ?? eventAccountId;
  if (!billingAccountId) {
    // An unrecognised customer with no purchase, no account binding and no
    // metadata: nothing to grant access to. Diagnosable, and safe to acknowledge —
    // retrying will not make an unknown customer resolvable.
    return { outcome: 'ignored', reason: 'account_not_found' };
  }

  // No separate existence check is needed here: every branch of the ladder above
  // resolves to a row that was actually read — metadata ids are validated against
  // a BillingAccount, and the customer/incumbent branches come from stored,
  // FK-backed rows — so `billingAccountId` can never be a dangling reference.

  // ── Stale/out-of-order guard ─────────────────────────────────────────────────
  // ORDERING RULE: only a STRICTLY older event is rejected. An event whose
  // provider timestamp EQUALS `lastEventAt` is applied — Stripe stamps events at
  // one-second resolution, so a portal action that emits two events (and a burst
  // that lands in the same second as a previous one) routinely produces equal
  // timestamps. Treating equal as stale would silently drop a real state change.
  //
  // Rejecting a strictly older event is safe only because the snapshot is the LIVE
  // subscription: a newer event has already been applied from an equally-live read,
  // so the older one carries nothing the row does not already have.
  const storedLastEventAt = existing?.lastEventAt ?? null;
  const staleDecision = !storedLastEventAt
    ? 'no_prior_event'
    : occurredAt < storedLastEventAt
      ? 'rejected_older'
      : occurredAt.getTime() === storedLastEventAt.getTime()
        ? 'applied_equal'
        : 'applied_newer';

  if (staleDecision === 'rejected_older') {
    return {
      outcome: 'ignored',
      reason: 'stale_event',
      purchaseId: existing!.id,
      diagnostics: { storedLastEventAt, staleDecision },
    };
  }

  const status = (snapshot.status as BillingPurchaseStatus) ?? 'INCOMPLETE';
  const periodStart = snapshot.currentPeriodStart ?? null;
  const periodEnd = snapshot.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd = snapshot.cancelAtPeriodEnd ?? false;
  const trialEndsAt = snapshot.trialEndsAt ?? null;

  // Grace (§15): entering PAST_DUE opens a fixed grace window from the period end
  // (or now); recovering to ACTIVE clears it. Preserve an already-open grace end.
  let graceEndsAt: Date | null = existing?.graceEndsAt ?? null;
  if (status === 'PAST_DUE') {
    graceEndsAt = graceEndsAt ?? new Date((periodEnd ?? now).getTime() + BILLING_GRACE_PERIOD_DAYS * DAY_MS);
  } else if (status === 'ACTIVE' || status === 'TRIALING') {
    graceEndsAt = null;
  }

  const cancelledAt = status === 'CANCELLED' ? existing?.cancelledAt ?? now : existing?.cancelledAt ?? null;
  const expiredAt =
    status === 'EXPIRED' || status === 'INCOMPLETE_EXPIRED' ? existing?.expiredAt ?? now : existing?.expiredAt ?? null;

  const data = {
    provider,
    arrangement: 'RECURRING' as const,
    offerId: offer.id,
    planId: offer.planId,
    status,
    providerCustomerId: snapshot.providerCustomerId ?? existing?.providerCustomerId ?? null,
    providerPurchaseId: snapshot.providerPurchaseId,
    providerSubscriptionId: subscriptionId,
    providerPriceId: priceId ?? existing?.providerPriceId ?? null,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    accessStartsAt: periodStart,
    accessEndsAt: periodEnd,
    cancelAtPeriodEnd,
    trialEndsAt,
    graceEndsAt,
    cancelledAt,
    expiredAt,
    lastEventAt: occurredAt,
  };

  const beforeAccess = existing
    ? grantsAccess(existing.status, existing.cancelAtPeriodEnd, existing.currentPeriodEnd, existing.graceEndsAt, now)
    : false;
  const afterAccess = grantsAccess(status, cancelAtPeriodEnd, periodEnd, graceEndsAt, now);
  const accessChange = afterAccess === beforeAccess ? 'unchanged' : afterAccess ? 'upgraded' : 'downgraded';

  // Payment recovery (§15): an open grace window closed by a return to paid status.
  const paymentRecovered =
    existing != null &&
    existing.graceEndsAt != null &&
    graceEndsAt == null &&
    (status === 'ACTIVE' || status === 'TRIALING');

  // Update when a row already exists — created by ANY earlier event for this same
  // subscription — and create only when nothing matched. Under the advisory lock
  // this decision cannot race; if the lock was unavailable, the unique constraints
  // turn the loser into a P2002 the caller re-runs (see classifyPurchaseConflict).
  const purchase = existing
    ? await tx.billingPurchase.update({ where: { id: existing.id }, data })
    : await tx.billingPurchase.create({ data: { ...data, billingAccountId } });

  return {
    outcome: 'processed',
    purchaseId: purchase.id,
    planId: offer.planId,
    status,
    accessChange,
    mutation: existing ? 'updated' : 'created',
    ...(resolved.source ? { accountSource: resolved.source } : {}),
    ...(paymentRecovered ? { paymentRecovered: true } : {}),
    diagnostics: {
      storedLastEventAt,
      staleDecision,
      cancelAtPeriodEnd,
      currentPeriodEnd: periodEnd,
      cancellationScheduled: cancelAtPeriodEnd && existing?.cancelAtPeriodEnd !== true,
    },
  };
}
