import { describe, expect, it } from 'vitest';
import {
  BILLING_OFFERS,
  assertOffersValid,
  publicOfferForPlan,
  requireOffer,
  validateOffer,
  type BillingOfferDefinition,
} from '../offers';
import { formatMinorPrice, offerPresentationForPlan } from '../config';
import { BillingError } from '../errors';

describe('billing offers', () => {
  it('maps the launch PRO_MONTHLY offer to the PRO plan', () => {
    const offer = requireOffer('PRO_MONTHLY');
    expect(offer.planId).toBe('PRO');
    expect(offer.arrangement).toBe('RECURRING');
    expect(offer.interval).toBe('MONTH');
  });

  it('keeps £12.99 only in central configuration', () => {
    expect(BILLING_OFFERS.PRO_MONTHLY.priceMinor).toBe(1299);
    expect(formatMinorPrice(1299, 'GBP')).toBe('£12.99');
    expect(offerPresentationForPlan('PRO')).toMatchObject({ priceLabel: '£12.99', periodLabel: '/month' });
  });

  it('rejects unknown offer ids rather than trusting them', () => {
    expect(() => requireOffer('PRO_ANNUAL')).toThrow(BillingError);
    expect(() => requireOffer('anything')).toThrow(/Unknown billing offer/);
  });

  it('passes structural validation for the whole launch registry', () => {
    expect(() => assertOffersValid()).not.toThrow();
  });

  it('requires an interval on recurring offers', () => {
    const bad: BillingOfferDefinition = { ...BILLING_OFFERS.PRO_MONTHLY, interval: undefined };
    expect(validateOffer(bad)).toContain('offer PRO_MONTHLY: recurring offers require an interval');
  });

  it('supports a future fixed-term offer shape without entitlement changes', () => {
    const pass: BillingOfferDefinition = {
      id: 'PRO_15_DAY',
      planId: 'PRO',
      displayName: 'Pro 15-day pass',
      description: '15 days of Pro.',
      arrangement: 'FIXED_TERM',
      fixedTermDays: 15,
      priceMinor: 599,
      currency: 'GBP',
      isPublic: false,
      isActive: false,
      providerPriceEnvKeys: { STRIPE: 'STRIPE_PRO_15_DAY_PRICE_ID' },
    };
    expect(validateOffer(pass)).toEqual([]);
  });

  it('supports a future annual offer shape without entitlement changes', () => {
    const annual: BillingOfferDefinition = {
      id: 'PRO_ANNUAL',
      planId: 'PRO',
      displayName: 'Pro Annual',
      description: 'Pro billed yearly.',
      arrangement: 'RECURRING',
      interval: 'YEAR',
      priceMinor: 12900,
      currency: 'GBP',
      isPublic: false,
      isActive: false,
      providerPriceEnvKeys: { STRIPE: 'STRIPE_PRO_ANNUAL_PRICE_ID' },
    };
    expect(validateOffer(annual)).toEqual([]);
  });

  it('rejects a public paid offer with no provider mapping', () => {
    const bad: BillingOfferDefinition = { ...BILLING_OFFERS.PRO_MONTHLY, providerPriceEnvKeys: {} };
    expect(validateOffer(bad)).toContain(
      'offer PRO_MONTHLY: a public paid offer must map to at least one provider price'
    );
  });

  it('rejects committing a literal provider price id', () => {
    const bad: BillingOfferDefinition = {
      ...BILLING_OFFERS.PRO_MONTHLY,
      providerPriceEnvKeys: { STRIPE: 'price_1ABCdef' },
    };
    expect(validateOffer(bad).some((p) => p.includes('env var NAMES, not literal ids'))).toBe(true);
  });

  it('does not expose annual or fixed-term offers publicly at launch', () => {
    expect(publicOfferForPlan('PRO')?.id).toBe('PRO_MONTHLY');
    const publicIds = Object.values(BILLING_OFFERS)
      .filter((o) => o.isPublic)
      .map((o) => o.id);
    expect(publicIds).toEqual(['PRO_MONTHLY']);
  });
});
