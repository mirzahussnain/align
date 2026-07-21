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

  const dateOrLinkIssues = formattingIssues.filter(
    (i) => i.message.toLowerCase().includes('date') || i.message.toLowerCase().includes('link')
  );

  return (
    <AuditCard
      id="datesLinks"
      title="Dates & Links Consistency"
      subtitle="Validates chronological date styles and link targets"
      score={isPassed ? 'Passed' : 'Review format'}
      scoreStatus={isPassed ? 'excellent' : 'good'}
      source="rule"
    >
      {isPassed ? (
        <p className="text-xs text-slate-550 leading-relaxed">
          No date- or link-formatting issues were flagged — date spans follow standard patterns and
          links parse cleanly.
        </p>
      ) : (
        <div className="space-y-2">
          {dateOrLinkIssues.map((issue, idx) => (
            <p
              key={idx}
              className="text-[11px] text-slate-600 leading-relaxed p-3 bg-amber-50/40 border border-amber-100 rounded-xl"
            >
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </AuditCard>
  );
}
