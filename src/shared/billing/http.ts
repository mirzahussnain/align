/**
 * Bridge a {@link BillingError} to the app's {@link APIError} with a SAFE body —
 * a stable code and a generic message, never a raw provider message. Used by
 * billing routes so a provider failure surfaces as a clean, typed HTTP response.
 */
import { APIError } from '@/shared/utils/api-error';
import { BillingError, billingErrorBody, billingHttpStatus } from './errors';

export function billingApiError(error: BillingError): APIError {
  const body = billingErrorBody(error);
  return new APIError(body.message, billingHttpStatus(error.code), { ...body });
}

/** Rethrow a BillingError as an APIError; pass anything else through unchanged. */
export function rethrowBilling(error: unknown): never {
  if (error instanceof BillingError) throw billingApiError(error);
  throw error;
}
