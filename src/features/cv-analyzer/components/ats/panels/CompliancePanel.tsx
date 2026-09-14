'use client';

import { CVAnalysisResult } from '@/shared/types/cv';
import { Check, X } from 'lucide-react';
import SourceBadge from '../SourceBadge';

export default function CompliancePanel({ result }: { result: CVAnalysisResult }) {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">UK Equality Act Compliance</h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Verification of anti-discrimination rules</p>
        <SourceBadge source="rule" className="mt-2" />
      </div>

      <div className="bg-bg-panel border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm shadow-slate-100/40 dark:shadow-none">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {result.compliance.map((check) => (
            <div
              key={check.rule}
              className={`flex flex-col gap-1 p-4 rounded-2xl border ${
                check.passed
                  ? 'bg-success/5 border-success/10 dark:border-success/20'
                  : 'bg-error/5 border-error/10 dark:border-error/20'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${check.passed ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                  {check.passed ? <Check size={12} /> : <X size={12} />}
                </span>
                <span className={`text-sm font-bold ${check.passed ? 'text-success' : 'text-error'}`}>
                  {check.rule}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-7 leading-relaxed">{check.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
