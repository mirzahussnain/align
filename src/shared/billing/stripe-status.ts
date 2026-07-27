/**
 * Stripe subscription-status → provider-neutral BillingPurchaseStatus mapping
 * (§13). This is the ONLY place a raw Stripe status string is interpreted; nothing
 * outside the adapter/sync layer ever sees a Stripe status. Kept in its own module
 * so both the adapter and its tests share exactly one table.
 */
import type { BillingPurchaseStatus } from '@/generated/prisma/client';

/** Stripe's subscription status union for the pinned API version. */
export type StripeSubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid';

const STATUS_MAP: Record<StripeSubscriptionStatus, BillingPurchaseStatus> = {
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  unpaid: 'UNPAID',
  canceled: 'CANCELLED',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'INCOMPLETE_EXPIRED',
  // Conservative policy (§13): a paused subscription grants no new paid access.
  // Mapped to UNPAID (a non-granting status the resolver treats as Free) rather
  // than to any grace/active state.
  paused: 'UNPAID',
};

/**
 * Map a Stripe subscription status to the internal status. An unknown/unsupported
 * status fails conservatively to `INCOMPLETE` — a non-granting, diagnosable state
 * that grants no paid access (§13).
 */
export function mapStripeSubscriptionStatus(status: string): BillingPurchaseStatus {
  return STATUS_MAP[status as StripeSubscriptionStatus] ?? 'INCOMPLETE';
}

/** Whether the internal status is one this domain recognises as a real state. */
export function isKnownStripeStatus(status: string): status is StripeSubscriptionStatus {
  return status in STATUS_MAP;
}
