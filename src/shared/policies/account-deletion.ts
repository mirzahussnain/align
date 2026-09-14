import type { PlanId } from '@/shared/entitlements/registry';

export interface AccountDeletionBillingSnapshot {
  effectivePlan: PlanId;
  paidAccessActive: boolean;
  paidThrough: Date | null;
  cancelAtPeriodEnd?: boolean;
}

export type AccountDeletionDecision =
  | { status: 'allowed' }
  | { status: 'blocked_active_subscription'; paidThrough: Date | null };

export function decideAccountDeletion(
  input: AccountDeletionBillingSnapshot
): AccountDeletionDecision {
  return input.paidAccessActive
    ? { status: 'blocked_active_subscription', paidThrough: input.paidThrough }
    : { status: 'allowed' };
}
