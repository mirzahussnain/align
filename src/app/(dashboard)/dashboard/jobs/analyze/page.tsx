"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DashboardTopBar from "@/features/dashboard/components/DashboardTopBar";
import { VacancyIntake } from "@/features/job-board/components/VacancyIntake";
import { JOB_BOARD_ROUTES } from "@/features/job-board/lib/job-board";

export default function AnalyseOwnJobPage() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-bg-primary overflow-x-hidden">
      <DashboardTopBar
        title="Jobs & Analysis"
        subtitle="Bring any vacancy, check the practicals, then tailor your CV"
        showNewAnalysis={false}
      />
      {/* Top action bar with Discover Jobs navigation button */}
      <div className="border-b border-neutral-200/80 bg-neutral-50 px-4 py-3 sm:px-6 lg:px-8 dark:border-border-subtle dark:bg-bg-primary">
        <div className="mx-auto max-w-4xl w-full flex items-center justify-between">
          <Link
            href={JOB_BOARD_ROUTES.discover}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-neutral-100 px-3.5 text-xs font-bold text-neutral-800 transition hover:bg-neutral-200 dark:bg-bg-tertiary dark:text-text-primary dark:hover:bg-bg-tertiary/80"
          >
            <ArrowLeft className="h-4 w-4" />
            Discover Jobs
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-6 lg:px-8 w-full min-w-0">
        <VacancyIntake />
      </div>
    </main>
  );
}
