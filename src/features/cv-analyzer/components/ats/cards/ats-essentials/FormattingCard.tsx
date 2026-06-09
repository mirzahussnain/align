import React from 'react';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import AuditCard from '../../AuditCard';
import MetricSubCard from '../../MetricSubCard';

interface FormattingIssue {
  type: string;
  message: string;
  fix: string;
}

interface FormattingCardProps {
  formatting: {
    issues: FormattingIssue[];
  };
  details?: string;
}

export default function FormattingCard({ formatting, details }: FormattingCardProps) {
  const isPassed = formatting.issues.length === 0;
  return (
    <AuditCard
      id="formatting"
      title="Design & Formatting Audit"
      subtitle="Rule-based layout compliance"
      score={isPassed ? "Passed" : "Needs review"}
      scoreStatus={isPassed ? 'excellent' : 'good'}
      details={details}
    >
      {formatting.issues.length > 0 ? (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Identified Issues ({formatting.issues.length})
          </h4>
          <div className="space-y-2">
            {formatting.issues.map((issue, idx) => (
              <MetricSubCard key={idx} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      issue.type === 'critical' ? 'bg-error' : issue.type === 'warning' ? 'bg-warning' : 'bg-info'
                    )}
                  />
                  <span className="text-xs font-bold text-slate-700">{issue.message}</span>
                </div>
                <p className="text-[11px] font-semibold text-slate-400 ml-4">Fix: {issue.fix}</p>
              </MetricSubCard>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl flex items-start gap-2.5">
          <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-emerald-800">Clean Design Checked</h4>
            <p className="text-[11px] text-emerald-700 leading-relaxed mt-0.5">
              No layout or compliance violations detected. Font consistency and spaces look standard.
            </p>
          </div>
        </div>
      )}
    </AuditCard>
  );
}
