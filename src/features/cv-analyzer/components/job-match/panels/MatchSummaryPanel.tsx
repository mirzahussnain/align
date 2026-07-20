import { motion, type Variants } from 'framer-motion';
import { Target } from 'lucide-react';
import ScoreDial from '@/shared/components/ui/CircularProgress';
import type { AIJobMatchOutput as JobMatchData } from '@/shared/types/ai';

interface MatchSummaryPanelProps {
  data: JobMatchData;
  contentVariants: Variants;
}

export default function MatchSummaryPanel({ data, contentVariants }: MatchSummaryPanelProps) {
  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-10 relative overflow-hidden h-full flex flex-col justify-center">
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-accent-purple to-accent-cyan" />
      
      <div className="flex flex-col md:flex-row items-center gap-10">
        <div className="flex-shrink-0 relative">
          <div className="absolute inset-0 bg-accent-purple/10 blur-3xl rounded-full scale-150" />
          <ScoreDial score={data.matchScore} size="lg" label="Match Score" />
        </div>
        
        <div className="flex-1 text-center md:text-left z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-wider mb-4 border border-purple-100">
            <Target size={12} /> Job Alignment
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mb-3">
            {data.matchScore >= 80 ? 'Excellent Match!' : data.matchScore >= 60 ? 'Strong Candidate' : 'Needs Tailoring'}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl font-medium">
            {data.matchFeedback}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
