"use client";

import { Bookmark, Loader2 } from "lucide-react";
import {
  Pill,
  SponsorEvidenceLine,
} from "@/features/job-board/components/board-chrome";
import {
  companyInitials,
  humanise,
  relativeDay,
  salaryLabel,
} from "@/features/job-board/lib/format";
import type { JobCardViewModel } from "@/features/job-board/lib/job-board";

/**
 * The description badge for a card, or nothing.
 *
 * Three rules, all from the brief and all previously violated:
 *
 *  - "Full description" is claimed only when the server says FULL.
 *  - EXTERNAL_ONLY says the text lives elsewhere; it does not claim a partial
 *    body the card does not have.
 *  - When the server sent no description state at all (an older payload) NO
 *    badge is shown. A badge is a claim; an absent field is not evidence for it.
 */
function descriptionBadgeFor(job: JobCardViewModel):
  | { label: string; tone: "emerald" | "amber" | "neutral" }
  | undefined {
  switch (job.descriptionAvailability) {
    case "FULL":
      return { label: "Full description", tone: "emerald" };
    case "PARTIAL":
      return { label: "Partial description", tone: "amber" };
    case "EXTERNAL_ONLY":
      return { label: "Description available externally", tone: "neutral" };
    default:
      return undefined;
  }
}

export function JobResultCard({
  job,
  selected = false,
  availability,
  careerTrackId,
  onSelect,
  onSave,
  saving,
}: {
  job: JobCardViewModel;
  selected?: boolean;
  availability?: string;
  careerTrackId?: string;
  onSelect: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const sponsor = job.sponsorEvidenceSummary?.status;
  const posted = relativeDay(job.postedAt);
  const salaryText = salaryLabel(job);
  const descriptionBadge = descriptionBadgeFor(job);

  return (
    <article
      className={`rounded-2xl border p-3.5 sm:p-4 shadow-sm transition overflow-hidden min-w-0 w-full max-w-full ${
        selected
          ? "border-accent-purple bg-accent-purple/[0.02] ring-1 ring-accent-purple/30 dark:bg-accent-purple/10"
          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-border-subtle dark:bg-bg-secondary"
      }`}
    >
      <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 w-full">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-black tracking-tight text-neutral-600 dark:bg-bg-tertiary dark:text-text-secondary"
        >
          {companyInitials(job.company.displayName)}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <h2 className="text-xs sm:text-sm font-bold leading-snug text-neutral-900 dark:text-text-primary min-w-0 w-full break-words">
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              className="block w-full min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-purple break-words [overflow-wrap:anywhere]"
            >
              {job.title}
            </button>
          </h2>
          <p className="mt-0.5 truncate text-[11px] sm:text-xs text-neutral-500 dark:text-text-secondary min-w-0 max-w-full">
            {job.company.displayName}
            {job.location ? ` • ${job.location}` : ""}
            {posted ? ` • ${posted}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-pressed={job.saved}
          aria-label={job.saved ? `Unsave ${job.title}` : `Save ${job.title}`}
          className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-accent-purple disabled:opacity-60 dark:hover:bg-bg-tertiary dark:hover:text-text-primary"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bookmark
              className="h-4 w-4"
              fill={job.saved ? "currentColor" : "none"}
            />
          )}
        </button>
      </div>

      <div className="mt-2.5 sm:mt-3 flex flex-wrap items-center gap-1.5 sm:pl-12 min-w-0 w-full max-w-full">
        {salaryText ? (
          <Pill tone="purple">{salaryText}</Pill>
        ) : (
          <Pill tone="neutral">Salary not stated</Pill>
        )}
        {/*
          Read from the SERVER-computed description state, not from `freshness`.
          `freshness` is how recently the snapshot was seen; it said nothing
          about the advert body and was FRESH for essentially every result, which
          is why every card claimed a full description.
        */}
        {descriptionBadge && (
          <Pill tone={descriptionBadge.tone}>{descriptionBadge.label}</Pill>
        )}
        {job.workplaceType && (
          <Pill tone="neutral">{humanise(job.workplaceType)}</Pill>
        )}
        {careerTrackId && job.careerTrackRelevance && (
          <Pill tone="accent">
            {humanise(job.careerTrackRelevance)} relevance
          </Pill>
        )}
        {availability === "HISTORICAL" && (
          <Pill tone="warning">Historical saved vacancy</Pill>
        )}
      </div>

      {sponsor && (
        <SponsorEvidenceLine status={sponsor} className="mt-2 sm:mt-2.5 sm:pl-12 min-w-0 max-w-full truncate" />
      )}
    </article>
  );
}
