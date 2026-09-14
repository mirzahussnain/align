'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import DashboardTopBar from './DashboardTopBar';
import AtsAnalysisDashboard from '@/features/cv-analyzer/components/ats/AtsAnalysisDashboard';
import JobMatchDashboard from '@/features/cv-analyzer/components/job-match/JobMatchDashboard';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { CVAnalysisResult } from '@/shared/types/cv';

interface StoredAnalysis {
  id: string;
  mode: string;
  overallScore: number;
  sourceFileName: string | null;
  createdAt: string;
  /** Null when the stored blob no longer parses (written by an old engine). */
  result: CVAnalysisResult | null;
}

/**
 * Renders a previously-saved analysis in full, rehydrating the exact ATS or
 * Job Match dashboard from the persisted rawResult. Fetched on demand so the
 * list view stays lightweight — only the opened report pulls its heavy payload.
 */
export default function AnalysisDetailView({ analysisId }: { analysisId: string }) {
  const closeAnalysis = useDashboardStore((s) => s.closeAnalysis);
  // Keyed by analysisId so switching reports never briefly shows stale data:
  // anything not tagged with the current id counts as still loading.
  const [data, setData] = useState<StoredAnalysis | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch(`/api/analyses/${analysisId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? 'Could not load this analysis.');
        }
        const payload: StoredAnalysis = await res.json();
        if (active) setData(payload);
      } catch (err) {
        if (active) setError({ id: analysisId, message: err instanceof Error ? err.message : 'Something went wrong.' });
      }
    })();

    return () => {
      active = false;
    };
  }, [analysisId]);

  const currentData = data?.id === analysisId ? data : null;
  const currentError = error?.id === analysisId ? error : null;
  const isLoading = !currentData && !currentError;

  const subtitle = currentData
    ? `${currentData.sourceFileName ?? 'Untitled CV'} · ${new Date(currentData.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
    : 'Loading report…';

  return (
    <>
      <DashboardTopBar title="Analysis Report" subtitle={subtitle} />

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={closeAnalysis}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3.5 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to analyses
        </button>

        {isLoading && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Loading your report…</p>
          </div>
        )}

        {currentError && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm font-medium">{currentError.message}</p>
          </div>
        )}

        {currentData && !currentData.result && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm font-medium">
              This report was created by an older version of the analysis engine and can no longer
              be displayed. Re-analyse the CV to get a current report.
            </p>
          </div>
        )}

        {currentData?.result && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
            {currentData.result.mode === 'job_match' ? (
              <JobMatchDashboard result={currentData.result} />
            ) : (
              <AtsAnalysisDashboard result={currentData.result} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
