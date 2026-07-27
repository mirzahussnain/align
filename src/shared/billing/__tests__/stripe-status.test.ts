import { describe, expect, it } from 'vitest';
import { mapStripeSubscriptionStatus, isKnownStripeStatus } from '../stripe-status';

describe('mapStripeSubscriptionStatus (§13)', () => {
  it('maps every supported Stripe status to the internal status', () => {
    expect(mapStripeSubscriptionStatus('trialing')).toBe('TRIALING');
    expect(mapStripeSubscriptionStatus('active')).toBe('ACTIVE');
    expect(mapStripeSubscriptionStatus('past_due')).toBe('PAST_DUE');
    expect(mapStripeSubscriptionStatus('unpaid')).toBe('UNPAID');
    expect(mapStripeSubscriptionStatus('canceled')).toBe('CANCELLED');
    expect(mapStripeSubscriptionStatus('incomplete')).toBe('INCOMPLETE');
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe('INCOMPLETE_EXPIRED');
  });

  it('maps paused conservatively to a non-granting status', () => {
    expect(mapStripeSubscriptionStatus('paused')).toBe('UNPAID');
  });

  it('fails conservatively to INCOMPLETE for an unknown status', () => {
    expect(mapStripeSubscriptionStatus('something_new')).toBe('INCOMPLETE');
    expect(isKnownStripeStatus('something_new')).toBe(false);
    expect(isKnownStripeStatus('active')).toBe(true);
  });
});
