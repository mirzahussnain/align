import { describe, expect, it } from 'vitest';

import { mapWithConcurrency } from '@/shared/services/bounded-concurrency';

describe('mapWithConcurrency', () => {
  it('never runs more work than the configured persistence limit', async () => {
    let active = 0;
    let maximum = 0;
    const results = await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), 4, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });
    expect(maximum).toBe(4);
    expect(results).toEqual(Array.from({ length: 12 }, (_, index) => index * 2));
  });

  it('waits for neighboring in-flight work and stops assigning new work after a failure', async () => {
    const completed: number[] = [];
    await expect(mapWithConcurrency([0, 1, 2, 3, 4, 5], 4, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value === 1 ? 1 : 5));
      if (value === 1) throw new Error('persistence failed');
      completed.push(value);
      return value;
    })).rejects.toThrow('persistence failed');
    expect(completed.sort()).toEqual([0, 2, 3]);
  });
});
