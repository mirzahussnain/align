/**
 * Date reading for CV text.
 *
 * The single rule this module exists to enforce: a date is only ever produced
 * from something the CV actually wrote down. There is no inference, no "assume
 * January", no filling a missing end date from the next role's start. A range we
 * cannot read confidently comes back as nulls, and the import review asks the
 * user rather than presenting a guess as a fact.
 *
 * Output is the repository's profile-date format (`YYYY` or `YYYY-MM`, see
 * src/shared/utils/date.ts), so parsed values drop straight into Experience,
 * Education and the rest without a second conversion.
 */

const MONTHS: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

/** Words a CV uses for "I am still here". Never inferred from a missing end. */
const PRESENT_WORDS = /^(present|current|now|to date|ongoing|till date|date)$/i;

// Non-capturing on purpose: YEAR is embedded inside larger patterns, and a
// capturing group here would silently shift every group index that follows it.
const YEAR = String.raw`(?:19|20)\d{2}`;
const MONTH_WORD = Object.keys(MONTHS).join('|');

/** "Jan 2020", "January 2020", "Jan. 2020", "Jan-2020". */
const MONTH_YEAR = new RegExp(String.raw`^(${MONTH_WORD})\.?[\s\-/]+(${YEAR})$`, 'i');
/** "01/2020", "1-2020", "2020/01", "2020-01". */
const NUMERIC_MONTH_YEAR = /^(\d{1,2})[\/\-.](\d{4})$|^(\d{4})[\/\-.](\d{1,2})$/;
const YEAR_ONLY = new RegExp(String.raw`^${YEAR}$`);

/** A single date token → `YYYY-MM` / `YYYY`, or null when it is not a date. */
export function parseCvDateToken(raw: string): string | null {
  const token = raw.trim().replace(/[,.]$/, '');
  if (!token) return null;

  if (YEAR_ONLY.test(token)) return token;

  const monthYear = MONTH_YEAR.exec(token);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase()];
    return month ? `${monthYear[2]}-${month}` : null;
  }

  const numeric = NUMERIC_MONTH_YEAR.exec(token);
  if (numeric) {
    const [month, year] = numeric[1] ? [numeric[1], numeric[2]] : [numeric[4], numeric[3]];
    const index = Number(month);
    // A "13" is not a month. Rather than guess at a day/month/year ordering we
    // decline the whole token — a wrong date on a CV is worse than no date.
    if (!Number.isInteger(index) || index < 1 || index > 12) return null;
    return `${year}-${String(index).padStart(2, '0')}`;
  }

  return null;
}

export interface ParsedDateRange {
  start: string | null;
  end: string | null;
  /** True only where the CV wrote an explicit "Present"-style word. */
  current: boolean;
}

const RANGE_SEPARATOR = /\s*(?:–|—|-|\bto\b|\buntil\b|\bthrough\b)\s*/i;

/**
 * Read a date range out of a fragment of a CV line.
 *
 * Accepts the shapes CVs actually use — "Jan 2020 – Mar 2022", "2019 to
 * present", "03/2018 - 09/2020" — and refuses everything else. A range whose
 * start cannot be read returns all-null even if the end could be: half a range
 * attributed to a job is a fact the CV never stated.
 */
export function parseCvDateRange(fragment: string): ParsedDateRange {
  const cleaned = fragment.replace(/[()\[\]]/g, ' ').trim();
  if (!cleaned) return { start: null, end: null, current: false };

  const parts = cleaned.split(RANGE_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { start: null, end: null, current: false };

  const start = parseCvDateToken(parts[0]);
  if (!start) return { start: null, end: null, current: false };

  if (parts.length === 1) return { start, end: null, current: false };

  const tail = parts[parts.length - 1];
  if (PRESENT_WORDS.test(tail)) return { start, end: null, current: true };

  const end = parseCvDateToken(tail);
  // An unreadable end is "not stated", never "still there": marking someone as
  // currently employed because we failed to parse their leaving date would put
  // a false claim on their CV.
  return { start, end, current: false };
}

/** The date-range fragment inside a line, if the line carries one. */
const DATE_FRAGMENT = new RegExp(
  String.raw`((?:${MONTH_WORD})\.?[\s\-/]+${YEAR}|\d{1,2}[\/\-.]\d{4}|${YEAR}[\/\-.]\d{1,2}|${YEAR})` +
    String.raw`(?:\s*(?:–|—|-|to|until|through)\s*` +
    String.raw`((?:${MONTH_WORD})\.?[\s\-/]+${YEAR}|\d{1,2}[\/\-.]\d{4}|${YEAR}[\/\-.]\d{1,2}|${YEAR}|present|current|now|ongoing|to date))?`,
  'i'
);

export interface DateFragmentMatch extends ParsedDateRange {
  /** The matched text, so the caller can strip it and keep the rest. */
  matched: string;
}

/** Find and parse the first date range in a line. Null when there is none. */
export function findDateRange(line: string): DateFragmentMatch | null {
  const match = DATE_FRAGMENT.exec(line);
  if (!match) return null;
  const parsed = parseCvDateRange(match[0]);
  if (!parsed.start) return null;
  return { ...parsed, matched: match[0] };
}
