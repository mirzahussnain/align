import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Real change vs the previous data point. Omit when there is nothing to compare. */
  delta?: { value: number; suffix: string };
  sublabel?: string;
  tint: 'purple' | 'cyan' | 'amber' | 'emerald';
}

const TINTS = {
  purple: 'bg-accent-cyan/10 text-accent-cyan',
  cyan: 'bg-accent-cyan/10 text-accent-cyan',
  amber: 'bg-amber-100 text-amber-600',
  emerald: 'bg-emerald-100 text-emerald-600',
} as const;

export default function StatCard({ icon: Icon, label, value, delta, sublabel, tint }: StatCardProps) {
  const isUp = delta ? delta.value >= 0 : false;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TINTS[tint])}>
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <p className="text-xs font-semibold text-neutral-500">{label}</p>
      </div>

      <p className="mt-4 text-3xl font-black tracking-tight text-neutral-900 tabular-nums">{value}</p>

      {delta ? (
        <p
          className={cn(
            'mt-1.5 inline-flex items-center gap-1 text-xs font-semibold',
            isUp ? 'text-emerald-600' : 'text-rose-600'
          )}
        >
          {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span className="tabular-nums">
            {isUp ? '+' : ''}
            {delta.value}
          </span>
          <span className="font-medium text-neutral-400">{delta.suffix}</span>
        </p>
      ) : sublabel ? (
        <p className="mt-1.5 text-xs font-medium text-neutral-400">{sublabel}</p>
      ) : null}
    </div>
  );
}
