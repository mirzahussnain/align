/**
 * Typed, server-only reader for billing environment variables.
 *
 * Rules enforced here (see §16):
 *  - the secret key and webhook secret must NEVER reach the browser;
 *  - provider price ids come only from server configuration;
 *  - missing Stripe variables must not break unrelated development paths — nothing
 *    reads these at import time, only when a provider path is actually invoked;
 *  - Stripe-specific paths fail clearly (with a stable {@link BillingError}) when
 *    invoked without configuration.
 *
 * Only `NEXT_PUBLIC_*` values are safe on the client. Every function that returns
 * a secret asserts it is running on the server first.
 */
import { BillingError } from './errors';

function assertServer(name: string): void {
  if (typeof window !== 'undefined') {
    // A programming error, not a user-facing one: a secret was about to be read in
    // the browser. Fail hard rather than leak or silently return undefined.
    throw new BillingError(
      'PROVIDER_NOT_CONFIGURED',
      `${name} is server-only and must not be read in the browser.`
    );
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new BillingError('PROVIDER_NOT_CONFIGURED', `${name} is not configured.`);
  }
  return value;
}

export interface StripeServerConfig {
  secretKey: string;
  webhookSecret: string;
}

/**
 * Server-side Stripe secrets. Throws a stable `PROVIDER_NOT_CONFIGURED` error if
 * either value is missing — callers on Stripe-specific paths surface that, while
 * everything else in the app is unaffected because it never calls this.
 */
export function getStripeServerConfig(): StripeServerConfig {
  assertServer('STRIPE_SECRET_KEY');
  return {
    secretKey: required('STRIPE_SECRET_KEY'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET'),
  };
}

/**
 * A provider price id, read only from server env via the key declared on the
 * offer (`providerPriceEnvKeys`). Never accepted from client input.
 */
export function getServerPriceId(envKey: string): string {
  assertServer(envKey);
  return required(envKey);
}

/** True when the given env var is present — used to report configuration readiness. */
export function hasServerEnv(name: string): boolean {
  assertServer(name);
  return Boolean(process.env[name]);
}

/** The Stripe publishable key is safe on the client (NEXT_PUBLIC_*). */
export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}

/** The app's public origin, used to build checkout success/cancel URLs. */
export function getPublicAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
