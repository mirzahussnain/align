'use client';

import { Loader2, Sparkles, ArrowRight, Plus, Check } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { ProfileSwap, SwapKind } from '@/shared/types/profile-reasoning';

const KIND_LABELS: Record<SwapKind, string> = {
  project: 'Project',
  experience: 'Experience',
  skill: 'Skill',
  education: 'Education',
  certification: 'Certification',
};

interface Props {
  loading: boolean;
  swaps: ProfileSwap[];
  /** Ids the user has ticked. */
  approved: string[];
  onToggle: (id: string) => void;
  profileLabel: string;
  error: string | null;
}

export default function ProfileBridgeStep({
  loading,
  swaps,
  approved,
  onToggle,
  profileLabel,
  error,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Loader2 className="mb-3 h-6 w-6 animate-spin" />
        <p className="text-sm font-medium">Comparing your profile against this job…</p>
        <p className="mt-1 text-xs text-slate-400">
          Checking whether anything in your profile beats what&apos;s on the CV.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">Couldn&apos;t compare your profile</p>
        <p className="mt-1 text-xs text-amber-700">{error}</p>
        <p className="mt-2 text-xs text-amber-700">
          You can carry on — your CV will be rebuilt from the analysis as usual.
        </p>
      </div>
    );
  }

  if (swaps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Check size={20} strokeWidth={2.5} />
        </span>
        <p className="text-sm font-semibold text-slate-800">
          Your CV already leads with your strongest evidence
        </p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          Nothing in your <span className="font-medium">{profileLabel}</span> profile fits this role
          better than what the CV already shows. Carry on to generate it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-accent-purple/20 bg-purple-50/50 p-3.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-purple" />
        <p className="text-xs leading-relaxed text-slate-600">
          Your <span className="font-semibold">{profileLabel}</span> profile holds{' '}
          <span className="font-semibold">{swaps.length}</span>{' '}
          {swaps.length === 1 ? 'item' : 'items'} that fit this job better than what your CV
          currently shows. Tick the ones to bring in — nothing is added unless you approve it.
        </p>
      </div>

      <div className="space-y-3">
        {swaps.map((swap) => {
          const isApproved = approved.includes(swap.id);
          return (
            <button
              key={swap.id}
              type="button"
              onClick={() => onToggle(swap.id)}
              aria-pressed={isApproved}
              className={cn(
                'w-full rounded-xl border p-4 text-left transition-all',
                isApproved
                  ? 'border-accent-purple bg-purple-50/40 ring-1 ring-accent-purple/30'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    isApproved
                      ? 'border-accent-purple bg-accent-purple text-white'
                      : 'border-slate-300 bg-white'
                  )}
                >
                  {isApproved && <Check size={12} strokeWidth={3} />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {KIND_LABELS[swap.kind]}
                    </span>
                    {swap.confidence === 'high' && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                        Strong match
                      </span>
                    )}
                  </div>

                  {/* The swap itself: what goes out, what comes in. */}
                  {swap.cvItem ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-slate-400 line-through decoration-slate-300">
                        {swap.cvItem}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="font-semibold text-slate-900">{swap.profileItem}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} />
                      <span className="font-semibold text-slate-900">{swap.profileItem}</span>
                      <span className="text-xs text-slate-400">(not currently on your CV)</span>
                    </div>
                  )}

                  {swap.jdRequirement && (
                    <p className="mt-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">Job asks for:</span>{' '}
                      {swap.jdRequirement}
                    </p>
                  )}

                  {swap.rationale && (
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      {swap.rationale}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        Approved items are taken from your saved profile exactly as you recorded them. Align will
        reword them for this role but won&apos;t add achievements your profile doesn&apos;t support.
      </p>
    </div>
  );
}
