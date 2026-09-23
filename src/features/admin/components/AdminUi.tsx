import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export function AdminPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-text-primary">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">{description}</p>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-text-secondary">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-tertiary text-accent-cyan">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-text-primary tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-text-tertiary">{detail}</p>
    </section>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: 'neutral' | 'success' | 'error' | 'accent' | 'warning';
  children: React.ReactNode;
}) {
  const tones = {
    neutral: 'bg-bg-tertiary text-text-secondary',
    success: 'bg-success/10 text-success',
    error: 'bg-error/10 text-error',
    accent: 'bg-accent-cyan/10 text-accent-cyan',
    warning: 'bg-warning/10 text-amber-700',
  } as const;
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function Pagination({
  basePath,
  page,
  totalPages,
  total,
  params,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const hrefFor = (target: number) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    query.set('page', String(target));
    return `${basePath}?${query.toString()}`;
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-4 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between">
      <p className="tabular-nums">
        {total.toLocaleString()} result{total === 1 ? '' : 's'} · Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border-subtle px-3 font-semibold hover:border-border-default hover:text-text-primary">
            <ChevronLeft className="h-4 w-4" /> Previous
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border-subtle px-3 opacity-40">
            <ChevronLeft className="h-4 w-4" /> Previous
          </span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border-subtle px-3 font-semibold hover:border-border-default hover:text-text-primary">
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border-subtle px-3 opacity-40">
            Next <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );
}

export function formatAdminDate(date: Date | null): string {
  if (!date) return 'Unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatAdminDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function capabilityLabel(value: string | null): string {
  if (!value) return 'No usage yet';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
