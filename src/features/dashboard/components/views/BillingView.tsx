'use client';

import { Check } from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import { cn } from '@/shared/utils/cn';
import { PLANS } from '@/shared/constants/plans';
import type { StorageUsage } from '@/shared/services/storage-quota';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A used/limit bar. An unlimited allowance renders as a full-width muted track. */
function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const unlimited = limit === null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const nearLimit = !unlimited && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-700">{label}</p>
        <p className="text-xs tabular-nums text-neutral-500">
          {used}
          {unlimited ? ' / Unlimited' : ` / ${limit}`}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            unlimited ? 'w-full bg-neutral-300' : nearLimit ? 'bg-amber-500' : 'bg-accent-purple'
          )}
          style={unlimited ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingView({ tier, storage }: { tier: string; storage: StorageUsage }) {
  return (
    <>
      <DashboardTopBar title="Plan & billing" subtitle="Your subscription" showNewAnalysis={false} />

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          You&apos;re on the <span className="font-bold capitalize">{tier}</span> plan. Upgrades aren&apos;t wired to a
          payment provider yet — these tiers are shown for reference.
        </div>

        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-neutral-900">Storage</h2>
            <p className="text-[11px] text-neutral-400">{formatBytes(storage.bytesUsed)} archived</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UsageMeter label="Stored CVs" used={storage.storedCvs} limit={storage.maxStoredCvs} />
            <UsageMeter
              label="Analyses kept"
              used={storage.storedAnalyses}
              limit={storage.maxStoredAnalyses}
            />
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
            {storage.sourceRetentionDays === null
              ? 'Your uploaded CV files are kept indefinitely.'
              : `Uploaded CV files are kept for ${storage.sourceRetentionDays} days, then removed. Your analysis results and scores are always kept.`}
            {' '}Once you pass a limit, the oldest items are removed automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((t) => {
            const isCurrent = t.id === tier;
            return (
              <div
                key={t.id}
                className={cn(
                  'flex flex-col rounded-2xl border bg-white p-6',
                  isCurrent ? 'border-accent-purple ring-1 ring-accent-purple' : 'border-neutral-200'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{t.name}</p>
                  {isCurrent && (
                    <span className="rounded-full bg-accent-purple/10 px-2 py-0.5 text-[10px] font-bold text-accent-purple">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-3 text-3xl font-black tracking-tight text-neutral-900">
                  {t.price}
                  <span className="text-sm font-medium text-neutral-400">{t.period}</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">{t.tagline}</p>
                <ul className="mb-6 mt-5 flex flex-col gap-2.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-neutral-600">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-purple" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled
                  className="mt-auto cursor-not-allowed rounded-full border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-400"
                >
                  {isCurrent ? 'Current plan' : 'Coming soon'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
