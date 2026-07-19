'use client';

import DashboardTopBar from '../DashboardTopBar';
import AnalysesTable, { type AnalysisRow } from '../AnalysesTable';
import AnalysisDetailView from '../AnalysisDetailView';
import { useDashboardStore } from '@/shared/stores/dashboard-store';

export default function AnalysesView({ analyses }: { analyses: AnalysisRow[] }) {
  const selectedAnalysisId = useDashboardStore((s) => s.selectedAnalysisId);

  if (selectedAnalysisId) {
    return <AnalysisDetailView analysisId={selectedAnalysisId} />;
  }

  return (
    <>
      <DashboardTopBar
        title="Analyses"
        subtitle={
          analyses.length === 0
            ? 'Every CV analysis you run is saved here'
            : `${analyses.length} ${analyses.length === 1 ? 'analysis' : 'analyses'}`
        }
      />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <AnalysesTable rows={analyses} />
        </section>
      </div>
    </>
  );
}
