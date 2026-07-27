/**
 * PII-safe structured logging for the billing lifecycle (§22).
 *
 * PRIVACY CONTRACT: a billing log record may ONLY carry the fields on
 * {@link SafeBillingMeta}. The emitter runs every record through the allow-list,
 * so a caller can never leak card data, payment-method data, a full webhook
 * payload, a customer email, an address, CV/JD content, a secret or a webhook
 * signature. User ids are hashed to a short stable token; provider *customer* and
 * *subscription* ids are never logged — only our internal purchase/account ids
 * and the opaque provider *event* id.
 */
import { createHash } from 'node:crypto';
import { hashUserId } from '@/shared/services/reservation-observability';
import type { BillingErrorCode } from './errors';

/**
 * A short, stable, non-reversible token for a provider reference (subscription or
 * customer id). Lets an operator correlate every log line belonging to one Stripe
 * subscription without the raw provider id — which the privacy contract forbids —
 * ever reaching a log sink.
 */
export function hashProviderRef(ref: string): string {
  return createHash('sha256').update(ref).digest('hex').slice(0, 12);
}

/** The fixed billing-lifecycle vocabulary (enumerated so a typo fails to compile). */
export type BillingLogEvent =
  | 'checkout_started'
  | 'checkout_session_created'
  | 'checkout_reused'
  | 'checkout_blocked_already_subscribed'
  | 'webhook_received'
  | 'webhook_verified'
  | 'webhook_signature_invalid'
  | 'webhook_duplicate'
  | 'webhook_ignored'
  | 'webhook_processed'
  | 'webhook_failed'
  | 'webhook_stale_event'
  | 'webhook_conflict_detected'
  | 'webhook_conflict_recovered'
  | 'purchase_sync_applied'
  | 'cancellation_scheduled_detected'
  | 'purchase_created'
  | 'purchase_updated'
  | 'access_upgraded'
  | 'access_downgraded'
  | 'grace_started'
  | 'payment_recovered'
  | 'portal_session_created'
  | 'cancellation_scheduled'
  | 'unknown_provider_price'
  | 'ownership_conflict';

/**
 * The ONLY metadata a billing log line may carry. Every field is non-sensitive by
 * construction: a hash, an internal id, a provider label, an event id/type, an
 * offer/plan id, an internal status, a duration or a safe error code.
 */
export interface SafeBillingMeta {
  /** Hashed, non-reversible user token. */
  userHash?: string;
  /** Internal billing-account id (ours, not the provider's customer id). */
  billingAccountId?: string;
  /** Internal purchase id (ours, not the provider's subscription id). */
  purchaseId?: string;
  /** Coarse provider label, e.g. "STRIPE". */
  provider?: string;
  /** Provider's opaque event id (idempotency key) — safe to correlate on. */
  providerEventId?: string;
  /** Provider event type string, e.g. "customer.subscription.updated". */
  eventType?: string;
  /** Server allow-listed offer id, e.g. "PRO_MONTHLY". */
  offerId?: string;
  /** Product plan id, e.g. "PRO". */
  planId?: string;
  /** Internal, provider-neutral purchase status. */
  status?: string;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Safe billing error code — never a raw provider message. */
  errorCode?: BillingErrorCode | string;
  /** Coarse outcome for a webhook receipt: 'processed' | 'ignored' | 'failed' | 'duplicate'. */
  outcome?: string;
  /** Database error code (e.g. Prisma 'P2002'/'P2034') — a code, never a message. */
  dbErrorCode?: string;
  /** Which convergence conflict occurred, e.g. 'unique_subscription'. */
  conflictCategory?: string;
  /** Hashed provider subscription reference — correlatable, non-reversible. */
  subscriptionHash?: string;
  /** Hashed provider customer reference — correlatable, non-reversible. */
  customerHash?: string;
  /** 1-based convergence attempt number for this event. */
  attempt?: number;
  /** Whether this sync created the purchase or converged onto an existing one. */
  mutation?: string;
  /** Provider timestamp of the event being applied (ISO). A time, never a payload. */
  occurredAt?: string;
  /** The `lastEventAt` already stored on the purchase when this event was applied (ISO). */
  storedLastEventAt?: string;
  /** The scheduled-cancellation flag this snapshot mapped to. */
  cancelAtPeriodEnd?: boolean;
  /** The period end this snapshot mapped to (ISO). */
  currentPeriodEnd?: string;
  /** Why an event was, or was not, treated as stale. */
  staleDecision?: string;
  /**
   * Which lookup established the owning account — 'metadata_account',
   * 'metadata_user', 'purchase_customer' or 'account_customer'. A label, never an
   * id: it tells an operator whether an event resolved from checkout metadata or
   * from the customer binding (the path invoice events depend on).
   */
  accountSource?: string;
}

const ALLOWED_KEYS: ReadonlyArray<keyof SafeBillingMeta> = [
  'userHash',
  'billingAccountId',
  'purchaseId',
  'provider',
  'providerEventId',
  'eventType',
  'offerId',
  'planId',
  'status',
  'durationMs',
  'errorCode',
  'outcome',
  'dbErrorCode',
  'conflictCategory',
  'subscriptionHash',
  'customerHash',
  'attempt',
  'mutation',
  'occurredAt',
  'storedLastEventAt',
  'cancelAtPeriodEnd',
  'currentPeriodEnd',
  'staleDecision',
  'accountSource',
];

function sanitize(meta: Record<string, unknown>): SafeBillingMeta {
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const value = meta[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return safe as SafeBillingMeta;
}

export type BillingLogSink = (record: Record<string, unknown>) => void;

const defaultSink: BillingLogSink = (record) => {
  const level = record.severity === 'error' ? 'error' : record.severity === 'warn' ? 'warn' : 'info';
  console[level](`[billing] ${JSON.stringify(record)}`);
};

let sink: BillingLogSink = defaultSink;

/** Swap the sink (tests). Returns a restore function. */
export function __setBillingLogSink(next: BillingLogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

const WARN_EVENTS = new Set<BillingLogEvent>([
  'webhook_signature_invalid',
  'webhook_failed',
  'webhook_stale_event',
  'webhook_conflict_detected',
  'access_downgraded',
  'grace_started',
  'unknown_provider_price',
  'ownership_conflict',
]);

/**
 * Emit one billing lifecycle event. Accepts a possibly-unsafe metadata bag and
 * sanitizes it; a caller may pass `userId` and it is hashed into `userHash` (the
 * raw id is dropped).
 */
export function logBillingEvent(
  event: BillingLogEvent,
  meta: SafeBillingMeta & { userId?: string } = {}
): void {
  const { userId, ...rest } = meta;
  const safe = sanitize(rest as Record<string, unknown>);
  if (userId && !safe.userHash) safe.userHash = hashUserId(userId);
  sink({
    evt: event,
    severity: WARN_EVENTS.has(event) ? 'warn' : 'info',
    ...safe,
  });
}
