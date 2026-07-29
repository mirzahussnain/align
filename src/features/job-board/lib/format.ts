import type {
  CandidateFactState,
  Confidence,
  JobCardViewModel,
  SponsorCheckState,
  SponsorStatus,
} from "@/features/job-board/lib/job-board";

export const sponsorLabels: Record<SponsorStatus, string> = {
  MATCHED: "Employer on UK register",
  AMBIGUOUS: "Possible sponsor-register match",
  NONE: "No sponsor-register match found",
  NOT_CHECKED: "Sponsor-register evidence not checked",
};

/** Longer wording for the details pane, where there is room to be precise. */
export const sponsorStatements: Record<SponsorStatus, string> = {
  MATCHED:
    "This organisation name matches an organisation on the UK sponsor register.",
  AMBIGUOUS:
    "The employer name could correspond to more than one organisation on the UK sponsor register.",
  NONE: "This employer was checked against the current register and no sufficiently reliable match was found.",
  NOT_CHECKED: "Sponsor-register evidence has not yet been checked for this employer.",
};

/**
 * NOT_CHECKED is four different situations, and users act differently on each.
 * "The register is temporarily unavailable" invites a retry; "this employer
 * could not be identified" does not. None of them means "no match found".
 */
export const sponsorCheckStateLabels: Record<SponsorCheckState, string> = {
  NEVER_CHECKED: "Not checked yet",
  CHECK_UNAVAILABLE: "Check unavailable",
  EMPLOYER_UNIDENTIFIABLE: "Employer name cannot be checked",
  COMPANY_UNRESOLVED: "Employer not yet identified",
};

export const sponsorCheckStateStatements: Record<SponsorCheckState, string> = {
  NEVER_CHECKED:
    "This employer has not yet been checked against the UK sponsor register.",
  CHECK_UNAVAILABLE:
    "The sponsor register could not be reached, so no check has been completed. This is not a statement that the employer is absent from it.",
  EMPLOYER_UNIDENTIFIABLE:
    "The employer name supplied by the job source cannot be matched to an organisation, so no register check was made.",
  COMPANY_UNRESOLVED:
    "This vacancy is not yet linked to a confirmed employer record, so no register check has been made.",
};

/** Deliberately word-based, never colour-only: each state carries its own label. */
export const factStateLabels: Record<CandidateFactState, string> = {
  CONFIRMED: "Confirmed",
  CONFLICT: "Potential conflict",
  UNKNOWN: "Not confirmed",
  NOT_APPLICABLE: "Not applicable",
};

export const practicalCategoryLabels: Record<string, string> = {
  RIGHT_TO_WORK: "Right to work",
  SPONSORSHIP: "Sponsorship",
  VISA_DURATION: "Work permission duration",
  LOCATION: "Location",
  RELOCATION: "Relocation",
  COMMUTE: "Commute",
  REMOTE_ONSITE: "Remote, hybrid or on-site",
  DRIVING_LICENCE: "Driving licence",
  VEHICLE: "Access to a vehicle",
  DBS: "DBS check",
  SECURITY_CLEARANCE: "Security clearance",
  UK_RESIDENCY: "UK residency",
  PROFESSIONAL_REGISTRATION: "Professional registration",
  SHIFT_AVAILABILITY: "Shift availability",
  TRAVEL: "Travel",
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
