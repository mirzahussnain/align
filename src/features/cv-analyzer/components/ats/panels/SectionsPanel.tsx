'use client';

import { CVAnalysisResult } from '@/shared/types/cv';

export default function SectionsPanel({ result }: { result: CVAnalysisResult }) {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Section Ordering</h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Evaluation of your CV's structural flow</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Order */}
        <div className="bg-bg-panel border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm shadow-slate-100/40 dark:shadow-none">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">Your Current Order</h3>
          <div className="space-y-2">
            {result.sectionOrder.currentOrder.map((section, i) => (
              <div key={section} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100/50 dark:border-slate-850">
                <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500 w-5">{i + 1}</span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {section.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended Order */}
        <div className="bg-bg-panel border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm shadow-slate-100/40 dark:shadow-none flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-accent-cyan mb-4">Recommended Order</h3>
            <div className="space-y-2">
              {result.sectionOrder.recommendedOrder.map((section, i) => (
                <div key={section} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-accent-cyan/5 border border-accent-cyan/10">
                  <span className="text-xs font-mono font-bold text-accent-cyan w-5">{i + 1}</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {section.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {result.sectionOrder.suggestions.length > 0 && (
            <div className="mt-6 space-y-2">
              {result.sectionOrder.suggestions.map((s, i) => (
                <p key={i} className="text-xs font-semibold text-warning bg-warning/5 border border-warning/10 px-4 py-3 rounded-2xl">
                  💡 {s}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
