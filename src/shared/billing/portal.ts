/**
 * Server-authoritative customer portal + cancellation (§16, §17).
 *
 * The portal is where a user manages payment method, invoices and cancellation.
 * The provider customer is resolved from the authenticated user's own account, so
 * one user can never open another user's portal, and a customer id is never taken
 * from client input.
 */
import { BillingError } from './errors';
import { getPublicAppUrl } from './env';
import { resolveProviderAdapter, isProviderConfigured } from './providers';
import { getProviderCustomerId } from './account';
import { resolveBillingAccess } from './access';
import { prisma } from '@/shared/lib/prisma';
import { logBillingEvent } from './logging';

export async function startPortal(userId: string): Promise<{ url: string }> {
  const customer = await getProviderCustomerId(userId);
  if (!customer) {
    throw new BillingError('CUSTOMER_NOT_FOUND', 'No billing customer exists for this account.');
  }
  if (!isProviderConfigured(customer.provider)) {
    throw new BillingError('PORTAL_UNAVAILABLE', 'The billing provider is not configured.');
  }
  const adapter = resolveProviderAdapter(customer.provider);
  const appUrl = getPublicAppUrl().replace(/\/$/, '');
  const { url } = await adapter.createCustomerPortal({
    userId,
    providerCustomerId: customer.providerCustomerId,
    // Return to the canonical route-backed billing settings view.
    returnUrl: `${appUrl}/dashboard/settings/billing`,
  });
  logBillingEvent('portal_session_created', { userId, provider: customer.provider });
  return { url };
}

/**
 * Schedule cancellation at period end for the user's active recurring subscription.
 * Paid access is preserved until the period ends; no data is deleted and usage is
 * untouched. The authoritative state change lands via the provider's
 * subscription.updated webhook — we also optimistically flag `cancelAtPeriodEnd`
 * so the UI reflects it immediately.
 */
export async function cancelActiveSubscription(userId: string): Promise<{ accessEndsAt: string | null }> {
  const access = await resolveBillingAccess(userId);
  if (!access.activePurchaseId || access.source !== 'RECURRING_PURCHASE') {
    throw new BillingError('CUSTOMER_NOT_FOUND', 'No active subscription to cancel.');
  }
  // Ownership: the purchase must belong to THIS user's account.
  const purchase = await prisma.billingPurchase.findFirst({
    where: { id: access.activePurchaseId, billingAccount: { userId } },
    select: { id: true, provider: true, providerSubscriptionId: true },
  });
  if (!purchase?.providerSubscriptionId) {
    throw new BillingError('CUSTOMER_NOT_FOUND', 'No cancellable subscription found.');
  }
  const provider = purchase.provider as 'STRIPE';
  if (!isProviderConfigured(provider)) {
    throw new BillingError('BILLING_PROVIDER_UNAVAILABLE', 'The billing provider is not configured.');
  }
  const adapter = resolveProviderAdapter(provider);
  await adapter.cancelPurchase({ providerPurchaseId: purchase.providerSubscriptionId, atPeriodEnd: true });

  await prisma.billingPurchase.update({
    where: { id: purchase.id },
    data: { cancelAtPeriodEnd: true },
  });
  logBillingEvent('cancellation_scheduled', { userId, purchaseId: purchase.id, provider });
  return { accessEndsAt: access.accessEndsAt?.toISOString() ?? null };
}
