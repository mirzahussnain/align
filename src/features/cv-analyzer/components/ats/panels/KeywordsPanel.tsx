'use client';

import { CVAnalysisResult } from '@/shared/types/cv';
import KeywordBadge from '@/features/cv-analyzer/components/ats/KeywordBadge';
import { BarChart3, Globe } from 'lucide-react';
import SourceBadge from '../SourceBadge';

export default function KeywordsPanel({ result }: { result: CVAnalysisResult }) {
  // Keywords start from a deterministic dictionary pass; the AI layer, when it
  // runs, adds role-relevant terms it found — so the source is a genuine blend.
  const source = result.aiApplied ? 'hybrid' : 'rule';
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ATS Keyword Analysis</h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Checklist of essential industry terms</p>
        <SourceBadge source={source} className="mt-2" />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Category Breakdown Card */}
        <div className="bg-bg-panel border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm shadow-slate-100/40 dark:shadow-none">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">Keyword Coverage by Category</h3>
          <div className="space-y-4">
            {result.keywords.categoryBreakdown.map((cat) => (
              <div key={cat.category} className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-44 flex-shrink-0 truncate">{cat.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: cat.percentage >= 50 ? 'hsl(142, 71%, 45%)' : cat.percentage >= 25 ? 'hsl(38, 92%, 50%)' : 'hsl(346, 84%, 61%)',
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 w-16 text-right">
                  {cat.present}/{cat.total}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Found and Missing Keywords Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Found Keywords */}
          <div className="bg-bg-panel border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm shadow-slate-100/40 dark:shadow-none max-h-[500px] overflow-y-auto">
            <h3 className="text-base font-bold text-success mb-4 flex items-center gap-2">
              <BarChart3 size={18} />
              Found ({result.keywords.present.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.keywords.present.map((kw) => (
                <KeywordBadge key={`${kw.keyword}-${kw.category}`} keyword={kw.keyword} present={true} count={kw.count} category={kw.category} />
              ))}
            </div>
          </div>

          {/* Missing Keywords */}
          <div className="bg-bg-panel border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm shadow-slate-100/40 dark:shadow-none max-h-[500px] overflow-y-auto">
            <h3 className="text-base font-bold text-error mb-4 flex items-center gap-2">
              <Globe size={18} />
              Missing ({result.keywords.missing.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.keywords.missing.slice(0, 50).map((kw) => (
                <KeywordBadge key={`${kw.keyword}-${kw.category}`} keyword={kw.keyword} present={false} category={kw.category} />
              ))}
              {result.keywords.missing.length > 50 && (
                <span className="text-xs text-slate-400 dark:text-slate-500 italic font-medium w-full mt-2">
                  +{result.keywords.missing.length - 50} more keywords checklist items...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
