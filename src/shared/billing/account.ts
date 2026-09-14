/**
 * Server-owned billing-account helpers. A {@link BillingAccount} groups all of a
 * user's purchases and (from first checkout) the provider customer bound to them.
 * Customer ownership is ALWAYS resolved here from the authenticated user — a
 * provider customer id is never accepted from client input.
 */
import { prisma } from '@/shared/lib/prisma';
import type { BillingProviderId } from './provider-contract';

export interface BillingAccountRef {
  id: string;
  provider: BillingProviderId | null;
  providerCustomerId: string | null;
}

/** Find or create the user's billing account. */
export async function ensureBillingAccount(userId: string): Promise<BillingAccountRef> {
  const account = await prisma.billingAccount.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true, provider: true, providerCustomerId: true },
  });
  return {
    id: account.id,
    provider: (account.provider as BillingProviderId | null) ?? null,
    providerCustomerId: account.providerCustomerId,
  };
}

/** Persist the provider customer bound to an account (set once at first checkout). */
export async function setAccountCustomer(
  accountId: string,
  provider: BillingProviderId,
  providerCustomerId: string
): Promise<void> {
  await prisma.billingAccount.update({
    where: { id: accountId },
    data: { provider, providerCustomerId },
  });
}

/**
 * The provider customer id for a user, if any — from the account, falling back to
 * the most recent purchase that carries one. Used by the portal route, which needs
 * a customer to open a session.
 */
export async function getProviderCustomerId(
  userId: string
): Promise<{ provider: BillingProviderId; providerCustomerId: string } | null> {
  const account = await prisma.billingAccount.findUnique({
    where: { userId },
    select: {
      id: true,
      provider: true,
      providerCustomerId: true,
      purchases: {
        where: { providerCustomerId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { provider: true, providerCustomerId: true },
      },
    },
  });
  if (!account) return null;
  if (account.provider && account.providerCustomerId) {
    return { provider: account.provider as BillingProviderId, providerCustomerId: account.providerCustomerId };
  }
  const fromPurchase = account.purchases[0];
  if (fromPurchase?.providerCustomerId) {
    return {
      provider: fromPurchase.provider as BillingProviderId,
      providerCustomerId: fromPurchase.providerCustomerId,
    };
  }
  return null;
}
