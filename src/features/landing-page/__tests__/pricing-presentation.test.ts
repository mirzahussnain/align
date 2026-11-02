import { describe, expect, it } from 'vitest';
import { getPlanEntitlement } from '@/shared/entitlements/registry';
import {
  PUBLIC_PRICING_GROUPS,
  PUBLIC_PRICING_PLANS,
} from '../pricing-presentation';

describe('public pricing presentation', () => {
  it('keeps the cards concise and outcome focused', () => {
    expect(PUBLIC_PRICING_PLANS).toMatchObject([
      {
        id: 'free',
        price: '£0',
        period: '/forever',
        benefits: [
          'Unlimited basic ATS checks',
          '1 AI-powered CV review / month',
          '1 tailored CV generation / month',
          'Save up to 10 jobs',
        ],
      },
      {
        id: 'pro',
        price: '£12.99',
        period: '/month',
        benefits: [
          'Everything in Free',
          '30 AI Job Matches / month',
          '15 AI-powered CV reviews / month',
          '10 tailored CV generations / month',
          'Save up to 100 jobs',
        ],
      },
    ]);

    for (const plan of PUBLIC_PRICING_PLANS) {
      expect(plan.benefits.length).toBeGreaterThanOrEqual(4);
      expect(plan.benefits.length).toBeLessThanOrEqual(5);
    }
  });

  it('organises every customer-facing allowance into clear groups', () => {
    expect(PUBLIC_PRICING_GROUPS.map((group) => group.title)).toEqual([
      'CV Analysis & Tailoring',
      'Job Matching',
      'Career Profiles & Storage',
      'Other Limits',
    ]);

    const rows = PUBLIC_PRICING_GROUPS.flatMap((group) => group.rows);
    expect(rows).toHaveLength(23);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'AI-powered CV reviews', free: '1 / month', pro: '15 / month' }),
      expect.objectContaining({ label: 'AI Job Matches', free: 'Not included', pro: '30 / month' }),
      expect.objectContaining({ label: 'Career profiles', free: '1', pro: '3' }),
      expect.objectContaining({ label: 'Uploaded CV retention', free: '180 days', pro: '365 days' }),
      expect.objectContaining({ label: 'Advanced tools', free: 'Not included', pro: 'Included' }),
    ]));
  });

  it('derives displayed quantities from the entitlement registry', () => {
    const reviewRow = PUBLIC_PRICING_GROUPS
      .flatMap((group) => group.rows)
      .find((row) => row.capability === 'ai_enhanced_ats_analysis');
    const free = getPlanEntitlement('FREE', 'ai_enhanced_ats_analysis');
    const pro = getPlanEntitlement('PRO', 'ai_enhanced_ats_analysis');

    expect(free).toMatchObject({ mode: 'quota', limit: 1, period: 'month' });
    expect(pro).toMatchObject({ mode: 'quota', limit: 15, period: 'month' });
    expect(reviewRow).toMatchObject({ free: '1 / month', pro: '15 / month' });
  });

  it('does not expose internal entitlement terminology', () => {
    const visibleCopy = JSON.stringify({ plans: PUBLIC_PRICING_PLANS, groups: PUBLIC_PRICING_GROUPS });

    expect(visibleCopy).not.toMatch(/CV-import reconciliation/i);
    expect(visibleCopy).not.toMatch(/human evidence capture/i);
    expect(visibleCopy).not.toMatch(/profile reconciliation/i);
    expect(visibleCopy).not.toMatch(/accessLevel|resource_limit|partial/i);
  });
});
