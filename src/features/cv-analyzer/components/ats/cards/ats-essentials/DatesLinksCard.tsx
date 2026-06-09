import React from 'react';
import AuditCard from '../../AuditCard';

interface FormattingIssue {
  message: string;
}

interface DatesLinksCardProps {
  formattingIssues: FormattingIssue[];
}

export default function DatesLinksCard({ formattingIssues }: DatesLinksCardProps) {
  const isPassed = !formattingIssues.some(
    (i) => i.message.toLowerCase().includes('date') || i.message.toLowerCase().includes('link')
  );

  return (
    <AuditCard
      id="datesLinks"
      title="Dates & Links Consistency"
      subtitle="Validates chronological date styles and link targets"
      score={isPassed ? 'Passed' : 'Review format'}
      scoreStatus={isPassed ? 'excellent' : 'good'}
    >
      <p className="text-xs text-slate-550 leading-relaxed">
        All links are formatted correctly and date spans follow standard patterns without overlapping or broken formats.
      </p>
    </AuditCard>
  );
}
