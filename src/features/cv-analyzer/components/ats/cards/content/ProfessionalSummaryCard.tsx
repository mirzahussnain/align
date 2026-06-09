import React from 'react';
import { XCircle, CheckCircle } from 'lucide-react';
import AuditCard from '../../AuditCard';

interface ProfessionalSummaryCardProps {
  score: string;
  scoreStatus?: 'excellent' | 'good' | 'needs-improvement' | 'critical' | 'neutral';
  details?: string;
  originalSummary?: string;
}

export default function ProfessionalSummaryCard({
  score,
  scoreStatus,
  details,
  originalSummary
}: ProfessionalSummaryCardProps) {
  return (
    <AuditCard
      id="professionalSummary"
      title="Spelling & Grammar & Summary"
      subtitle="Checks professional summary length and guidelines"
      score={score}
      scoreStatus={scoreStatus}
      details={details}
    >
      {originalSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div className="bg-red-50/20 border border-red-100 rounded-[24px] p-5">
            <h4 className="text-[10px] font-bold text-error tracking-wider uppercase mb-3 flex items-center gap-1">
              <XCircle size={12} /> Original Summary
            </h4>
            <p className="text-xs font-medium text-red-800/90 leading-relaxed">
              {originalSummary}
            </p>
          </div>
          <div className="bg-green-50/20 border border-green-100 rounded-[24px] p-5">
            <h4 className="text-[10px] font-bold text-success tracking-wider uppercase mb-3 flex items-center gap-1">
              <CheckCircle size={12} /> Optimization Guidelines
            </h4>
            <ul className="text-xs font-medium text-green-800/90 space-y-1.5 list-disc pl-4">
              <li>Limit length strictly between 30 and 60 words.</li>
              <li>Include at least one quantified technical metric.</li>
              <li>Remove empty buzzwords (e.g. 'passionate team player').</li>
              <li>Ensure target job role is mentioned clearly.</li>
            </ul>
          </div>
        </div>
      )}
    </AuditCard>
  );
}
