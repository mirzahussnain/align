import { describe, expect, it } from 'vitest';
import { decideAccountDeletion } from '@/shared/policies';

describe('account deletion policy', () => {
  it('allows deletion when paid access is inactive', () => {
    expect(decideAccountDeletion({
      effectivePlan: 'FREE',
      paidAccessActive: false,
      paidThrough: null,
    })).toEqual({ status: 'allowed' });
  });

  it('blocks deletion while paid access remains active', () => {
    const paidThrough = new Date('2026-10-14T12:00:00.000Z');

    expect(decideAccountDeletion({
      effectivePlan: 'PRO',
      paidAccessActive: true,
      paidThrough,
    })).toEqual({ status: 'blocked_active_subscription', paidThrough });
  });

  it('keeps deletion blocked after cancellation until paid access ends', () => {
    const paidThrough = new Date('2026-10-14T12:00:00.000Z');

    expect(decideAccountDeletion({
      effectivePlan: 'PRO',
      paidAccessActive: true,
      paidThrough,
      cancelAtPeriodEnd: true,
    })).toEqual({ status: 'blocked_active_subscription', paidThrough });
  });
});
