'use client';

import { ArrowRight, AlertTriangle } from 'lucide-react';
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
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-1.5 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {label ? `“${label}” is ${percent}% complete` : `Your profile is ${percent}% complete`}
            </p>
            <p className="text-xs text-amber-700">
              {label
                ? 'Complete this career track to generate a CV from it.'
                : 'Complete your profile to generate a CV.'}
            </p>
          </div>
          <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-amber-200 sm:block">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
        {!onProfileTab && (
          <button
            type="button"
            onClick={() => setTab('profile')}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-600"
          >
            Complete profile <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
