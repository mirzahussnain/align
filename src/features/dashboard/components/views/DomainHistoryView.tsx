'use client';

import { ChevronRight, FileSearch, Target, Plus } from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import DomainAnalysisDetailView from '../DomainAnalysisDetailView';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { AtsAnalysisRow, JobMatchRow } from '../DashboardShell';
import { cn } from '@/shared/utils/cn';
import { scoreTone } from '@/shared/utils/score-tone';

export default function DomainHistoryView({
  domain,
  atsAnalyses,
  jobMatches,
}: {
  domain: 'ats' | 'job_match';
  atsAnalyses: AtsAnalysisRow[];
  jobMatches: JobMatchRow[];
}) {
  const setTab = useDashboardStore((state) => state.setTab);
  const selected = useDashboardStore((state) => state.selectedAnalysisId);
  const selectedDomain = useDashboardStore((state) => state.selectedAnalysisDomain);
  const open = useDashboardStore((state) => domain === 'ats' ? state.openAtsAnalysis : state.openJobMatch);
  const rows = domain === 'ats' ? atsAnalyses : jobMatches;
  const title = domain === 'ats' ? 'ATS Analyses' : 'Job Matches';

  if (selected && selectedDomain === domain) return <DomainAnalysisDetailView id={selected} domain={domain} />;

  return (
    <>
      <DashboardTopBar
        title={title}
        subtitle={rows.length ? `${rows.length} saved ${rows.length === 1 ? 'result' : 'results'}` : domain === 'ats' ? 'CV readiness history' : 'Vacancy-specific fit history'}
        showNewAnalysis={domain === 'ats'}
        rightSlot={
          domain === 'ats' ? (
            <button
              type="button"
              onClick={() => setTab('analyze')}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800 sm:px-4"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span>New ATS Analysis</span>
            </button>
          ) : null
        }
      />
      <div className="px-4 py-6 sm:px-6 lg:px-8">

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {!rows.length ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              {domain === 'ats' ? <FileSearch className="h-7 w-7 text-slate-400" /> : <Target className="h-7 w-7 text-slate-400" />}
              <h2 className="mt-4 text-sm font-semibold">No {title} Yet</h2>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                {domain === 'ats' ? 'Analyze a CV to build its independent readiness history.' : 'Open a vacancy in Jobs and choose Check Match.'}
              </p>
              {domain === 'ats' && (
                <button
                  type="button"
                  onClick={() => setTab('analyze')}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  <span>New ATS Analysis</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 p-2">
              {rows.map((row) => {
                const score = domain === 'ats' ? (row as AtsAnalysisRow).overallScore : (row as JobMatchRow).matchScore;
                const heading = domain === 'ats' ? (row as AtsAnalysisRow).sourceFileName : `${(row as JobMatchRow).jobTitle} · ${(row as JobMatchRow).jobCompany}`;
                const detail = domain === 'ats' ? 'CV readiness' : (row as JobMatchRow).sourceFileName;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => open(row.id)}
                    className="flex min-h-16 w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan"
                  >
                    <span className={cn('flex h-8 min-w-10 shrink-0 items-center justify-center rounded-xl px-2.5 text-sm font-bold tabular-nums', scoreTone(score))}>{score}</span>
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
