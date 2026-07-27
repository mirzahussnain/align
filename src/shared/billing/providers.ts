/**
 * Central billing-provider registry.
 *
 * Routes never instantiate a payment SDK directly — they ask the registry for an
 * adapter by id. An unsupported provider id is rejected here, in one place, so a
 * forged or future provider can never slip through to a checkout path.
 */
import type { BillingArrangement } from './offers';
import {
  BILLING_PROVIDER_IDS,
  type BillingProviderAdapter,
  type BillingProviderId,
  isBillingProviderId,
} from './provider-contract';
import { StripeBillingProvider } from './stripe-provider';
import { BillingError } from './errors';

export interface BillingProviderDefinition {
  id: BillingProviderId;
  displayName: string;
  /** Whether this provider is turned on for launch. */
  enabled: boolean;
  /** Commercial arrangements this provider can process. */
  supportedArrangements: readonly BillingArrangement[];
  /** Builds the adapter on demand — Stripe env is only touched when a real call runs. */
  createAdapter: () => BillingProviderAdapter;
  /** Whether the server configuration needed to actually transact is present. */
  isConfigured: () => boolean;
}

export const BILLING_PROVIDERS = {
  STRIPE: {
    id: 'STRIPE',
    displayName: 'Stripe',
    enabled: true,
    supportedArrangements: ['RECURRING', 'FIXED_TERM', 'ONE_TIME'],
    createAdapter: () => new StripeBillingProvider(),
    isConfigured: () => StripeBillingProvider.isConfigured(),
  },
} as const satisfies Record<BillingProviderId, BillingProviderDefinition>;

export function getProviderDefinition(id: BillingProviderId): BillingProviderDefinition {
  return BILLING_PROVIDERS[id];
}

/**
 * Resolve an adapter for a provider id. Rejects anything not on the launch
 * allow-list (`UNSUPPORTED_PROVIDER`) — the single choke point that stops a
 * forged or not-yet-implemented provider from reaching a payment SDK.
 */
export function resolveProviderAdapter(id: unknown): BillingProviderAdapter {
  if (!isBillingProviderId(id)) {
    throw new BillingError('UNSUPPORTED_PROVIDER', `Unsupported billing provider: ${String(id)}`);
  }
  const definition = BILLING_PROVIDERS[id];
  if (!definition.enabled) {
    throw new BillingError('PROVIDER_NOT_ENABLED', `Billing provider ${id} is not enabled.`);
  }
  return definition.createAdapter();
}

export function isProviderConfigured(id: BillingProviderId): boolean {
  return BILLING_PROVIDERS[id].isConfigured();
}

export function enabledProviderIds(): BillingProviderId[] {
  return BILLING_PROVIDER_IDS.filter((id) => BILLING_PROVIDERS[id].enabled);
}
