'use client';

import type { ReactNode } from 'react';
import { Plus, Menu } from 'lucide-react';
import { useDashboardStore } from '@/shared/stores/dashboard-store';

interface DashboardTopBarProps {
  title: string;
  subtitle?: string;
  showNewAnalysis?: boolean;
  /** Custom action rendered on the right instead of the default "New analysis". */
  rightSlot?: ReactNode;
}

export default function DashboardTopBar({ title, subtitle, showNewAnalysis = true, rightSlot }: DashboardTopBarProps) {
  const setTab = useDashboardStore((s) => s.setTab);
  const setMobileNavOpen = useDashboardStore((s) => s.setMobileNavOpen);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/85 px-4 py-4 backdrop-blur-md sm:gap-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {/* The sidebar is off-canvas below md, so the only way back to nav is here. */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          className="-ml-1 shrink-0 rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-base font-black tracking-tight text-neutral-900 sm:text-lg">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-xs text-neutral-500">{subtitle}</p>}
        </div>
      </div>

      {rightSlot}

      {!rightSlot && showNewAnalysis && (
        <button
          type="button"
          onClick={() => setTab('analyze')}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent-purple px-3 py-2.5 text-xs font-bold text-white transition-all hover:bg-accent-purple/90 hover:shadow-[0_0_24px_-4px_hsl(262_83%_58%/0.6)] sm:px-4"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="hidden sm:inline">New analysis</span>
          <span className="sr-only sm:hidden">New analysis</span>
        </button>
      )}
    </header>
  );
}
