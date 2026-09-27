import { describe, expect, it } from 'vitest';
import { PLANS } from '@/shared/constants/plans';

describe('plan presentation', () => {
  it('presents Free Job Match as unavailable while keeping rule-based ATS unlimited', () => {
    const free = PLANS.find((plan) => plan.id === 'free');

    expect(free?.sections.core).toContain('Unlimited rule-based ATS analysis');
    expect(free?.sections.monthly).toContain('1 AI-enhanced ATS analysis / month');
    expect(free?.sections.monthly).toContain('No Job Matches included');
    expect(free?.sections.monthly.join(' ')).not.toMatch(/limited.*job match/i);
  });

  it('keeps recurring allowances separate from persistent account limits', () => {
    const pro = PLANS.find((plan) => plan.id === 'pro');

    expect(pro?.sections.monthly).toEqual(expect.arrayContaining([
      '15 AI-enhanced ATS analyses / month',
      '30 Job Matches / month',
      '10 CV regenerations / month',
      '10 profile reconciliations / month',
      '10 CV-import reconciliations / month',
      '100 human evidence captures / month',
    ]));
    expect(pro?.sections.account).toEqual(expect.arrayContaining([
      '3 Career Profiles',
      '25 stored source CVs',
      '50 stored generated CVs',
      '100 stored analyses',
      '500 reusable evidence items',
      '100 saved jobs',
      '365-day uploaded-file retention',
    ]));
  });

  it('presents Free reconciliation allowances as lifetime rather than monthly', () => {
    const free = PLANS.find((plan) => plan.id === 'free');

    expect(free?.sections.lifetime).toEqual([
      '1 profile reconciliation / lifetime',
      '1 CV-import reconciliation / lifetime',
    ]);
    expect(free?.sections.monthly.join(' ')).not.toMatch(/reconciliation/i);
  });
});
