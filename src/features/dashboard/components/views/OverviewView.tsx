'use client';

import { FileSearch, Gauge, FileStack, UserRound, ArrowRight, FileText } from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import StatCard from '../StatCard';
import ScoreTrendChart, { type ScorePoint } from '../ScoreTrendChart';
import AnalysesTable from '../AnalysesTable';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { DashboardData } from '../DashboardShell';
import { profileCompleteness } from '@/features/dashboard/data/profile-completeness';

export default function OverviewView({
  user,
  data,
}: {
  user: { name: string };
  data: DashboardData;
}) {
  const setTab = useDashboardStore((s) => s.setTab);
  const { analyses, avgScore, totalAnalyses, cvs, profile } = data;

  const chronological = [...analyses].slice(0, 12).reverse();
  const chartData: ScorePoint[] = chronological.map((a) => ({
    date: new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    jobMatch: a.mode === 'job_match' ? a.overallScore : null,
    ats: a.mode === 'job_match' ? null : a.overallScore,
  }));

  const latest = chronological.at(-1);
  const previous = chronological.at(-2);
  const scoreDelta =
    latest && previous
      ? { value: latest.overallScore - previous.overallScore, suffix: 'vs previous' }
      : undefined;

  const completeness = profileCompleteness(profile);

  const activity = [
    ...analyses.slice(0, 4).map((a) => ({
      id: `analysis-${a.id}`,
      createdAt: a.createdAt,
      icon: FileSearch,
      tint: 'bg-accent-purple/10 text-accent-purple',
      title: a.mode === 'job_match' ? 'Job match analysis' : 'ATS analysis',
      detail: `${a.sourceFileName ?? 'CV'} · scored ${a.overallScore}/100`,
    })),
    ...cvs.slice(0, 4).map((c) => ({
      id: `cv-${c.id}`,
      createdAt: c.createdAt,
      icon: FileText,
      tint: 'bg-accent-cyan/10 text-accent-cyan',
      title: 'CV generated',
      detail: `${c.template} template`,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <>
      <DashboardTopBar
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle="Your CV performance across every application"
      />

      <div className="flex flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={FileSearch}
            label="Analyses run"
            value={String(totalAnalyses)}
            sublabel={totalAnalyses === 0 ? 'No analyses yet' : 'All time'}
            tint="purple"
          />
          <StatCard
            icon={Gauge}
            label="Average score"
            value={avgScore === null ? '—' : `${Math.round(avgScore)}`}
            delta={scoreDelta}
            sublabel={avgScore === null ? 'Run an analysis to see this' : undefined}
            tint="cyan"
          />
          <StatCard
            icon={FileStack}
            label="CVs generated"
            value={String(cvs.length)}
            sublabel={cvs.length === 0 ? 'None yet' : 'All time'}
            tint="emerald"
          />
          <StatCard
            icon={UserRound}
            label="Profile complete"
            value={`${completeness}%`}
            sublabel={completeness === 100 ? 'Ready to rebuild CVs' : 'Finish to unlock rebuilds'}
            tint="amber"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Score over time</h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {chartData.length >= 2 ? `Last ${chartData.length} analyses` : 'Needs at least two analyses'}
                </p>
              </div>
              {totalAnalyses > 0 && (
                <button
                  type="button"
                  onClick={() => setTab('analyses')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
                >
                  View all
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="mt-4">
              {chartData.length >= 2 ? (
                <ScoreTrendChart data={chartData} />
              ) : (
                <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 text-center">
                  <p className="text-xs font-medium text-neutral-600">Not enough history to chart yet</p>
                  <p className="mt-1 max-w-[240px] text-[11px] text-neutral-400">
                    Once you&apos;ve run two analyses, your score trend appears here.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
            <h2 className="text-sm font-bold text-neutral-900">Recent activity</h2>

            {activity.length === 0 ? (
              <div className="flex h-56 items-center justify-center">
                <p className="max-w-[200px] text-center text-xs text-neutral-400">
                  Your analyses and generated CVs will show up here.
                </p>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col">
                {activity.map(({ id, icon: Icon, tint, title, detail, createdAt }) => (
                  <li key={id} className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-neutral-900">{title}</p>
                      <p className="truncate text-[11px] text-neutral-400">{detail}</p>
                    </div>
                    <time dateTime={createdAt} className="shrink-0 text-[10px] text-neutral-400 tabular-nums">
                      {new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Recent analyses</h2>
              {totalAnalyses > 0 && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  Showing {Math.min(5, totalAnalyses)} of {totalAnalyses}
                </p>
              )}
            </div>
            {totalAnalyses > 5 && (
              <button
                type="button"
                onClick={() => setTab('analyses')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <AnalysesTable rows={analyses.slice(0, 5)} />
        </section>
      </div>
    </>
  );
}
