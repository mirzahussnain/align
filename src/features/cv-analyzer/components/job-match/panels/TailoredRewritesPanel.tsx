import { motion, type Variants } from 'framer-motion';
import { FileEdit, Zap, AlertCircle, CheckCircle2, Lock, Info } from 'lucide-react';
import type { JobMatchReportView } from '@/shared/types/job-match-report';
import type { RewriteAvailability } from '@/shared/types/job-match-report';

interface TailoredRewritesPanelProps {
  view: JobMatchReportView;
  contentVariants: Variants;
}

/** Typed empty state — never infers "perfectly tailored" from an empty array. */
function EmptyState({ availability, reason }: { availability: RewriteAvailability; reason?: string }) {
  const config: Record<
    Exclude<RewriteAvailability, 'available'>,
    { title: string; icon: React.ReactNode; tone: string }
  > = {
    not_needed: {
      title: 'Already well aligned',
      icon: <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={26} />,
      tone: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    },
    insufficient_supported_evidence: {
      title: 'No safe rewrites for the largest gaps',
      icon: <Info className="mx-auto mb-2 text-amber-500" size={26} />,
      tone: 'bg-amber-50 border-amber-100 text-amber-800',
    },
    analysis_incomplete: {
      title: 'Rewrites unavailable',
      icon: <AlertCircle className="mx-auto mb-2 text-amber-500" size={26} />,
      tone: 'bg-amber-50 border-amber-100 text-amber-800',
    },
    generation_failed: {
      title: 'Could not generate rewrites',
      icon: <AlertCircle className="mx-auto mb-2 text-rose-500" size={26} />,
      tone: 'bg-rose-50 border-rose-100 text-rose-800',
    },
    plan_restricted: {
      title: 'Part of the full rewrite strategy',
      icon: <Lock className="mx-auto mb-2 text-slate-400" size={26} />,
      tone: 'bg-slate-50 border-slate-200 text-slate-600',
    },
  };
  const c = availability === 'available' ? config.not_needed : config[availability];
  return (
    <div className={`text-center p-10 rounded-3xl border ${c.tone}`}>
      {c.icon}
      <p className="font-bold">{c.title}</p>
      {reason && <p className="text-sm opacity-80 mt-1 max-w-md mx-auto">{reason}</p>}
    </div>
  );
}

export default function TailoredRewritesPanel({ view, contentVariants }: TailoredRewritesPanelProps) {
  const { availability, items, reason } = view.rewrites;

  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
          <FileEdit size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Evidence-Based Rewrites</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Grounded in evidence your CV already contains</p>
        </div>
      </div>

      <div className="space-y-6">
        {availability === 'available' && items.length > 0 ? (
          items.map((rewrite, idx) => (
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
          ))
        ) : (
          <EmptyState availability={availability} reason={reason} />
        )}
      </div>
    </motion.div>
  );
}
