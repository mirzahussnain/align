'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { useDashboardStore } from '@/shared/stores/dashboard-store';

/**
 * Persistent nudge shown whenever the ACTIVE career track isn't 100% complete.
 *
 * Completeness is per profile, not per user: with several tracks, one can be
 * finished while another is still empty. The percentage already followed the
 * active profile, but the copy said "your profile", which reads as an account-
 * wide state and makes a completed track look wrongly flagged. Naming the track
 * makes it obvious that switching tracks changes what this refers to.
 *
 * Shown on the profile tab too — that is where the gaps are actually filled, so
 * hiding it there removed the reminder exactly when it was most useful. Only
 * the redundant "go to profile" action drops away.
 */
export default function ProfileCompletionBanner({
  percent,
  label,
  onProfileTab = false,
}: {
  percent: number;
  label?: string;
  onProfileTab?: boolean;
}) {
  const setTab = useDashboardStore((s) => s.setTab);

  if (percent >= 100) return null;

  return (
    <div className="border-b border-accent-cyan/15 bg-gradient-to-r from-accent-cyan/[0.08] via-sky-500/[0.04] to-slate-900/[0.03] px-4 py-3.5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Sparkles className="h-4 w-4 text-accent-cyan" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {label ? (
                <>
                  <span className="font-bold text-slate-900">Profile — {label}</span> is{' '}
                  {percent}% complete
                </>
              ) : (
                `Your profile is ${percent}% complete`
              )}
            </p>
            <p className="text-xs text-slate-500">
              {label
                ? 'Complete this career track to generate a CV from it.'
                : 'Complete your profile to generate a CV.'}
            </p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-accent-cyan transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums text-slate-700">{percent}%</span>
          </div>
        </div>
        {!onProfileTab && (
          <button
            type="button"
            onClick={() => setTab('profile')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-700 shadow-sm transition-colors hover:bg-amber-50"
          >
            Complete profile <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
