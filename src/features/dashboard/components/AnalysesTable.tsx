'use client';

import { FileSearch, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import { describeAnalysis } from '@/shared/utils/job-title';

export interface AnalysisRow {
  id: string;
  createdAt: string;
  mode: string;
  overallScore: number;
  sourceFileName: string | null;
  /**
   * Extracted from the job description by the matcher. Null on ATS runs, and on
   * job matches analysed before extraction existed — hence the filename
   * fallback rather than an assumption that this is always present.
   */
  jobTitle: string | null;
  jobCompany: string | null;
}

function scoreTone(score: number) {
  if (score >= 85) return 'bg-emerald-100 text-emerald-700';
  if (score >= 70) return 'bg-sky-100 text-sky-700';
  if (score >= 50) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

export default function AnalysesTable({ rows }: { rows: AnalysisRow[] }) {
  const setTab = useDashboardStore((s) => s.setTab);
  const openAnalysis = useDashboardStore((s) => s.openAnalysis);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
          <FileSearch className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm font-semibold text-neutral-900">No Analyses Yet</p>
        <p className="mt-1 max-w-xs text-xs text-neutral-500">
          Upload a CV to get an ATS score, or paste a job description to see how you match it.
        </p>
        <button
          type="button"
          onClick={() => setTab('analyze')}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent-purple px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-purple/90"
        >
          Run your first analysis
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            {['Date', 'Analysis', 'Type', 'Score'].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="whitespace-nowrap px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400"
              >
                {heading}
              </th>
            ))}
            <th scope="col" className="w-10 px-6 py-3">
              <span className="sr-only">View Report</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => openAnalysis(row.id)}
              tabIndex={0}
              role="button"
              aria-label={`View Report for ${describeAnalysis(row)}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openAnalysis(row.id);
                }
              }}
              className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none"
            >
              <td className="whitespace-nowrap px-6 py-3.5 text-xs text-neutral-600 tabular-nums">
                {new Date(row.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
              {/* Leads with the role the CV was measured against, because three
                  job matches on the same file are otherwise indistinguishable.
                  The filename moves to a second line so it isn't lost. */}
              <td className="max-w-[280px] px-6 py-3.5">
                <p className="truncate text-xs font-medium text-neutral-900">
                  {describeAnalysis(row)}
                </p>
                {row.jobTitle && row.sourceFileName && (
                  <p className="truncate text-[11px] text-neutral-400">{row.sourceFileName}</p>
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-3.5">
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold text-neutral-600">
                  {row.mode === 'job_match' ? 'Job match' : 'ATS'}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-3.5">
                <span className={cn('rounded-md px-2 py-1 text-xs font-bold tabular-nums', scoreTone(row.overallScore))}>
                  {row.overallScore}
                </span>
              </td>
              <td className="px-6 py-3.5 text-right">
                <ChevronRight className="ml-auto h-4 w-4 text-neutral-300" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
