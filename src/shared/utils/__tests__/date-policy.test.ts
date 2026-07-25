import { describe, expect, it } from 'vitest';
import { currentProfileMonth, isFutureProfileDate, validateProfileDateRange } from '@/shared/utils/date-policy';

const JULY_2026 = new Date('2026-07-22T12:00:00.000Z');

describe('profile date boundaries', () => {
  it('preserves year-only precision when deciding whether a date is future', () => {
    expect(currentProfileMonth(JULY_2026)).toBe('2026-07');
    expect(isFutureProfileDate('2026', JULY_2026)).toBe(false);
    expect(isFutureProfileDate('2027', JULY_2026)).toBe(true);
    expect(isFutureProfileDate('2026-08', JULY_2026)).toBe(true);
  });

  it('rejects future start dates while allowing explicit future expected ends', () => {
    expect(validateProfileDateRange({ start: '2026-08', end: '', startLabel: 'Project start', endLabel: 'Project end', now: JULY_2026 })).toBe('Project start cannot be in the future.');
    expect(validateProfileDateRange({ start: '2026-06', end: '2027-01', startLabel: 'Project start', endLabel: 'Project end', endBoundary: 'future-allowed', now: JULY_2026 })).toBeNull();
  });

  it('does not infer an ordering from mixed year/month precision', () => {
    expect(validateProfileDateRange({ start: '2026', end: '2026-01', startLabel: 'Start date', endLabel: 'End date', now: JULY_2026 })).toBeNull();
    expect(validateProfileDateRange({ start: '2025-06', end: '2025-05', startLabel: 'Start date', endLabel: 'End date', now: JULY_2026 })).toBe('End or expiry date cannot be before its start or issue date.');
  });
});