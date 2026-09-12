'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Plus, Menu, ChevronDown, FileSearch, Briefcase } from 'lucide-react';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import { cn } from '@/shared/utils/cn';

interface DashboardTopBarProps {
  title: string;
  subtitle?: string;
  showNewAnalysis?: boolean;
  /** Custom action rendered on the right instead of the default split action button. */
  rightSlot?: ReactNode;
}

export default function DashboardTopBar({
  title,
  subtitle,
  showNewAnalysis = true,
  rightSlot,
}: DashboardTopBarProps) {
  const setTab = useDashboardStore((s) => s.setTab);
  const setMobileNavOpen = useDashboardStore((s) => s.setMobileNavOpen);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dropdownOpen]);

  const handleDefaultAction = () => {
    setDropdownOpen(false);
    setTab('analyze');
  };

  const handleAtsAction = () => {
    setDropdownOpen(false);
    setTab('analyze');
  };

  const handleJobMatchAction = () => {
    setDropdownOpen(false);
    setTab('job_match');
  };

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/85 px-4 py-4 backdrop-blur-md sm:gap-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {/* The sidebar is off-canvas below md, so the only way back to nav is here. */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open Navigation"
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
        <div className="relative inline-flex shrink-0 items-center">
          <div className="inline-flex items-center rounded-xl bg-slate-900 shadow-sm transition-all hover:bg-slate-800 focus-within:ring-2 focus-within:ring-accent-cyan">
            {/* Primary Action: redirects to Workspace -> CV Analysis by default */}
            <button
              type="button"
              onClick={handleDefaultAction}
              className="inline-flex items-center gap-2 rounded-l-xl py-2.5 pl-3.5 pr-2.5 text-xs font-bold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none sm:px-4"
              title="New Analysis (Workspace: CV Analysis)"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <span>New Analysis</span>
            </button>

            {/* Hairline Divider */}
            <div className="h-4 w-px bg-white/20 shrink-0" aria-hidden="true" />

            {/* Dropdown Toggle Arrow */}
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
              aria-label="Analysis options"
              className="inline-flex items-center justify-center rounded-r-xl p-2.5 text-white/80 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none"
            >
              <ChevronDown
                className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', dropdownOpen && 'rotate-180')}
              />
            </button>
          </div>

          {dropdownOpen && (
            <>
              {/* Click-outside backdrop */}
              <button
                type="button"
                aria-label="Close analysis options"
                tabIndex={-1}
                onClick={() => setDropdownOpen(false)}
                className="fixed inset-0 z-40 cursor-default bg-transparent"
              />

              {/* Dropdown Menu */}
              <div
                role="menu"
                aria-orientation="vertical"
                className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-black/5 focus:outline-none"
              >
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  New Analysis
                </div>

                {/* Option 1: ATS Analysis -> Workspace -> CV Analysis */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleAtsAction}
                  className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-accent-cyan transition-colors group-hover:bg-accent-cyan/15">
                    <FileSearch className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="block text-xs font-bold text-slate-900 group-hover:text-slate-950">
                        ATS Analysis
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                        Default
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      Score & optimize CV readiness
                    </span>
                  </span>
                </button>

                {/* Option 2: Job Match -> Workspace -> Job Match */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleJobMatchAction}
                  className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-slate-200/80">
                    <Briefcase className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 group-hover:text-slate-950">
                      Job Match
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      Match CV against target job
                    </span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
