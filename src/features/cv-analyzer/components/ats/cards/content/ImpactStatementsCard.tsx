import React from 'react';
import { cn } from '@/shared/utils/cn';
import { Lightbulb, Target, ArrowRight } from 'lucide-react';
import type { Recommendation } from '@/shared/types/cv';
import AuditCard from '../../AuditCard';

interface ImpactStatementsCardProps {
  score: string;
  scoreStatus?: 'excellent' | 'good' | 'needs-improvement' | 'critical' | 'neutral';
  details?: string;
  aiRewrites: Recommendation[];
  aiFeedback?: Recommendation;
  activeRewriteIndex: number;
  setActiveRewriteIndex: (idx: number) => void;
  source?: 'rule' | 'ai';
}

export default function ImpactStatementsCard({
  score,
  scoreStatus,
  details,
  aiRewrites,
  aiFeedback,
  activeRewriteIndex,
  setActiveRewriteIndex,
  source = 'rule'
}: ImpactStatementsCardProps) {
  return (
    <AuditCard
      id="impactStatements"
      title="Quantifying Impact"
      subtitle="STAR Method measurements validation"
      score={score}
      scoreStatus={scoreStatus}
      source={source}
      details={details}
    >
      {aiRewrites.length > 0 && (
        <div className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
              <Lightbulb size={14} className="text-accent-purple" />
              Suggested Rewrites ({aiRewrites.length})
            </h4>
            <div className="flex gap-1.5">
              {aiRewrites.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveRewriteIndex(idx)}
                  className={cn(
                    "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-all cursor-pointer",
                    activeRewriteIndex === idx
                      ? "bg-accent-purple text-white"
                      : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                  )}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-350">
            <div className="bg-red-50/20 border border-red-100 rounded-[24px] p-5 flex flex-col justify-between">
              <div>
                <h5 className="text-[10px] font-bold text-error tracking-wider uppercase mb-3">Original Bullet</h5>
                <p className="text-xs font-medium text-red-800/90 leading-relaxed">
                  {aiRewrites[activeRewriteIndex]?.title.replace('Rewrite bullet: ', '').replace(/["]/g, '')}
                </p>
              </div>
              <div className="mt-4 text-[10px] font-bold text-red-400">
                LOW IMPACT WORK DESCRIPTION
              </div>
            </div>

            <div className="bg-green-50/20 border border-green-100 rounded-[24px] p-5 flex flex-col justify-between">
              <div>
                <h5 className="text-[10px] font-bold text-success tracking-wider uppercase mb-3">STAR Method Alternative</h5>
                <p className="text-xs font-bold text-green-800 leading-relaxed">
                  {aiRewrites[activeRewriteIndex]?.description.split('\n\nRationale:')[0].replace('Suggested rewrite: ', '').replace(/"/g, '')}
                </p>
                {aiRewrites[activeRewriteIndex]?.description.split('\n\nRationale:')[1] && (
                  <p className="text-[10px] font-medium text-slate-400 mt-3 leading-relaxed">
                    <span className="font-bold text-slate-500">Rationale:</span>{' '}
                    {aiRewrites[activeRewriteIndex]?.description.split('\n\nRationale:')[1]}
                  </p>
                )}
              </div>
              <div className="mt-4 text-[10px] font-bold text-success flex items-center gap-1">
                HIGH CONVERSION SUGGESTION <ArrowRight size={10} />
              </div>
            </div>
          </div>
        </div>
      )}

      {aiFeedback && (
        <div className="bg-accent-cyan/5 border border-accent-cyan/10 rounded-[24px] p-5 mt-4">
          <h4 className="text-xs font-bold text-accent-cyan flex items-center gap-1.5 mb-2">
            <Target size={14} /> UK Market Relevance Review
          </h4>
          <p className="text-xs font-medium text-slate-550 leading-relaxed">
            {aiFeedback.description}
          </p>
        </div>
      )}
    </AuditCard>
  );
}
