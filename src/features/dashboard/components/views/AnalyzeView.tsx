'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import DashboardTopBar from '../DashboardTopBar';
import AnalyzeWorkspace from '@/features/cv-analyzer/components/AnalyzeWorkspace';
import { useAnalysisStore } from '@/shared/stores/analysis-store';

export default function AnalyzeView({ activeProfileId }: { activeProfileId?: string }) {
  const router = useRouter();
  const result = useAnalysisStore((s) => s.result);
  const hadResult = useRef(false);

  // When an analysis completes, its row is saved server-side. Refresh once so
  // the overview/library tabs reflect it without a manual reload.
  useEffect(() => {
    if (result && !hadResult.current) {
      hadResult.current = true;
      router.refresh();
    }
    if (!result) hadResult.current = false;
  }, [result, router]);

  return (
    <>
      <DashboardTopBar title="Analyze CV" subtitle="Check CV readiness independently of a vacancy" showNewAnalysis={false} />
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <AnalyzeWorkspace compact profileId={activeProfileId} />
      </div>
    </>
  );
}
