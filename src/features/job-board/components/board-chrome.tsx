"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, ShieldCheck, ShieldOff } from "lucide-react";
import DashboardTopBar from "@/features/dashboard/components/DashboardTopBar";
import { sponsorLabels } from "@/features/job-board/lib/format";
import {
  JOB_BOARD_ROUTES,
  type SponsorStatus,
} from "@/features/job-board/lib/job-board";

export function BoardNavigation({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  const companiesActive = pathname.startsWith(JOB_BOARD_ROUTES.companies);
  const savedActive = pathname === JOB_BOARD_ROUTES.saved;
  const links = [
    [JOB_BOARD_ROUTES.discover, "Discover", !companiesActive && !savedActive],
    [JOB_BOARD_ROUTES.saved, "Saved", savedActive],
    [JOB_BOARD_ROUTES.companies, "Companies", companiesActive],
  ] as const;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 sm:px-6 lg:px-8 dark:border-border-subtle">
      <nav aria-label="Job Board" className="flex min-w-0 overflow-x-auto">
        {links.map(([href, label, active]) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`min-h-11 shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              active
                ? "border-accent-purple text-accent-purple"
                : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-text-secondary dark:hover:text-text-primary"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {action}
    </div>
  );
}

/**
 * Shared board shell. `title` is optional: Discover lets the tab strip act as
 * the heading, while Saved and Companies still need naming above their content.
 */
export function BoardFrame({
  title,
  description,
  children,
  action,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-bg-primary overflow-x-hidden">
      <DashboardTopBar
        title="Job Board"
        subtitle="Discover, save and assess verified vacancies"
        showNewAnalysis={false}
      />
      <BoardNavigation action={action} />
      <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 lg:px-8 w-full min-w-0">
        {title && (
          <div className="mb-5">
            <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-text-primary">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-text-secondary">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </main>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "error";
}) {
  const style =
    tone === "error"
      ? "border-error/30 bg-error/10 text-error"
      : tone === "warning"
        ? "border-warning/30 bg-warning/10 text-neutral-800 dark:text-text-primary"
        : "border-info/25 bg-info/10 text-neutral-700 dark:text-text-primary";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3 py-2.5 text-sm ${style}`}
    >
      {children}
    </div>
  );
}

export function JobSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading jobs">
      {Array.from({ length: count }, (_, item) => (
        <div
          key={item}
          className="h-32 animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-bg-tertiary"
        />
      ))}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?:
    | "neutral"
    | "accent"
    | "purple"
    | "success"
    | "emerald"
    | "warning"
    | "amber"
    | "info"
    | "sky";
  className?: string;
}) {
  const style = {
    neutral:
      "bg-neutral-100 text-neutral-600 border border-neutral-200/60 dark:bg-bg-tertiary dark:text-text-secondary dark:border-border-subtle",
    accent:
      "bg-purple-50 text-accent-purple border border-purple-200/60 dark:bg-accent-purple/10 dark:text-purple-300 dark:border-accent-purple/30",
    purple:
      "bg-purple-50 text-purple-700 border border-purple-200/60 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40",
    success:
      "bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
    emerald:
      "bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
    warning:
      "bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
    amber:
      "bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
    info:
      "bg-sky-50 text-sky-700 border border-sky-200/60 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40",
    sky:
      "bg-sky-50 text-sky-700 border border-sky-200/60 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold ${style} ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-border-subtle dark:bg-bg-secondary">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {typeof title === "string" ? (
            <h3 className="text-sm font-bold text-neutral-900 dark:text-text-primary">
              {title}
            </h3>
          ) : (
            title
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Sponsor-register status always travels with its shield, so the shortened
 * labels ("No evidence detected") can never be read as a general verdict on
 * the vacancy.
 */
export function SponsorEvidenceLine({
  status,
  className = "",
}: {
  status: SponsorStatus;
  className?: string;
}) {
  const { icon: Icon, tone } = {
    MATCHED: { icon: ShieldCheck, tone: "text-success" },
    AMBIGUOUS: { icon: ShieldCheck, tone: "text-neutral-500" },
    NONE: { icon: ShieldOff, tone: "text-neutral-400" },
    NOT_CHECKED: { icon: Shield, tone: "text-neutral-400" },
  }[status];
  return (
    <p className={`flex items-center gap-1.5 text-xs ${tone} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{sponsorLabels[status]}</span>
    </p>
  );
}

/** Label/value row used by the source and sponsor panels. */
export function DataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
      <dt className="shrink-0 text-neutral-500 dark:text-text-tertiary">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right font-medium text-neutral-800 dark:text-text-primary">
        {children}
      </dd>
    </div>
  );
}
