const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Profile dates preserve the precision supplied by the user. */
const ISO_YEAR = /^(\d{4})$/;
const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * How a canonical `YYYY` / `YYYY-MM` date is presented. Chosen per template via
 * its capability, so the SAME canonical evidence can render differently across
 * templates without changing meaning. Every style preserves the stored
 * precision: a year-only value never gains a month, and no start date is ever
 * invented — the choice is purely how a known value is spelled.
 */
export type DateDisplayStyle =
  | 'short_month_year'
  | 'long_month_year'
  | 'numeric_month_year'
  | 'year_only_when_possible';

/**
 * Render one canonical date in the requested style. Non-canonical input (already
 * display text like "Jan 2022", or free text from an uploaded CV) is returned
 * unchanged so historical and AI-authored values keep rendering.
 */
export function formatProfileDateStyled(
  value: string | null | undefined,
  style: DateDisplayStyle
): string {
  if (!value) return '';
  const trimmed = value.trim();

  const yearMatch = ISO_YEAR.exec(trimmed);
  if (yearMatch) return yearMatch[1]; // year-only stays year-only in every style

  const monthMatch = ISO_MONTH.exec(trimmed);
  if (!monthMatch) return trimmed; // not canonical — pass through untouched

  const [, year, month] = monthMatch;
  const index = Number(month) - 1;
  switch (style) {
    case 'numeric_month_year':
      return `${month}/${year}`;
    case 'long_month_year':
      return MONTHS_LONG[index] ? `${MONTHS_LONG[index]} ${year}` : year;
    case 'year_only_when_possible':
      return year;
    case 'short_month_year':
    default:
      return MONTHS[index] ? `${MONTHS[index]} ${year}` : year;
  }
}

/**
 * Styled counterpart to {@link formatDateRange}. `current` still wins over any
 * stored end date, and a missing end degrades to just the start — the only thing
 * the style changes is how each known endpoint is spelled.
 */
export function formatDateRangeStyled(
  start: string | null | undefined,
  end: string | null | undefined,
  style: DateDisplayStyle,
  current = false
): string {
  const from = formatProfileDateStyled(start, style);
  const to = current ? 'Present' : formatProfileDateStyled(end, style);
  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}

/** True only for the canonical profile-date storage formats: `YYYY` or `YYYY-MM`. */
export function isProfileDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return ISO_YEAR.test(trimmed) || ISO_MONTH.test(trimmed);
}

/**
 * Whether two precise profile dates establish that `end` precedes `start`.
 * A year-only value does not imply January or December, so mixed-precision
 * dates in the same year are intentionally incomparable rather than guessed.
 */
export function isProfileDateBefore(end: string, start: string): boolean {
  if (!isProfileDate(end) || !isProfileDate(start)) return false;
  const [endYear, endMonth] = end.trim().split('-');
  const [startYear, startMonth] = start.trim().split('-');
  if (endYear !== startYear) return endYear < startYear;
  if (!endMonth || !startMonth) return false;
  return endMonth < startMonth;
}

/**
 * Render a stored profile date for display: `2022-01` becomes `Jan 2022`.
 *
 * Profile dates are captured by a month picker and stored ISO precisely so the
 * presentation can be decided here instead of at input time — a CV template is
 * free to want "01/2022" or "January 2022" later without touching the data.
 *
 * Anything not in ISO month form is returned unchanged. Rows created before the
 * picker existed hold free text like "Jan 2022" or "2018", and passing those
 * through keeps old CVs rendering rather than blanking their dates.
 */
export function formatProfileDate(value: string | null | undefined): string {
  return formatProfileDateStyled(value, 'short_month_year');
}

/** @deprecated Use `formatProfileDate` for profile values. */
export const formatMonth = formatProfileDate;

/**
 * Render a start–end pair as one string, e.g. `Jan 2022 – Present`.
 *
 * `current` wins over any stored end date: an ongoing role keeps `endDate` null,
 * and this is the single place that decides what "ongoing" looks like on a CV.
 * A missing end date on a non-current row degrades to just the start rather
 * than emitting a dangling separator.
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  current = false
): string {
  return formatDateRangeStyled(start, end, 'short_month_year', current);
}

/**
 * Converts an ISO date string into a human-readable "time ago" string.
 * @param dateStr ISO date string
 * @returns Human readable time ago string (e.g., 'Today', '2d ago', '1mo ago')
 */
export const getTimeAgo = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    return 'Recent';
  }
};
