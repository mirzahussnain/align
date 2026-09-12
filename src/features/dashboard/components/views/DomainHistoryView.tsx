'use client';

import { BriefcaseBusiness, ChevronRight, FileSearch, Plus, Target, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import DashboardTopBar from '../DashboardTopBar';
import DomainAnalysisDetailView from '../DomainAnalysisDetailView';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { AtsAnalysisRow, JobMatchRow } from '../DashboardShell';
import { cn } from '@/shared/utils/cn';

const scoreTone = (score: number) =>
  score >= 85 ? 'bg-emerald-100 text-emerald-700' : score >= 70 ? 'bg-sky-100 text-sky-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';

export default function DomainHistoryView({
  domain,
  atsAnalyses,
  jobMatches,
}: {
  domain: 'ats' | 'job_match';
  atsAnalyses: AtsAnalysisRow[];
  jobMatches: JobMatchRow[];
}) {
  const selected = useDashboardStore((state) => state.selectedAnalysisId);
  const selectedDomain = useDashboardStore((state) => state.selectedAnalysisDomain);
  const open = useDashboardStore((state) => domain === 'ats' ? state.openAtsAnalysis : state.openJobMatch);
  const rows = domain === 'ats' ? atsAnalyses : jobMatches;
  const title = domain === 'ats' ? 'ATS analyses' : 'Job matches';
  const [showJobMatchChooser, setShowJobMatchChooser] = useState(false);

  if (selected && selectedDomain === domain) return <DomainAnalysisDetailView id={selected} domain={domain} />;

  return (
    <>
      <DashboardTopBar
        title={title}
        subtitle={rows.length ? `${rows.length} saved ${rows.length === 1 ? 'result' : 'results'}` : domain === 'ats' ? 'CV readiness history' : 'Vacancy-specific fit history'}
        rightSlot={domain === 'job_match' ? (
          <button type="button" onClick={() => setShowJobMatchChooser((open) => !open)} aria-expanded={showJobMatchChooser} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-accent-purple px-3 text-xs font-bold text-white transition-colors hover:bg-accent-purple/90 sm:px-4">
            <Plus className="h-4 w-4" /> New Job Match
          </button>
        ) : undefined}
      />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {domain === 'job_match' && showJobMatchChooser && (
          <section className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5 sm:p-6" aria-label="Start a new Job Match">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">How do you want to choose the job?</h2>
            <p className="mt-1 text-sm text-slate-600">Both paths use the same exact CV, job revision, and Career Profile snapshot.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link href="/dashboard/jobs" className="group flex min-h-24 items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-violet-200 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><BriefcaseBusiness className="h-5 w-5" /></span>
                <span><span className="block text-sm font-bold text-slate-900">Choose a job from Jobs</span><span className="mt-1 block text-xs leading-5 text-slate-500">Discover or open a saved vacancy, then use Check match.</span></span>
              </Link>
              <Link href="/dashboard/jobs/analyze" className="group flex min-h-24 items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-violet-200 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Upload className="h-5 w-5" /></span>
                <span><span className="block text-sm font-bold text-slate-900">Analyse your own job</span><span className="mt-1 block text-xs leading-5 text-slate-500">Paste or import a vacancy through the existing own-job flow.</span></span>
              </Link>
            </div>
          </section>
        )}
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {!rows.length ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              {domain === 'ats' ? <FileSearch className="h-7 w-7 text-slate-400" /> : <Target className="h-7 w-7 text-slate-400" />}
              <h2 className="mt-4 text-sm font-semibold">No {title.toLowerCase()} yet</h2>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                {domain === 'ats' ? 'Analyze a CV to build its independent readiness history.' : 'Open a vacancy in Jobs and choose Check match.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const score = domain === 'ats' ? (row as AtsAnalysisRow).overallScore : (row as JobMatchRow).matchScore;
                const heading = domain === 'ats' ? (row as AtsAnalysisRow).sourceFileName : `${(row as JobMatchRow).jobTitle} · ${(row as JobMatchRow).jobCompany}`;
                const detail = domain === 'ats' ? 'CV readiness' : (row as JobMatchRow).sourceFileName;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => open(row.id)}
                    className="flex min-h-16 w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-purple"
                  >
                    <span className={cn('rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums', scoreTone(score))}>{score}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{heading}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{detail} · {new Date(row.createdAt).toLocaleDateString('en-GB')}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
