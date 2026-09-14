import { motion, type Variants } from 'framer-motion';
import { Briefcase, ShieldAlert, AlertCircle, Lock } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { JobMatchReportView } from '@/shared/types/job-match-report';

interface DomainFitPanelProps {
  view: JobMatchReportView;
  contentVariants: Variants;
}

export default function DomainFitPanel({ view, contentVariants }: DomainFitPanelProps) {
  const domain = view.assessments.domainFit;
  const eligibility = view.assessments.eligibility;
  const domainTone =
    domain.status === 'mismatch'
      ? 'bg-rose-50 border-rose-100'
      : domain.status === 'partial'
        ? 'bg-amber-50 border-amber-100'
        : 'bg-emerald-50 border-emerald-100';

  return (
    <motion.div variants={contentVariants} initial="hidden" animate="visible" exit="exit" className="bg-bg-panel rounded-[32px] border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-8">
      {/* Domain Fit Section */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Briefcase size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Domain Fit</h2>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Contextual and Disciplinary Alignment</p>
          </div>
        </div>

        <div className={cn("p-6 rounded-2xl border", domainTone)}>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-bold text-slate-800">Domain Match Status</h4>
            {domain.status === 'mismatch' ? (
              <span className="text-[11px] font-black text-rose-600 bg-rose-200/50 px-3 py-1 rounded-full uppercase">Mismatch</span>
            ) : domain.status === 'partial' ? (
              <span className="text-[11px] font-black text-amber-700 bg-amber-200/50 px-3 py-1 rounded-full uppercase">Partial overlap</span>
            ) : (
              <span className="text-[11px] font-black text-emerald-600 bg-emerald-200/50 px-3 py-1 rounded-full uppercase">Aligned</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-white/60 p-4 rounded-xl border border-white">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Role Domain</span>
              <p className="text-sm text-slate-700 font-semibold">{domain.roleDomain}</p>
            </div>
            <div className="bg-white/60 p-4 rounded-xl border border-white">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Candidate Domain</span>
              <p className="text-sm text-slate-700 font-semibold">{domain.candidateDomain}</p>
            </div>
          </div>

          {domain.overlapAreas.length > 0 && (
            <div className="mb-5 bg-white/60 p-4 rounded-xl border border-white">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Transferable Overlap</span>
              <ul className="list-disc pl-5 text-sm text-slate-700 font-medium space-y-1">
                {domain.overlapAreas.map((area, idx) => (
                  <li key={idx}>{area}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-slate-600 italic font-medium bg-white/40 p-4 rounded-xl border border-white/60">
            &quot;{domain.detail}&quot;
          </p>
        </div>
      </div>

      {/* Eligibility — cautious summary for every plan, full detail when unlocked. */}
      <div className="pt-8 border-t border-slate-100">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Eligibility</h2>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Right-to-work and availability</p>
          </div>
        </div>

        <div
          className={cn(
            'rounded-2xl border p-5 text-sm leading-relaxed',
            eligibility.hardBlocker
              ? 'bg-rose-50 border-rose-100 text-rose-800'
              : 'bg-slate-50 border-slate-100 text-slate-700'
          )}
        >
          {eligibility.summary}
        </div>

        {eligibility.items.length > 0 && (
          <div className="mt-4 space-y-3">
            {eligibility.items.map((requirement) => (
              <div key={requirement.id} className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-3">
                <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-amber-900">{requirement.text}</h4>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                      {requirement.status.replace('_', ' ')}
                    </span>
                  </div>
                  {requirement.deduction.reason && (
                    <p className="mt-1 text-sm text-amber-800/80">{requirement.deduction.reason}</p>
                  )}
                  {requirement.evidence.map((evidence, index) => (
                    <p key={`${requirement.id}-evidence-${index}`} className="mt-2 text-xs text-amber-800">
                      <span className="font-bold uppercase">{evidence.source}</span>
                      {evidence.location ? ` · ${evidence.location}` : ''}: {evidence.text}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {eligibility.locked && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            <Lock size={14} /> Detailed eligibility analysis is part of the full report.
          </div>
        )}
      </div>
    </motion.div>
  );
}
