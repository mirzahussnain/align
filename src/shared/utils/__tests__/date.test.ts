import { describe, expect, it } from 'vitest';
import {
  formatDateRange,
  formatDateRangeStyled,
  formatProfileDate,
  formatProfileDateStyled,
  isProfileDate,
  isProfileDateBefore,
} from '@/shared/utils/date';

describe('profile date storage and display', () => {
  it('preserves year-only precision and formats year-month values for display', () => {
    expect(isProfileDate('2024')).toBe(true);
    expect(isProfileDate('2024-12')).toBe(true);
    expect(formatProfileDate('2024')).toBe('2024');
    expect(formatProfileDate('2024-12')).toBe('Dec 2024');
  });

  it('formats complete ranges and current records without inventing a month', () => {
    expect(formatDateRange('2023-01', '2024-12')).toBe('Jan 2023 – Dec 2024');
    expect(formatDateRange('2023-01', null, true)).toBe('Jan 2023 – Present');
    expect(formatDateRange('2023', '2024-12')).toBe('2023 – Dec 2024');
  });

  it('omits missing values cleanly and rejects display values as storage', () => {
    expect(formatDateRange('', '')).toBe('');
    expect(formatDateRange('2024', '')).toBe('2024');
    expect(isProfileDate('Dec 2024')).toBe(false);
    expect(isProfileDate('2024-13')).toBe(false);
  });

  it('does not infer a month when checking mixed-precision chronology', () => {
    expect(isProfileDateBefore('2024', '2024-12')).toBe(false);
    expect(isProfileDateBefore('2023-12', '2024')).toBe(true);
    expect(isProfileDateBefore('2024-01', '2024-12')).toBe(true);
  });
});

describe('styled date presentation (§7)', () => {
  it('spells the SAME canonical month value differently per style, without changing its meaning', () => {
    expect(formatProfileDateStyled('2024-12', 'short_month_year')).toBe('Dec 2024');
    expect(formatProfileDateStyled('2024-12', 'long_month_year')).toBe('December 2024');
    expect(formatProfileDateStyled('2024-12', 'numeric_month_year')).toBe('12/2024');
    expect(formatProfileDateStyled('2024-12', 'year_only_when_possible')).toBe('2024');
  });

  it('keeps year-only precision year-only in every style (never invents a month)', () => {
    for (const style of ['short_month_year', 'long_month_year', 'numeric_month_year', 'year_only_when_possible'] as const) {
      expect(formatProfileDateStyled('2024', style)).toBe('2024');
    }
  });

  it('passes non-canonical values through unchanged (already-display or free text)', () => {
    expect(formatProfileDateStyled('Jan 2022', 'long_month_year')).toBe('Jan 2022');
    expect(formatProfileDateStyled('Present', 'numeric_month_year')).toBe('Present');
    expect(formatProfileDateStyled('', 'short_month_year')).toBe('');
  });

  it('formats ranges per style and never widens a single endpoint into a range', () => {
    expect(formatDateRangeStyled('2023-01', '2024-12', 'long_month_year')).toBe('January 2023 – December 2024');
    expect(formatDateRangeStyled('2023-01', 'Present', 'numeric_month_year')).toBe('01/2023 – Present');
    expect(formatDateRangeStyled('2024', '', 'long_month_year')).toBe('2024');
    expect(formatDateRangeStyled('2023-06', null, 'short_month_year', true)).toBe('Jun 2023 – Present');
  });

  it('default formatters remain the short-month style', () => {
    expect(formatProfileDate('2024-12')).toBe('Dec 2024');
    expect(formatDateRange('2023-01', '2024-12')).toBe('Jan 2023 – Dec 2024');
  });
});