import { motion, type Variants } from 'framer-motion';
import { Target, Compass } from 'lucide-react';
import ScoreDial from '@/shared/components/ui/CircularProgress';
import type { JobMatchReportView } from '@/shared/types/job-match-report';

interface MatchSummaryPanelProps {
  view: JobMatchReportView;
  contentVariants: Variants;
}

export default function MatchSummaryPanel({ view, contentVariants }: MatchSummaryPanelProps) {
  const { score, verdict, summary, recommendation } = view.overview;

  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-10 relative overflow-hidden h-full flex flex-col justify-center">
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-accent-purple to-accent-cyan" />

      <div className="flex flex-col md:flex-row items-center gap-10">
        <div className="flex-shrink-0 relative">
          <div className="absolute inset-0 bg-accent-purple/10 blur-3xl rounded-full scale-150" />
          <ScoreDial score={score} size="lg" label="Match Score" />
        </div>

        <div className="flex-1 text-center md:text-left z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-wider mb-4 border border-purple-100">
            <Target size={12} /> Job Alignment
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mb-3">
            {verdict}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl font-medium">
            {summary}
          </p>

          {recommendation && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-slate-50 border border-slate-100 p-4 text-left">
              <Compass size={16} className="text-accent-purple mt-0.5 flex-shrink-0" />
              <p className="text-sm text-slate-700 font-medium leading-relaxed">{recommendation}</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
