import { describe, expect, it } from 'vitest';

import { distributionDomainMaximum } from '../PublicDataCharts';

describe('public data chart scaling', () => {
  it('uses a compact domain for low-share ranked distributions', () => {
    expect(distributionDomainMaximum([
      { label: 'Scotland', count: 5, share: 6 },
      { label: 'West Midlands', count: 3, share: 3.6 },
    ])).toBe(10);
  });

  it('leaves enough label room without exceeding the percentage domain', () => {
    expect(distributionDomainMaximum([
      { label: 'London', count: 40, share: 50 },
    ])).toBe(58);
    expect(distributionDomainMaximum([
      { label: 'Skilled Worker', count: 86, share: 86.2 },
    ])).toBe(100);
  });
});
