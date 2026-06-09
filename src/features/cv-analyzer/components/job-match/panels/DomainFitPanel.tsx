import { motion } from 'framer-motion';
import { Briefcase, ShieldAlert, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { AIJobMatchOutput as JobMatchData } from '@/shared/types/ai';

interface DomainFitPanelProps {
  data: JobMatchData;
  contentVariants: any;
}

export default function DomainFitPanel({ data, contentVariants }: DomainFitPanelProps) {
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

        <div className={cn("p-6 rounded-2xl border", data.domainFit.mismatch ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100")}>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-bold text-slate-800">Domain Match Status</h4>
            {data.domainFit.mismatch ? (
              <span className="text-[11px] font-black text-rose-600 bg-rose-200/50 px-3 py-1 rounded-full uppercase">Mismatch</span>
            ) : (
              <span className="text-[11px] font-black text-emerald-600 bg-emerald-200/50 px-3 py-1 rounded-full uppercase">Aligned</span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-white/60 p-4 rounded-xl border border-white">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Role Domain</span>
              <p className="text-sm text-slate-700 font-semibold">{data.domainFit.roleDomain}</p>
            </div>
            <div className="bg-white/60 p-4 rounded-xl border border-white">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Candidate Domain</span>
              <p className="text-sm text-slate-700 font-semibold">{data.domainFit.candidateDomain}</p>
            </div>
          </div>

          {data.domainFit.overlapAreas && data.domainFit.overlapAreas.length > 0 && (
            <div className="mb-5 bg-white/60 p-4 rounded-xl border border-white">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Transferable Overlap</span>
              <ul className="list-disc pl-5 text-sm text-slate-700 font-medium space-y-1">
                {data.domainFit.overlapAreas.map((area, idx) => (
                  <li key={idx}>{area}</li>
                ))}
              </ul>
            </div>
          )}
          
          <p className="text-sm text-slate-600 italic font-medium bg-white/40 p-4 rounded-xl border border-white/60">
            "{data.domainFit.detail}"
          </p>
        </div>
      </div>

      {/* Eligibility Flags */}
      {data.eligibilityFlags.length > 0 && (
        <div className="pt-8 border-t border-slate-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Eligibility Flags</h2>
              <p className="text-sm text-slate-500 font-medium mt-0.5">Visas, Right-to-Work, and Contract Dates</p>
            </div>
          </div>

          <div className="space-y-3">
            {data.eligibilityFlags.map((flagObj, idx) => (
              <div key={idx} className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-3">
                <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="text-sm font-bold text-amber-900 mb-1">{flagObj.flag}</h4>
                  <p className="text-sm text-amber-800/80 mb-2">{flagObj.detail}</p>
                  {flagObj.datesInvolved && (
                    <div className="inline-block px-2.5 py-1 bg-amber-100/50 rounded-md">
                      <span className="text-[10px] text-amber-700 font-black uppercase tracking-wider">
                        Dates: {flagObj.datesInvolved}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
