'use client';

import Link from 'next/link';
import { BriefcaseBusiness } from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import { VacancyIntake } from '@/features/job-board/components/VacancyIntake';
import { JOB_BOARD_ROUTES } from '@/features/job-board/lib/job-board';

export default function JobMatchView() {
  return (
    <>
      <DashboardTopBar title="Job Match" subtitle="Match your CV and Career Profile against any job." showNewAnalysis={false} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex justify-end">
          <Link href={JOB_BOARD_ROUTES.discover} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary">
            <BriefcaseBusiness className="h-4 w-4" />
            Explore Jobs
          </Link>
        </div>
        <VacancyIntake />
      </div>
    </>
  );
}