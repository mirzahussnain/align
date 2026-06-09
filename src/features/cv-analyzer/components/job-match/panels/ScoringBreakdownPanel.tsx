import { motion } from 'framer-motion';
import { BarChart2, CheckCircle2, Briefcase } from 'lucide-react';
import type { AIJobMatchOutput as JobMatchData } from '@/shared/types/ai';

interface ScoringBreakdownPanelProps {
  data: JobMatchData;
  contentVariants: any;
}

export default function ScoringBreakdownPanel({ data, contentVariants }: ScoringBreakdownPanelProps) {
  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
      <div className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
            <BarChart2 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Scoring Breakdown</h2>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Mathematical Point Deductions</p>
          </div>
        </div>
        
        <div className="space-y-4">
          {data.scoringBreakdown.length > 0 ? (
            data.scoringBreakdown.map((item, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    {item.classification && (
                      <span className="text-[10px] font-black text-rose-500 bg-rose-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                        {item.classification}
                      </span>
                    )}
                    <span className="text-sm font-bold text-slate-800">{item.item}</span>
                  </div>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">{item.reason}</p>
                </div>
                <div className="flex-shrink-0 flex items-center justify-center">
                  <span className="text-lg font-black text-rose-600 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 shadow-sm">
                    {item.deduction < 0 ? item.deduction : `-${item.deduction}`} pts
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center p-8 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-800">
              <CheckCircle2 className="mx-auto mb-2" size={24} />
              <p className="font-bold">Perfect Score!</p>
              <p className="text-sm opacity-80">No deductions were applied to this candidate.</p>
            </div>
          )}
        </div>
      </div>

      {/* Experience Gap */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[32px] shadow-sm p-6 sm:p-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Briefcase size={24} className="text-slate-400" />
          <h3 className="text-lg font-bold">High-Level Experience Gap</h3>
        </div>
        <p className="text-base text-slate-300 leading-relaxed font-medium">
          {data.experienceGap}
        </p>
      </div>
    </motion.div>
  );
}
