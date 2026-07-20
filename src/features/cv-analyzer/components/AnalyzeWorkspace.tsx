'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import CVUploader from '@/features/cv-analyzer/components/shared/CVUploader';
import AtsAnalysisDashboard from '@/features/cv-analyzer/components/ats/AtsAnalysisDashboard';
import JobMatchDashboard from '@/features/cv-analyzer/components/job-match/JobMatchDashboard';
import Tabs from '@/shared/components/ui/Tabs';
import type { CVAnalysisResult } from '@/shared/types/cv';
import { useAnalysisStore } from '@/shared/stores/analysis-store';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 15 } },
} as const;

/**
 * The full analyze flow — mode toggle, uploader, and result dashboards — with
 * its state held in the analysis store so it survives dashboard tab switches.
 * `compact` drops the big marketing heading for the embedded dashboard tab.
 *
 * `profileId` files the result under a career track. Only the dashboard passes
 * it — the public analyser has no switcher, so the server picks the default.
 */
export default function AnalyzeWorkspace({
  compact = false,
  profileId,
}: {
  compact?: boolean;
  profileId?: string;
}) {
  const result = useAnalysisStore((s) => s.result);
  const mode = useAnalysisStore((s) => s.mode);
  const setResult = useAnalysisStore((s) => s.setResult);
  const setMode = useAnalysisStore((s) => s.setMode);
  const reset = useAnalysisStore((s) => s.reset);

  return (
    <AnimatePresence mode="wait">
      {!result ? (
        <motion.div
          key="uploader-view"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.4 }}
          className="text-center max-w-3xl mx-auto"
        >
          {!compact && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-purple/10 border border-accent-purple/20 mb-6">
              <Sparkles size={14} className="text-accent-purple" />
              <span className="text-xs font-medium text-accent-purple">CV Readiness Tool</span>
            </div>
          )}

          <h1 className={compact ? 'text-2xl font-bold mb-3 text-text-primary' : 'text-4xl sm:text-5xl font-bold mb-4 leading-tight text-text-primary'}>
            {mode === 'ats' ? 'CV Readiness Check' : 'Job Matcher AI'}
          </h1>

          <p className="text-base text-text-secondary max-w-xl mx-auto mb-8">
            {mode === 'ats'
              ? 'Upload your CV to check formatting, keyword mapping, UK compliance rules, and receive a comprehensive scoring audit.'
              : 'Paste your target Job Description and upload your CV to see your exact match percentage, skill gaps, and tailored rewrite suggestions.'}
          </p>

          <Tabs
            activeTab={mode}
            onChange={(value) => setMode(value as 'ats' | 'job_match')}
            tabs={[
              { label: 'ATS Score Check', value: 'ats' },
              { label: 'Job Matcher', value: 'job_match' },
            ]}
            className="max-w-md mx-auto mb-8"
          />

          <CVUploader
            mode={mode}
            profileId={profileId}
            onAnalysisComplete={(r) => setResult(r as CVAnalysisResult)}
          />
        </motion.div>
      ) : (
        <motion.div key="dashboard-view" variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border-subtle pb-6"
          >
            <div>
              <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
                <ShieldCheck className="text-accent-purple" />
                CV Analysis Report
              </h1>
              <p className="text-xs text-text-tertiary mt-1">Checked against 2026 UK hiring practices for your occupation</p>
            </div>
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-bg-tertiary hover:bg-border-subtle text-text-primary border border-border-subtle transition-all duration-300"
            >
              <RefreshCw size={14} /> Analyze New CV
            </button>
          </motion.div>

          <motion.div variants={itemVariants}>
            {result.mode === 'job_match' ? (
              <JobMatchDashboard result={result} />
            ) : (
              <AtsAnalysisDashboard result={result} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
