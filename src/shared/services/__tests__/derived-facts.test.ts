import { describe, expect, it } from 'vitest';
import {
  deriveProfessionalExperience,
  durationSupportsYears,
  type DurationExperienceInput,
} from '@/shared/services/derived-facts';

const NOW = new Date('2025-06-15T00:00:00Z');

function role(overrides: Partial<DurationExperienceInput>): DurationExperienceInput {
  return { id: 'r', startDate: '', endDate: '', current: false, type: 'FULL_TIME', ...overrides };
}

describe('deriveProfessionalExperience', () => {
  it('derives a deterministic duration from month-precise dated roles', () => {
    const fact = deriveProfessionalExperience(
      [role({ id: 'a', startDate: '2022-01', endDate: '2023-12' })],
      NOW
    );
    expect(fact.confidence).toBe('deterministic');
    expect(fact.value?.months).toBe(24);
    expect(fact.supportingFactKeys).toEqual(['experience:a']);
  });

  it('does not double-count overlapping roles', () => {
    const fact = deriveProfessionalExperience(
      [
        role({ id: 'a', startDate: '2022-01', endDate: '2022-12' }),
        role({ id: 'b', startDate: '2022-06', endDate: '2023-06' }),
      ],
      NOW
    );
    // Union of 2022-01..2023-06 = 18 months, not 12 + 13.
    expect(fact.value?.months).toBe(18);
  });

  it('counts an ongoing role up to the current month', () => {
    const fact = deriveProfessionalExperience(
      [role({ id: 'a', startDate: '2025-01', endDate: '', current: true })],
      NOW
    );
    // 2025-01..2025-06 inclusive = 6 months.
    expect(fact.value?.months).toBe(6);
  });

  it('is insufficient when a qualifying record is year-only (no invented months)', () => {
    const fact = deriveProfessionalExperience(
      [role({ id: 'a', startDate: '2020', endDate: '2023' })],
      NOW
    );
    expect(fact.confidence).toBe('insufficient');
    expect(fact.value).toBeNull();
  });

  it('is insufficient when there are no qualifying records', () => {
    expect(deriveProfessionalExperience([], NOW).confidence).toBe('insufficient');
  });

  it('excludes volunteer work from professional experience', () => {
    const fact = deriveProfessionalExperience(
      [role({ id: 'v', startDate: '2020-01', endDate: '2024-01', type: 'VOLUNTEER' })],
      NOW
    );
    // Only record is volunteer → no qualifying professional experience.
    expect(fact.confidence).toBe('insufficient');
  });

  it('is insufficient when a qualifying record ends before it starts', () => {
    const fact = deriveProfessionalExperience(
      [role({ id: 'a', startDate: '2023-05', endDate: '2022-05' })],
      NOW
    );
    expect(fact.confidence).toBe('insufficient');
  });
});

describe('durationSupportsYears', () => {
  it('supports a claim only when months meet the claimed years', () => {
    const fact = deriveProfessionalExperience(
      [role({ id: 'a', startDate: '2022-01', endDate: '2023-12' })], // 24 months
      NOW
    );
    expect(durationSupportsYears(fact, 2)).toBe(true);
    expect(durationSupportsYears(fact, 3)).toBe(false);
  });

  it('supports no numeric claim from an insufficient fact', () => {
    const fact = deriveProfessionalExperience([], NOW);
    expect(durationSupportsYears(fact, 1)).toBe(false);
  });
});
