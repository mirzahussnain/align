/**
 * Provider-neutral billing webhook handler (§8, §9, §10, §26).
 *
 * The route's only jobs are to read the raw body and hand it to the adapter for
 * signature verification; ALL business logic lives here, keyed off the resulting
 * {@link VerifiedBillingEvent}. The flow is:
 *
 *   verify event
 *   → idempotency receipt pre-check (terminal receipt ⇒ duplicate, no work)
 *   → resolve the subscription and fetch its LIVE snapshot (outside any tx)
 *   → transaction: subscription-scoped advisory lock
 *                  → find/create/update the one BillingPurchase
 *                  → finalise the BillingEventReceipt
 *   → 2xx  (lock released with the commit)
 *
 * CONVERGENCE, not ordering. Stripe emits `checkout.session.completed`,
 * `customer.subscription.created`, `customer.subscription.updated` and
 * `invoice.paid` for the SAME subscription under different event ids, frequently
 * in parallel. Per-event idempotency therefore cannot prevent two of them racing
 * to create the same purchase — it only stops the same event being applied twice.
 * Two mechanisms make the outcome convergent instead:
 *
 *  1. every event funnels through {@link syncProviderPurchase}, which holds a
 *     (provider, subscription) advisory lock and UPDATES whatever row exists;
 *  2. if a race still slips past (lock contention resolved the other way, a
 *     replica, a non-locking path), the unique constraints reject the loser with
 *     P2002 — which is classified as a convergence conflict and RECOVERED by
 *     re-running the whole operation, which now finds the winner and updates it.
 *
 * A losing event is therefore never a 500. Only a genuinely unexpected failure —
 * or one we want the provider to retry, like an unreachable provider — is 5xx.
 *
 * Fetching the LIVE subscription (rather than trusting the event's embedded
 * object) is what makes arrival order irrelevant: whichever event lands last
 * applies the newest state, and the `lastEventAt` stale-guard in the sync stops an
 * older event from regressing it.
 */
import { prisma } from '@/shared/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import type { BillingProviderAdapter, VerifiedBillingEvent } from './provider-contract';
import { BillingError } from './errors';
import {
  syncProviderPurchase,
  classifyPurchaseConflict,
  prismaErrorCode,
  type SyncResult,
  type PurchaseConflictCategory,
} from './purchase-sync';
import { logBillingEvent, hashProviderRef, type SafeBillingMeta } from './logging';

export interface WebhookProcessResult {
  /** HTTP status the route should return to the provider. */
  status: number;
  outcome: 'processed' | 'ignored' | 'duplicate' | 'failed';
}

/**
 * How many times one event may re-run its convergence transaction. A conflict is
 * resolved by the FIRST re-read (the winner is committed by then), so two attempts
 * suffice in practice; the third is headroom for a three-way delivery burst. The
 * loop is bounded so a genuine, permanent constraint problem still surfaces as a
 * failure rather than spinning.
 */
const MAX_CONVERGENCE_ATTEMPTS = 3;

/** Receipt outcomes that are terminal — a re-delivery must not reprocess them. */
function isTerminal(outcome: string): boolean {
  return outcome === 'processed' || outcome === 'ignored';
}

/**
 * Either the top-level client or a transaction client. A receipt written for a
 * successful sync MUST use the transaction client so receipt state and purchase
 * mutation commit together; a receipt recording a FAILURE uses the top-level
 * client, because the transaction it describes has already rolled back.
 */
type ReceiptClient = {
  billingEventReceipt: Pick<Prisma.TransactionClient['billingEventReceipt'], 'upsert'>;
};

async function upsertReceipt(
  event: VerifiedBillingEvent,
  outcome: string,
  extra: { purchaseId?: string | null; errorCode?: string | null },
  client: ReceiptClient = prisma
): Promise<void> {
  const data = {
    eventType: event.type,
    occurredAt: event.occurredAt,
    processedAt: new Date(),
    outcome,
    purchaseId: extra.purchaseId ?? null,
    errorCode: extra.errorCode ?? null,
  };
  await client.billingEventReceipt.upsert({
    where: { provider_providerEventId: { provider: event.provider, providerEventId: event.providerEventId } },
    create: { provider: event.provider, providerEventId: event.providerEventId, ...data },
    update: data,
  });
}

/**
 * Process one verified event. Never throws for an expected business outcome — it
 * records a diagnosable receipt and returns a safe status; only an unexpected
 * failure to fetch/persist yields a 5xx so the provider retries.
 */
export async function processVerifiedEvent(
  event: VerifiedBillingEvent,
  adapter: BillingProviderAdapter
): Promise<WebhookProcessResult> {
  const logBase: SafeBillingMeta = {
    provider: event.provider,
    providerEventId: event.providerEventId,
    eventType: event.type,
    ...(event.customerRef ? { customerHash: hashProviderRef(event.customerRef) } : {}),
  };

  // ── Idempotency: a terminal receipt means we already handled this event ───────
  // Only 'failed' is re-processable, so a provider retry of the event that lost a
  // race is picked up here and driven to a terminal outcome.
  const prior = await prisma.billingEventReceipt.findUnique({
    where: { provider_providerEventId: { provider: event.provider, providerEventId: event.providerEventId } },
    select: { outcome: true },
  });
  if (prior && isTerminal(prior.outcome)) {
    logBillingEvent('webhook_duplicate', logBase);
    return { status: 200, outcome: 'duplicate' };
  }

  // ── Resolve the subscription this event concerns ─────────────────────────────
  const subscriptionId = event.subscriptionRef ?? event.purchaseRef;
  if (!subscriptionId) {
    await upsertReceipt(event, 'ignored', {});
    logBillingEvent('webhook_ignored', logBase);
    return { status: 200, outcome: 'ignored' };
  }
  const meta: SafeBillingMeta = { ...logBase, subscriptionHash: hashProviderRef(subscriptionId) };

  // ── Authoritative snapshot, fetched OUTSIDE any DB transaction (§26) ──────────
  // Never hold the subscription lock across a network call to the provider.
  let snapshot;
  try {
    snapshot = await adapter.getPurchase(subscriptionId);
  } catch (error) {
    const errorCode = error instanceof BillingError ? error.code : 'WEBHOOK_PROCESSING_FAILED';
    await upsertReceipt(event, 'failed', { errorCode });
    logBillingEvent('webhook_failed', { ...meta, errorCode });
    // A fetch failure is transient/config — let the provider retry.
    return { status: 500, outcome: 'failed' };
  }

  // ── Converge: lock → reconcile → receipt, with bounded conflict recovery ─────
  let result: SyncResult | undefined;
  let recoveredAfter = 0;
  for (let attempt = 1; attempt <= MAX_CONVERGENCE_ATTEMPTS; attempt++) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const syncResult = await syncProviderPurchase(tx, {
          provider: event.provider,
          snapshot,
          userRef: event.userRef,
          accountRef: event.accountRef,
          checkoutRef: event.checkoutRef,
          occurredAt: event.occurredAt,
        });
        const outcome =
          syncResult.outcome === 'processed' ? 'processed' : syncResult.outcome === 'failed' ? 'failed' : 'ignored';
        // The receipt is written in the SAME transaction as the purchase mutation,
        // so a receipt can never claim an outcome the purchase did not reach.
        await upsertReceipt(event, outcome, { purchaseId: syncResult.purchaseId, errorCode: syncResult.reason }, tx);
        return syncResult;
      });
      break;
    } catch (error) {
      const conflict: PurchaseConflictCategory | null = classifyPurchaseConflict(error);
      const dbErrorCode = prismaErrorCode(error);
      // Only a recognised convergence conflict is retried. Anything else — an
      // ownership or unknown-price refusal is already a structured result, not an
      // exception — propagates to the failure path below unhidden.
      if (conflict && attempt < MAX_CONVERGENCE_ATTEMPTS) {
        logBillingEvent('webhook_conflict_detected', { ...meta, conflictCategory: conflict, dbErrorCode, attempt });
        recoveredAfter = attempt;
        continue;
      }
      const errorCode = error instanceof BillingError ? error.code : 'WEBHOOK_PROCESSING_FAILED';
      await upsertReceipt(event, 'failed', { errorCode });
      logBillingEvent('webhook_failed', {
        ...meta,
        errorCode,
        ...(dbErrorCode ? { dbErrorCode } : {}),
        ...(conflict ? { conflictCategory: conflict } : {}),
        attempt,
      });
      return { status: 500, outcome: 'failed' };
    }
  }
  /* c8 ignore next */
  if (!result) return { status: 500, outcome: 'failed' };

  if (recoveredAfter > 0) {
    logBillingEvent('webhook_conflict_recovered', {
      ...meta,
      purchaseId: result.purchaseId,
      attempt: recoveredAfter + 1,
      mutation: result.mutation,
    });
  }

  // ── Log the effective transition, PII-safe ───────────────────────────────────
  const diag = result.diagnostics;
  const outMeta: SafeBillingMeta = {
    ...meta,
    purchaseId: result.purchaseId,
    planId: result.planId,
    status: result.status,
    ...(result.mutation ? { mutation: result.mutation } : {}),
    ...(result.accountSource ? { accountSource: result.accountSource } : {}),
    // Times and booleans only — enough to explain any sync decision from logs
    // alone, with no provider id and no payload.
    occurredAt: event.occurredAt.toISOString(),
    ...(diag?.storedLastEventAt ? { storedLastEventAt: diag.storedLastEventAt.toISOString() } : {}),
    ...(diag ? { staleDecision: diag.staleDecision } : {}),
    ...(diag?.cancelAtPeriodEnd != null ? { cancelAtPeriodEnd: diag.cancelAtPeriodEnd } : {}),
    ...(diag?.currentPeriodEnd ? { currentPeriodEnd: diag.currentPeriodEnd.toISOString() } : {}),
  };
  if (result.outcome === 'processed') {
    logBillingEvent('webhook_processed', outMeta);
    logBillingEvent('purchase_sync_applied', outMeta);
    // A newly-scheduled cancellation is the state most often reported missing —
    // log the transition explicitly so it is greppable.
    if (diag?.cancellationScheduled) logBillingEvent('cancellation_scheduled_detected', outMeta);
    logBillingEvent(result.mutation === 'created' ? 'purchase_created' : 'purchase_updated', outMeta);
    if (result.accessChange === 'upgraded') logBillingEvent('access_upgraded', outMeta);
    if (result.accessChange === 'downgraded') logBillingEvent('access_downgraded', outMeta);
    if (result.status === 'PAST_DUE') logBillingEvent('grace_started', outMeta);
    if (result.paymentRecovered) logBillingEvent('payment_recovered', outMeta);
    return { status: 200, outcome: 'processed' };
  }
  if (result.outcome === 'failed') {
    const failMeta = { ...outMeta, conflictCategory: result.reason };
    if (result.reason === 'unknown_price') logBillingEvent('unknown_provider_price', failMeta);
    else if (result.reason === 'ownership_conflict') logBillingEvent('ownership_conflict', failMeta);
    else logBillingEvent('webhook_failed', failMeta);
    // A safe business refusal (unknown price / ownership or identity conflict):
    // recorded and diagnosable, but retrying will not help, so acknowledge (2xx).
    return { status: 200, outcome: 'failed' };
  }
  if (result.reason === 'stale_event') logBillingEvent('webhook_stale_event', outMeta);
  // Carry the machine reason ('account_not_found', 'no_subscription') so an event
  // that granted nothing is diagnosable from the log line, not just the receipt.
  else logBillingEvent('webhook_ignored', { ...outMeta, ...(result.reason ? { errorCode: result.reason } : {}) });
  return { status: 200, outcome: 'ignored' };
}
