"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Check,
  Crown,
  Loader2,
  Lock,
  Sparkles,
  X,
} from "lucide-react";
import type { CVAnalysisResult } from "@/shared/types/cv";
import { PLAN_COMPARISON_FEATURES } from "@/shared/constants/vacancy-intake-stepper";

interface Step3AnalysisOrUpgradeProps {
  isRestricted: boolean;
  result: CVAnalysisResult | null;
  analysing: boolean;
  onAnalyse: () => void;
  saved: boolean;
  saving: boolean;
  onSaveJob: () => void;
  onOpenUpgrade?: () => void;
}

export function Step3AnalysisOrUpgrade({
  isRestricted,
  result,
  analysing,
  onAnalyse,
  saved,
  saving,
  onSaveJob,
  onOpenUpgrade,
}: Step3AnalysisOrUpgradeProps) {
  const score =
    result?.jobMatchReport?.overview.score ?? result?.overallScore ?? null;

  if (isRestricted) {
    return (
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-b from-purple-50/70 via-white to-purple-50/30 p-6 shadow-sm dark:border-purple-900/40 dark:from-purple-950/20 dark:via-bg-secondary dark:to-purple-950/10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-purple-100 px-3 text-xs font-extrabold uppercase tracking-wide text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              <Crown className="h-3.5 w-3.5 text-accent-purple" />
              Pro Feature
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-900 dark:text-text-primary">
              Upgrade to Unlock In-Depth AI Matching & Tailoring
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-text-secondary">
              In-depth ATS & requirement matching and automated CV tailoring are available on Align Pro.
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-purple/10 text-accent-purple">
            <Lock className="h-6 w-6" />
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="overflow-hidden rounded-xl border border-purple-100 bg-white shadow-xs dark:border-border-subtle dark:bg-bg-tertiary/40">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-purple-100 bg-purple-50/50 dark:border-border-subtle dark:bg-bg-tertiary">
                <th className="p-3.5 font-bold text-neutral-900 dark:text-text-primary">Feature</th>
                <th className="p-3.5 font-bold text-neutral-500">Free Tier</th>
                <th className="p-3.5 font-bold text-accent-purple">Pro Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-50 dark:divide-border-subtle">
              {PLAN_COMPARISON_FEATURES.map((item, idx) => (
                <tr
                  key={idx}
                  className={item.highlight ? "bg-purple-50/30 dark:bg-purple-950/10" : ""}
                >
                  <td className="p-3.5 font-semibold text-neutral-800 dark:text-text-primary">
                    {item.feature}
                  </td>
                  <td className="p-3.5 text-neutral-500">
                    {item.free === "Not Included" ? (
                      <span className="inline-flex items-center gap-1 text-neutral-400">
                        <X className="h-3 w-3 text-neutral-300" /> Not Included
                      </span>
                    ) : (
                      item.free
                    )}
                  </td>
                  <td className="p-3.5 font-bold text-accent-purple">
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> {item.pro}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-neutral-500">
            Cancel or switch plans anytime. 14-day money-back guarantee.
          </p>
          {onOpenUpgrade ? (
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-purple px-6 text-sm font-bold text-white shadow-md transition hover:bg-accent-purple/90"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade to Pro
            </button>
          ) : (
            <Link
              href="/dashboard?tab=billing"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-purple px-6 text-sm font-bold text-white shadow-md transition hover:bg-accent-purple/90"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade to Pro
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-border-subtle dark:bg-bg-secondary sm:p-6 space-y-6">
      {!result ? (
        <div className="text-center py-6 space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-accent-purple dark:bg-accent-purple/10">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-xl font-black text-neutral-900 dark:text-text-primary">
              Ready for In-Depth AI Analysis
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-text-secondary max-w-md mx-auto">
              Run AI Job Match analysis to measure exact CV compatibility and generate tailored application statements.
            </p>
          </div>
          <button
            type="button"
            onClick={onAnalyse}
            disabled={analysing}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent-purple px-8 text-sm font-bold text-white shadow-md transition hover:bg-accent-purple/90 disabled:opacity-50"
          >
            {analysing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analysing ? "Analysing CV fit..." : "Run AI Analysis Now"}
          </button>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-center gap-4 p-5 sm:p-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl font-black text-emerald-700 shadow-sm dark:bg-bg-secondary dark:text-emerald-300">
              {score}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                CV Fit Analysed
              </p>
              <h3 className="mt-1 text-lg font-black text-neutral-900 dark:text-text-primary">
                Your role-specific report is ready
              </h3>
            </div>
          </div>

          <div className="grid gap-3 border-t border-emerald-200 p-4 sm:grid-cols-2 dark:border-emerald-900/40">
            {result.analysisId && (
              <Link
                href={`/dashboard?tab=job_matches&analysis=${encodeURIComponent(result.analysisId)}`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                Review & Tailor CV
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            <button
              type="button"
              onClick={onSaveJob}
              disabled={saved || saving}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:bg-bg-secondary dark:text-emerald-300"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
              )}
              {saved ? "Job Saved" : "Save Job"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
