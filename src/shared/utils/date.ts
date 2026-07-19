const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `YYYY-MM`, the storage format for every profile date. */
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

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
export function formatMonth(value: string | null | undefined): string {
  if (!value) return '';
  const match = ISO_MONTH.exec(value.trim());
  if (!match) return value.trim();

  const [, year, month] = match;
  const label = MONTHS[Number(month) - 1];
  return label ? `${label} ${year}` : year;
}

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
  const from = formatMonth(start);
  const to = current ? 'Present' : formatMonth(end);

  if (from && to) return `${from} – ${to}`;
  return from || to || '';
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
