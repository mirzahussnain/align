"use client";

import {
  AlertTriangle,
  Bookmark,
  Check,
  CheckCircle2,
  Edit3,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { JobDetailsViewModel } from "@/features/job-board/lib/job-board";

interface Step2CheckResultsProps {
  details: JobDetailsViewModel;
  partialAccepted: boolean;
  setPartialAccepted: (val: boolean) => void;
  cvReady: boolean;
  analysing: boolean;
  onAnalyse: () => void;
  saving: boolean;
  saved: boolean;
  onSaveJob: () => void;
  onEditStep1: () => void;
}

function humanise(value?: string) {
  if (!value) return "Not checked";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

export function Step2CheckResults({
  details,
  partialAccepted,
  setPartialAccepted,
  cvReady,
  analysing,
  onAnalyse,
  saving,
  saved,
  onSaveJob,
  onEditStep1,
}: Step2CheckResultsProps) {
  const sponsorStatus = details.sponsorEvidence.status;
  const vacancySignal = details.vacancySponsorship?.signal;
  const practical = details.practicalCompatibility;
  const isDescriptionPartial = details.description.completeness !== "FULL";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-border-subtle dark:bg-bg-secondary sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-neutral-100 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-border-subtle">
        <div>
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-100 px-2.5 text-xs font-extrabold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Step 2: Practical Check Results
          </span>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-900 dark:text-text-primary">
            {details.job.title}
          </h2>
          <p className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-text-secondary">
            {details.job.company.displayName}
            {details.job.location ? ` · ${details.job.location}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onEditStep1}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 text-xs font-bold text-neutral-700 transition hover:bg-neutral-100 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
        >
          <Edit3 className="h-3.5 w-3.5" />
          Edit Vacancy Input
        </button>
      </div>

      {/* Grid of Check Results */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-border-subtle dark:bg-bg-tertiary/30">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <ShieldCheck className="h-4 w-4 text-accent-cyan" />
            Sponsor Register Status
          </p>
          <p className="mt-2 text-base font-bold text-neutral-900 dark:text-text-primary">
            {humanise(sponsorStatus)}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-text-secondary">
            {details.sponsorEvidence.reasons?.[0] ??
              details.sponsorEvidence.disclaimer}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-border-subtle dark:bg-bg-tertiary/30">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Vacancy Wording Signal
          </p>
          <p className="mt-2 text-base font-bold text-neutral-900 dark:text-text-primary">
            {humanise(vacancySignal)}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-text-secondary">
            {details.vacancySponsorship?.reasons?.[0] ??
              "No sponsorship wording was detected."}
          </p>
        </div>
      </div>

      {/* Practical Compatibility */}
      <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-border-subtle dark:bg-bg-tertiary/30 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Practical Profile Compatibility
        </h3>
        {practical?.items.length ? (
          <>
            <p className="text-xs font-semibold text-neutral-600 dark:text-text-secondary">
              {practical.summary.confirmed} confirmed ·{" "}
              {practical.summary.conflicts} potential conflicts ·{" "}
              {practical.summary.unknown} unconfirmed
            </p>
            <ul className="space-y-2">
              {practical.items.slice(0, 5).map((item, index) => (
                <li
                  key={`${item.category}-${index}`}
                  className="flex items-start gap-2.5 rounded-lg bg-white p-3 text-xs shadow-xs dark:bg-bg-secondary"
                >
                  {item.state === "CONFLICT" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  ) : (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                  <span className="text-neutral-700 dark:text-text-primary">
                    <strong>{humanise(item.category)}:</strong>{" "}
                    {item.explanation}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-neutral-500">
            No practical requirements in this advert could be compared with your recorded profile facts.
          </p>
        )}
      </div>

      {/* Partial Description Warning Checkbox */}
      {isDescriptionPartial && (
        <label className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <input
            type="checkbox"
            checked={partialAccepted}
            onChange={(e) => setPartialAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-300 text-accent-cyan focus:ring-accent-cyan"
          />
          <span>
            This text shows signs of being incomplete. Check this box to proceed with a reduced-confidence AI analysis.
          </span>
        </label>
      )}

      {/* Action Buttons: Analyze In Depth with AI & Save Job */}
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onAnalyse}
          disabled={!cvReady || !partialAccepted || analysing}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {analysing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {analysing ? "Analysing CV fit..." : "Analyze In Depth with AI"}
        </button>

        <button
          type="button"
          onClick={onSaveJob}
          disabled={saved || saving}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-neutral-100 px-5 text-sm font-bold text-neutral-800 transition hover:bg-neutral-200 disabled:opacity-60 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary dark:hover:bg-bg-tertiary/80"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
          )}
          {saved ? "Job Saved" : "Save Job"}
        </button>
      </div>

      <p className="text-[11px] text-neutral-400">
        {details.sponsorEvidence.disclaimer}
      </p>
    </div>
  );
}
