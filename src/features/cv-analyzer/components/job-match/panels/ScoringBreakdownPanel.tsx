import { motion, type Variants } from 'framer-motion';
import { BarChart2, Briefcase, Lock, AlertTriangle } from 'lucide-react';
import type { JobMatchReportView } from '@/shared/types/job-match-report';

interface ScoringBreakdownPanelProps {
  view: JobMatchReportView;
  contentVariants: Variants;
}

export default function ScoringBreakdownPanel({ view, contentVariants }: ScoringBreakdownPanelProps) {
  const { scoreExplanation: score, overview } = view;
  const deductionRow = (
    key: string,
    classification: string | null,
    item: string,
    reason: string,
    points: number
  ) => (
    <div key={key} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          {classification && (
            <span className="text-[10px] font-black text-rose-500 bg-rose-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
              {classification}
            </span>
          )}
          <span className="text-sm font-bold text-slate-800">{item}</span>
        </div>
        {reason && <p className="text-sm text-slate-500 font-medium leading-relaxed">{reason}</p>}
      </div>
      <div className="flex-shrink-0 flex items-center justify-center">
        <span className="text-lg font-black text-rose-600 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 shadow-sm">
          -{points} pts
        </span>
      </div>
    </div>
  );

  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
      <div className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
            <BarChart2 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Score Explanation</h2>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Deductive model — every match starts at 100</p>
          </div>
        </div>

        {/* Starting score */}
        <div className="flex items-center justify-between rounded-2xl bg-slate-800 text-white px-5 py-4 mb-4">
          <span className="text-sm font-bold">Starting score</span>
          <span className="text-lg font-black">{score.startingScore}</span>
        </div>

        <div className="space-y-4">
          {score.visibleDeductions.map((row) =>
            deductionRow(row.id, row.classification, row.item, row.reason, row.points)
          )}

          {score.domainDeduction &&
            deductionRow(
              score.domainDeduction.id,
              score.domainDeduction.classification,
              score.domainDeduction.item,
              score.domainDeduction.reason,
              score.domainDeduction.points
            )}

          {/* Aggregate of plan-locked deductions — keeps the maths honest for Free
              without leaking the withheld requirement text. */}
          {score.lockedDeductionTotal > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 flex items-start gap-2">
                <Lock size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm font-bold text-amber-900">
                    {score.lockedDeductionCount} further deduction{score.lockedDeductionCount === 1 ? '' : 's'} (locked)
                  </span>
                  <p className="text-sm text-amber-800/80 font-medium leading-relaxed">
                    Included in your score. Unlock the full report to see each one.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center justify-center">
                <span className="text-lg font-black text-amber-700 bg-amber-100 px-4 py-2 rounded-xl border border-amber-200 shadow-sm">
                  -{score.lockedDeductionTotal} pts
                </span>
              </div>
            </div>
          )}

          {score.visibleDeductions.length === 0 &&
            !score.domainDeduction &&
            score.lockedDeductionTotal === 0 && (
              <div className="text-center p-8 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-800">
                <p className="font-bold">No deductions</p>
                <p className="text-sm opacity-80">This candidate met every scored requirement.</p>
              </div>
            )}
        </div>

        {/* Final score — reconciles with the canonical ledger. */}
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-gradient-to-r from-accent-purple to-blue-600 text-white px-5 py-4">
          <span className="text-sm font-bold">Final match score</span>
          <span className="text-2xl font-black">{score.total} / 100</span>
        </div>

        {!score.reconciles && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              This analysis result is incomplete — the score could not be fully reconciled. Please re-run the
              analysis for a current report.
            </span>
          </div>
        )}
      </div>

      {/* Experience Gap */}
      {overview.experienceGap && (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[32px] shadow-sm p-6 sm:p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <Briefcase size={24} className="text-slate-400" />
            <h3 className="text-lg font-bold">High-Level Experience Gap</h3>
          </div>
          <p className="text-base text-slate-300 leading-relaxed font-medium">{overview.experienceGap}</p>
        </div>
      )}
    </motion.div>
  );
}
