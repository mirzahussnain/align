/**
 * Deterministic derived facts.
 *
 * Some facts are not entered by anyone — they are *calculated* from canonical
 * records, e.g. "how many years of professional experience does the dated work
 * history support?". Those calculations are dangerous precisely because a wrong
 * one becomes a confident-sounding claim ("2+ yrs") with no human behind it.
 *
 * A DerivedFact therefore always carries its derivation rule and the exact
 * record ids it was computed from, and reports `insufficient` rather than
 * guessing when the inputs cannot support a deterministic answer. A caller must
 * never render a label from an `insufficient` fact.
 *
 * Hard rules encoded here (see the reconciliation phase spec §9):
 *   - only qualifying Experience records count — projects and education are
 *     separate inputs and are excluded by construction, never coerced in;
 *   - overlapping roles are unioned, never double-counted;
 *   - a record with year-only or missing precision makes the whole derivation
 *     `insufficient` — we never invent January/December to manufacture months;
 *   - unpaid volunteer work is not professional experience.
 */
import { currentProfileMonth } from '@/shared/utils/date-policy';

/** A fact computed deterministically from canonical records. */
export interface DerivedFact<T = unknown> {
  key: string;
  value: T;
  /** Human-readable statement of exactly how `value` was produced. */
  derivationRule: string;
  /** Canonical record ids (or fact keys) the value was computed from. */
  supportingFactKeys: string[];
  calculatedAt: string;
  /** `insufficient` means the inputs cannot support a value; render nothing. */
  confidence: 'deterministic' | 'insufficient';
}

/** The professional-experience duration payload, when it can be derived. */
export interface ExperienceDuration {
  /** Whole months of non-overlapping professional employment. */
  months: number;
  /** `months / 12`, unrounded, for callers that reason in years. */
  years: number;
}

/** Minimal shape of an Experience record needed to derive duration. */
export interface DurationExperienceInput {
  id: string;
  /** `YYYY` or `YYYY-MM`. */
  startDate: string;
  /** `YYYY` or `YYYY-MM`, or empty when ongoing. */
  endDate: string;
  current: boolean;
  /** `EmploymentType` enum value, or '' when unset. */
  type?: string;
}

/**
 * Employment types that do NOT count toward professional experience. Volunteer
 * work is unpaid and is captured to render a CV honestly, not to accrue a
 * professional-tenure claim. Everything else (including internships,
 * placements, and apprenticeships, which are genuine dated employment) counts.
 * Exported so the rule is explicit, testable, and adjustable in one place.
 */
export const NON_PROFESSIONAL_EMPLOYMENT_TYPES = new Set<string>(['VOLUNTEER']);

const MONTH_PRECISION = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Month index (`year*12 + month0`) for a `YYYY-MM` value, or null if not month-precise. */
function monthIndex(value: string): number | null {
  const match = MONTH_PRECISION.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year * 12 + (month - 1);
}

/** Merge closed month intervals and return the total inclusive month count. */
function unionMonths(intervals: { start: number; end: number }[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let cursor: { start: number; end: number } | null = null;
  for (const interval of sorted) {
    if (!cursor) {
      cursor = { ...interval };
      continue;
    }
    // Adjacent or overlapping (gap of one month or less) merges into one run.
    if (interval.start <= cursor.end + 1) {
      cursor.end = Math.max(cursor.end, interval.end);
    } else {
      total += cursor.end - cursor.start + 1;
      cursor = { ...interval };
    }
  }
  if (cursor) total += cursor.end - cursor.start + 1;
  return total;
}

const DURATION_KEY = 'professional_experience_duration';

/**
 * Derive supported professional-experience duration from Experience records.
 *
 * Returns `insufficient` (value `null`) — and therefore no renderable label —
 * whenever there is no qualifying employment, or ANY qualifying record lacks the
 * month precision needed to place it on a timeline. This is deliberately strict:
 * a partial answer computed from some records while silently dropping imprecise
 * ones would be a misleading number, and inventing months to include them would
 * fabricate certainty. Undercounting is never the failure mode — overclaiming is.
 */
export function deriveProfessionalExperience(
  experience: readonly DurationExperienceInput[],
  now = new Date()
): DerivedFact<ExperienceDuration | null> {
  const calculatedAt = now.toISOString();
  const qualifying = experience.filter(
    (role) => !NON_PROFESSIONAL_EMPLOYMENT_TYPES.has((role.type ?? '').trim())
  );
  const supportingFactKeys = qualifying.map((role) => `experience:${role.id}`);

  const insufficient = (reason: string): DerivedFact<ExperienceDuration | null> => ({
    key: DURATION_KEY,
    value: null,
    derivationRule: reason,
    supportingFactKeys,
    calculatedAt,
    confidence: 'insufficient',
  });

  if (qualifying.length === 0) {
    return insufficient('No qualifying professional employment records.');
  }

  const nowMonth = currentProfileMonth(now);
  const intervals: { start: number; end: number }[] = [];
  for (const role of qualifying) {
    const start = monthIndex(role.startDate);
    if (start === null) {
      return insufficient(
        'A qualifying employment record lacks month-precision start; refusing to invent months.'
      );
    }
    const rawEnd = role.current ? nowMonth : role.endDate;
    const end = monthIndex(rawEnd);
    if (end === null) {
      return insufficient(
        'A qualifying employment record lacks month-precision end; refusing to invent months.'
      );
    }
    if (end < start) {
      return insufficient('A qualifying employment record ends before it starts.');
    }
    intervals.push({ start, end });
  }

  const months = unionMonths(intervals);
  return {
    key: DURATION_KEY,
    value: { months, years: months / 12 },
    derivationRule:
      'Union of month-precise professional employment intervals, overlaps merged, volunteer work and undated records excluded.',
    supportingFactKeys,
    calculatedAt,
    confidence: 'deterministic',
  };
}

/**
 * Whether a "N years" experience claim is deterministically supported. A claim
 * is supported only by a `deterministic` duration fact whose months meet or
 * exceed the claimed years in full months. An `insufficient` fact supports no
 * numeric claim at all.
 */
export function durationSupportsYears(
  fact: DerivedFact<ExperienceDuration | null>,
  claimedYears: number
): boolean {
  if (fact.confidence !== 'deterministic' || fact.value === null) return false;
  return fact.value.months >= claimedYears * 12;
}
