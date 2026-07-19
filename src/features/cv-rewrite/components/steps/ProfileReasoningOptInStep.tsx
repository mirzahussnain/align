'use client';

import { Layers, FileText, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface Props {
  enabled: boolean;
  onSelect: (val: boolean) => void;
  /** Career track being compared against, e.g. "Software Engineer". */
  profileLabel: string;
  /** Reasoning runs left this month; null when the plan is unmetered. */
  remaining: number | null;
}

/**
 * Explicit opt-in for profile-vs-CV reasoning.
 *
 * This step exists because the feature previously ran automatically whenever the
 * entitlement allowed it, which made it invisible: users could not tell it had
 * happened, and had no way to decline. It also costs an AI call and several
 * seconds, so silently spending both on someone's behalf was the wrong default.
 */
export default function ProfileReasoningOptInStep({
  enabled,
  onSelect,
  profileLabel,
  remaining,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">
          Check your profile for stronger evidence?
        </h3>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          The CV you analysed is a snapshot. Your <strong>{profileLabel}</strong> profile holds
          everything you&apos;ve recorded — which may include a project or skill that fits this job
          better than what the CV currently leads with. We can compare the two and let you choose
          what to swap in.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onSelect(false)}
          className={cn(
            'text-left p-5 rounded-2xl border-2 transition-all duration-200',
            !enabled
              ? 'border-slate-800 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          )}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className={cn(
                'p-2 rounded-xl',
                !enabled ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500'
              )}
            >
              <FileText size={20} />
            </div>
            <h4 className={cn('font-bold', !enabled ? 'text-slate-900' : 'text-slate-600')}>
              Use the CV as-is
            </h4>
          </div>
          <p className="text-sm text-slate-500">
            Rewrite only what&apos;s already on the analysed CV. Faster, and uses none of your
            reasoning allowance.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelect(true)}
          className={cn(
            'relative text-left p-5 rounded-2xl border-2 transition-all duration-200',
            enabled
              ? 'border-accent-purple bg-purple-50/30'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          )}
        >
          {enabled && (
            <div className="absolute -top-3 -right-3 bg-accent-purple text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
              Recommended
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div
              className={cn(
                'p-2 rounded-xl',
                enabled ? 'bg-purple-100 text-accent-purple' : 'bg-slate-100 text-slate-500'
              )}
            >
              <Layers size={20} />
            </div>
            <h4 className={cn('font-bold', enabled ? 'text-slate-900' : 'text-slate-600')}>
              Compare with my profile
            </h4>
          </div>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-accent-purple" /> Finds better-fitting projects
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-accent-purple" /> Surfaces skills the CV buried
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600">
              <Clock size={16} className="text-slate-400" /> Adds ~10 seconds
            </li>
          </ul>
        </button>
      </div>

      <p className="text-xs text-slate-400">
        {remaining === null
          ? 'Nothing is changed without your approval — you review every suggestion before it reaches the CV.'
          : `${remaining} reasoning ${remaining === 1 ? 'run' : 'runs'} left this month. Nothing is changed without your approval.`}
      </p>
    </div>
  );
}
