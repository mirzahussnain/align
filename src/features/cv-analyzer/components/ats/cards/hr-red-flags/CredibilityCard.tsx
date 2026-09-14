import React from 'react';
import { CheckCircle } from 'lucide-react';
import AuditCard from '../../AuditCard';

interface ClichéItem {
  word: string;
  count: number;
}

interface CredibilityCardProps {
  clichésList: ClichéItem[];
  source?: 'rule' | 'ai';
}

export default function CredibilityCard({ clichésList, source = 'rule' }: CredibilityCardProps) {
  const isPassed = clichésList.length <= 2;
  return (
    <AuditCard
      id="credibility"
      title="Credibility & Cliché Audit"
      subtitle="Filters overused buzzwords and vague claims"
      score={isPassed ? 'Credible' : 'Contains clichés'}
      scoreStatus={isPassed ? 'excellent' : 'good'}
      source={source}
      details="Overusing vague corporate statements reduces recruiter interest. Focus on concrete metric accomplishments."
    >
      {clichésList.length > 0 ? (
        <div className="space-y-3">
          <div className="p-4 bg-amber-50/20 border border-amber-100 rounded-xl">
            <h4 className="text-xs font-bold text-amber-800 mb-1.5">Found Buzzwords ({clichésList.length})</h4>
            <div className="flex flex-wrap gap-2">
              {clichésList.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 bg-white border border-amber-200/60 rounded-lg text-xs font-bold text-amber-700 shadow-sm uppercase tracking-wide"
                >
                  {item.word} ({item.count}x)
                </span>
              ))}
            </div>
            <p className="text-[10px] text-amber-600 mt-2.5">
              Recommendation: Replace these words with action-oriented phrases and concrete achievements.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl flex items-start gap-2.5">
          <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-emerald-800">Vague Clichés Clean</h4>
            <p className="text-[11px] text-emerald-700 leading-relaxed mt-0.5">
              Your resume uses direct, specific, and objective language without empty descriptors like &quot;extremely motivated&quot;.
            </p>
          </div>
        </div>
      )}
    </AuditCard>
  );
}
