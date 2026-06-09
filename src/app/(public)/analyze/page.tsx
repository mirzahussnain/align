'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import Navbar from '@/shared/components/layout/Navbar';
import CVUploader from '@/features/cv-analyzer/components/shared/CVUploader';
import AnalysisProgress from '@/features/cv-analyzer/components/shared/AnalysisProgress';
import AtsAnalysisDashboard from '@/features/cv-analyzer/components/ats/AtsAnalysisDashboard';
import JobMatchDashboard from '@/features/cv-analyzer/components/job-match/JobMatchDashboard';
import Tabs from '@/shared/components/ui/Tabs';
import type { CVAnalysisResult } from '@/shared/types/cv';

export default function AnalyzePage() {
  const [analysisResult, setAnalysisResult] = useState<CVAnalysisResult | null>(null);
  const [mode, setMode] = useState<'ats' | 'job_match'>('ats');

  const handleAnalysisComplete = (result: unknown) => {
    setAnalysisResult(result as CVAnalysisResult);
  };

  const handleReset = () => {
    setAnalysisResult(null);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 15 } },
  } as const;

  return (
    <main className="min-h-screen bg-hero-gradient pb-20">
      <Navbar />

      <section className="pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {!analysisResult ? (
            <motion.div
              key="uploader-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="text-center max-w-3xl mx-auto mt-10"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-purple/10 border border-accent-purple/20 mb-6">
                <Sparkles size={14} className="text-accent-purple" />
                <span className="text-xs font-medium text-accent-purple">ATS Calibration Tool</span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold mb-4 leading-tight text-text-primary">
                {mode === 'ats' ? 'ATS Alignment Engine' : 'Job Matcher AI'}
              </h1>

              <p className="text-base text-text-secondary max-w-xl mx-auto mb-10">
                {mode === 'ats' 
                  ? 'Upload your CV to check formatting, keyword mapping, UK compliance rules, and receive a comprehensive scoring audit.'
                  : 'Paste your target Job Description and upload your CV to see your exact match percentage, skill gaps, and tailored rewrite suggestions.'}
              </p>

              {/* Mode Toggle Tabs */}
              <Tabs
                activeTab={mode}
                onChange={(value) => setMode(value as 'ats' | 'job_match')}
                tabs={[
                  { label: 'ATS Score Check', value: 'ats' },
                  { label: 'Job Matcher', value: 'job_match' }
                ]}
                className="max-w-md mx-auto mb-10"
              />

              <CVUploader mode={mode} onAnalysisComplete={handleAnalysisComplete} />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard-view"
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="space-y-8"
            >
              {/* Top Dashboard Actions */}
              <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
                <div>
                  <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
                    <ShieldCheck className="text-accent-purple" />
                    CV Analysis Report
                  </h1>
                  <p className="text-xs text-text-tertiary mt-1">Checked against 2026 UK Tech hiring practices</p>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-bg-tertiary hover:bg-border-subtle text-text-primary border border-border-subtle transition-all duration-300"
                >
                  <RefreshCw size={14} /> Analyze New CV
                </button>
              </motion.div>

              {/* Modular Dashboard Integration */}
              <motion.div variants={itemVariants}>
                {analysisResult.mode === 'job_match' ? (
                  <JobMatchDashboard result={analysisResult} />
                ) : (
                  <AtsAnalysisDashboard result={analysisResult} />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}
