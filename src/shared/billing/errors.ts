/**
 * Provider-specific failures are mapped to these safe internal errors so no
 * provider SDK error object ever escapes the billing boundary. Routes and the UI
 * see stable codes and safe messages, never raw Stripe/Paddle error shapes or
 * messages (§23).
 */
export type BillingErrorCode =
  // ── Stage 1 boundary codes (still in use across the domain) ────────────────
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_NOT_ENABLED'
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN_OFFER'
  | 'UNKNOWN_PLAN'
  | 'UNSUPPORTED_PROVIDER'
  | 'PROVIDER_ERROR'
  // ── Stage 2 lifecycle codes ────────────────────────────────────────────────
  | 'BILLING_NOT_CONFIGURED'
  | 'INVALID_OFFER'
  | 'CHECKOUT_UNAVAILABLE'
  | 'ALREADY_SUBSCRIBED'
  | 'CUSTOMER_NOT_FOUND'
  | 'PORTAL_UNAVAILABLE'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'WEBHOOK_EVENT_UNSUPPORTED'
  | 'WEBHOOK_PROCESSING_FAILED'
  | 'UNKNOWN_PROVIDER_PRICE'
  | 'PURCHASE_OWNERSHIP_CONFLICT'
  | 'STALE_PROVIDER_EVENT'
  | 'BILLING_PROVIDER_UNAVAILABLE';

export class BillingError extends Error {
  readonly code: BillingErrorCode;

  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

/**
 * Safe, user-facing message per code — deliberately generic. The raw provider
 * message (which may leak ids, amounts or internal detail) is kept only in the
 * `BillingError.message` for server logs, never sent to the client.
 */
const SAFE_MESSAGE: Record<BillingErrorCode, string> = {
  PROVIDER_NOT_CONFIGURED: 'Billing is not configured.',
  PROVIDER_NOT_ENABLED: 'This billing provider is not available.',
  NOT_IMPLEMENTED: 'This billing action is not available.',
  UNKNOWN_OFFER: 'That plan is not available.',
  UNKNOWN_PLAN: 'That plan is not available.',
  UNSUPPORTED_PROVIDER: 'This billing provider is not supported.',
  PROVIDER_ERROR: 'The payment provider could not complete this request.',
  BILLING_NOT_CONFIGURED: 'Billing is not available right now.',
  INVALID_OFFER: 'That plan is not available.',
  CHECKOUT_UNAVAILABLE: 'Checkout is not available right now.',
  ALREADY_SUBSCRIBED: 'You already have an active subscription.',
  CUSTOMER_NOT_FOUND: 'No billing account was found for you.',
  PORTAL_UNAVAILABLE: 'The billing portal is not available right now.',
  WEBHOOK_SIGNATURE_INVALID: 'Invalid webhook signature.',
  WEBHOOK_EVENT_UNSUPPORTED: 'Unsupported webhook event.',
  WEBHOOK_PROCESSING_FAILED: 'The billing event could not be processed.',
  UNKNOWN_PROVIDER_PRICE: 'That price is not recognised.',
  PURCHASE_OWNERSHIP_CONFLICT: 'This billing record belongs to a different account.',
  STALE_PROVIDER_EVENT: 'A newer billing update already applied.',
  BILLING_PROVIDER_UNAVAILABLE: 'The payment provider is temporarily unavailable.',
};

/** HTTP status for surfacing a billing error from a route, per code. */
const HTTP_STATUS: Partial<Record<BillingErrorCode, number>> = {
  PROVIDER_NOT_CONFIGURED: 503,
  BILLING_NOT_CONFIGURED: 503,
  BILLING_PROVIDER_UNAVAILABLE: 503,
  PROVIDER_NOT_ENABLED: 503,
  CHECKOUT_UNAVAILABLE: 503,
  PORTAL_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 503,
  UNKNOWN_OFFER: 400,
  INVALID_OFFER: 400,
  UNKNOWN_PLAN: 400,
  UNSUPPORTED_PROVIDER: 400,
  UNKNOWN_PROVIDER_PRICE: 400,
  ALREADY_SUBSCRIBED: 409,
  PURCHASE_OWNERSHIP_CONFLICT: 409,
  STALE_PROVIDER_EVENT: 409,
  CUSTOMER_NOT_FOUND: 404,
  WEBHOOK_SIGNATURE_INVALID: 400,
  WEBHOOK_EVENT_UNSUPPORTED: 400,
  WEBHOOK_PROCESSING_FAILED: 500,
  PROVIDER_ERROR: 502,
};

export function safeBillingMessage(code: BillingErrorCode): string {
  return SAFE_MESSAGE[code];
}

export function billingHttpStatus(code: BillingErrorCode): number {
  return HTTP_STATUS[code] ?? 400;
}

/** The safe body a route returns for a BillingError — code + generic message only. */
export function billingErrorBody(error: BillingError): { code: BillingErrorCode; message: string } {
  return { code: error.code, message: safeBillingMessage(error.code) };
}
