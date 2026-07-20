import { motion, type Variants } from 'framer-motion';
import { FileEdit, Zap, AlertCircle } from 'lucide-react';
import type { AIJobMatchOutput as JobMatchData } from '@/shared/types/ai';

interface TailoredRewritesPanelProps {
  data: JobMatchData;
  contentVariants: Variants;
}

export default function TailoredRewritesPanel({ data, contentVariants }: TailoredRewritesPanelProps) {
  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
          <FileEdit size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Tailored Rewrites</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Customized to precisely match JD terminology</p>
        </div>
      </div>

      <div className="space-y-6">
        {data.tailoredRewrites.length > 0 ? data.tailoredRewrites.map((rewrite, idx) => (
          <div key={idx} className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 to-emerald-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            <div className="relative z-10 space-y-5">
              <div>
                <div className="text-[10px] font-black text-rose-400 uppercase tracking-wider mb-2">Original Bullet</div>
                <p className="text-sm text-slate-600 line-through decoration-rose-300/50">{rewrite.original}</p>
              </div>
              
              <div className="pl-5 border-l-2 border-emerald-400 relative bg-white p-4 rounded-r-xl shadow-sm">
                <div className="absolute -left-[11px] top-1/2 -translate-y-1/2 bg-white rounded-full p-1 border border-slate-100 shadow-sm">
                  <Zap size={10} className="text-emerald-500 fill-emerald-500" />
                </div>
                <div className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-2">Suggested Rewrite</div>
                <p className="text-sm font-semibold text-slate-800 leading-relaxed">{rewrite.suggested}</p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-200/60">
                <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">Rationale:</span> {rewrite.rationale}</p>
              </div>

              {rewrite.caveat && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800 flex items-start gap-2.5">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span className="font-medium"><span className="font-bold">Caveat:</span> {rewrite.caveat}</span>
                </div>
              )}
            </div>
          </div>
        )) : (
          <div className="text-center p-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
            <p className="text-sm text-slate-500 font-medium">Your bullet points are already perfectly tailored to this JD!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
