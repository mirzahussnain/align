'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import CVUploader from '@/features/cv-analyzer/components/shared/CVUploader';
import AtsAnalysisDashboard from '@/features/cv-analyzer/components/ats/AtsAnalysisDashboard';
import type { CVAnalysisResult } from '@/shared/types/cv';
import { useAnalysisStore } from '@/shared/stores/analysis-store';

/** ATS is deliberately a CV-only workspace. Vacancy fit starts from Jobs. */
export default function AnalyzeWorkspace({
  compact = false,
  profileId,
}: {
  compact?: boolean;
  profileId?: string;
}) {
  const result = useAnalysisStore((state) => state.result);
  const setResult = useAnalysisStore((state) => state.setResult);
  const reset = useAnalysisStore((state) => state.reset);

  return (
    <AnimatePresence mode="wait">
      {!result ? (
        <motion.div
          key="ats-upload"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mx-auto max-w-3xl text-center"
        >
          <h1 className={compact ? 'mb-3 text-2xl font-semibold tracking-tight text-text-primary' : 'mb-4 text-4xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl'}>
            Check how your CV reads to an ATS
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-base text-text-secondary">
            Review parsing, structure, evidence, keywords, and UK CV conventions. Job-specific fit
            is assessed separately from a vacancy in Jobs.
          </p>
          <CVUploader
            mode="ats"
            profileId={profileId}
            onAnalysisComplete={(value) => setResult(value as CVAnalysisResult)}
          />
        </motion.div>
      ) : (
        <motion.div key="ats-report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          <div className="flex flex-col items-start justify-between gap-4 border-b border-border-subtle pb-6 sm:flex-row sm:items-center">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-text-primary">
                <ShieldCheck className="text-accent-purple" />
                ATS analysis
              </h1>
              <p className="mt-1 text-xs text-text-tertiary">CV readiness, independent of any vacancy</p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-bg-tertiary px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-border-subtle"
            >
              <RefreshCw size={14} /> Analyze another CV
            </button>
          </div>
          <AtsAnalysisDashboard result={result} onNewUpload={reset} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
