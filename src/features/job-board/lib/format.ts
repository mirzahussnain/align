import type {
  Confidence,
  JobCardViewModel,
  SponsorStatus,
} from "@/features/job-board/lib/job-board";

export const sponsorLabels: Record<SponsorStatus, string> = {
  MATCHED: "Employer on UK register",
  AMBIGUOUS: "Possible sponsor-register match",
  NONE: "No evidence detected",
  NOT_CHECKED: "Sponsor-register evidence not checked",
};

/** Longer wording for the details pane, where there is room to be precise. */
export const sponsorStatements: Record<SponsorStatus, string> = {
  MATCHED:
    "This organisation name matches an organisation on the UK sponsor register.",
  AMBIGUOUS: "This organisation may appear on the UK sponsor register.",
  NONE: "No matching organisation was found on the UK sponsor register.",
  NOT_CHECKED: "Sponsor-register evidence has not been checked for this employer.",
};

export const sourceHealthLabels: Record<string, string> = {
  HEALTHY: "Healthy",
  EMPTY: "No current vacancies",
  STALE: "Stale",
  TEMPORARILY_UNAVAILABLE: "Temporarily unavailable",
  DISABLED: "Disabled",
};

export const confidenceLabels: Record<Confidence, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const requirementStrength: Record<string, string> = {
  REQUIRED: "required",
  PREFERRED: "preferred",
  MENTIONED: "mentioned",
  NOT_DETECTED: "not detected",
};

export const sponsorshipSignalLabels: Record<string, string> = {
  AVAILABLE: "Sponsorship stated as available",
  MAY_BE_CONSIDERED: "Sponsorship may be considered",
  NOT_AVAILABLE: "Sponsorship stated as unavailable",
  RIGHT_TO_WORK_REQUIRED: "Existing right to work required",
  NOT_MENTIONED: "No sponsorship wording detected",
};

export const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : undefined;

/**
 * Day-granular "3 days ago". Job freshness is only ever meaningful to the day,
 * so finer units would imply a precision the snapshot does not have.
 */
export function relativeDay(value?: string, now = Date.now()) {
  if (!value) return undefined;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return undefined;
  const days = Math.round((then - now) / 86_400_000);
  if (days === 0) return "today";
  // "always" keeps counts uniform ("1 day ago", "2 days ago") rather than
  // swapping in "yesterday", which reads inconsistently in a column of dates.
  return new Intl.RelativeTimeFormat("en-GB", { numeric: "always" }).format(
    days,
    "day",
  );
}

const compactAmount = (value: number, currency: string) =>
  value >= 1000 && value % 100 === 0
    ? `${currency}${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`
    : `${currency}${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

/** Provider-supplied text always wins; derived ranges stay compact for chips. */
export function salaryLabel(job: JobCardViewModel) {
  if (job.salary?.text) return job.salary.text;
  if (job.salary?.min == null && job.salary?.max == null) return undefined;
  const currency =
    job.salary.currency === "GBP" || !job.salary.currency
      ? "£"
      : `${job.salary.currency} `;
  const range =
    job.salary.min != null && job.salary.max != null
      ? job.salary.min === job.salary.max
        ? compactAmount(job.salary.min, currency)
        : `${compactAmount(job.salary.min, currency)} - ${compactAmount(job.salary.max, currency)}`
      : job.salary.min != null
        ? `From ${compactAmount(job.salary.min, currency)}`
        : `Up to ${compactAmount(job.salary.max!, currency)}`;
  return job.salary.period
    ? `${range} / ${job.salary.period.toLowerCase()}`
    : range;
}

export const humanise = (value?: string) =>
  value
    ? value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())
    : undefined;

/**
 * Monogram stand-in for an employer mark. Company records carry no logo asset,
 * so a derived initial is the honest alternative to sourcing a third-party image.
 */
export function companyInitials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}
