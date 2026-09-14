import React from 'react';
import AuditCard from '../../AuditCard';

interface InterviewRisksCardProps {
  hasRiskFactor: boolean;
  risksList: string[];
  source?: 'rule' | 'ai';
}

export default function InterviewRisksCard({ hasRiskFactor, risksList, source = 'rule' }: InterviewRisksCardProps) {
  return (
    <AuditCard
      id="interviewRisks"
      title="Interview Risks"
      subtitle="Scans for chronological gaps or recruiter red flags"
      score={hasRiskFactor ? 'Review flags' : 'Low risk'}
      scoreStatus={hasRiskFactor ? 'good' : 'excellent'}
      source={source}
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          {hasRiskFactor
            ? "Potential career risk indicators were detected in the CV. Recruiters scan for employment stability and corporate team alignment."
            : "No long employment gaps, excessive freelance contracts, or high job-hopping rates detected. Your career timeline displays logical progression and stability."}
        </p>
        {risksList.length > 0 && (
          <div className="space-y-2 pt-1">
            {risksList.map((flag, idx) => (
              <div
                key={idx}
                className="p-3 bg-amber-50/20 border border-amber-100 rounded-xl flex items-start gap-2 text-xs font-semibold text-amber-800"
              >
                <span className="mt-0.5 font-black">•</span>
                <span>{flag}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuditCard>
  );
}
