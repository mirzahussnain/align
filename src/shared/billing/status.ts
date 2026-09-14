/**
 * Serialisable billing status derived server-side from the effective-access
 * resolver. The client renders this; it never recomputes plan or status, and it
 * never sees a raw provider status, customer id, subscription id or price id.
 */
import { resolveBillingAccess, type BillingAccessStatus } from './access';
import type { ProductPlanId } from './product-plans';

export interface BillingStatusPayload {
  plan: ProductPlanId;
  status: BillingAccessStatus;
  cancelAtPeriodEnd: boolean;
  accessEndsAt: string | null;
  graceEndsAt: string | null;
  portalAvailable: boolean;
  checkoutAvailable: boolean;
}

export async function getBillingStatus(userId: string): Promise<BillingStatusPayload> {
  const access = await resolveBillingAccess(userId);
  return {
    plan: access.effectivePlan,
    status: access.status,
    cancelAtPeriodEnd: access.cancelAtPeriodEnd,
    accessEndsAt: access.accessEndsAt?.toISOString() ?? null,
    graceEndsAt: access.graceEndsAt?.toISOString() ?? null,
    portalAvailable: access.portalAvailable,
    checkoutAvailable: access.checkoutAvailable,
  };
}
