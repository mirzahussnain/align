import React from 'react';
import { cn } from '@/shared/utils/cn';
import AuditCard from '../../AuditCard';
import MetricSubCard from '../../MetricSubCard';

interface AtsReadabilityCardProps {
  rawText: string;
  score: string;
  scoreStatus?: 'excellent' | 'good' | 'needs-improvement' | 'critical' | 'neutral';
  details?: string;
}

export default function AtsReadabilityCard({ rawText, score, scoreStatus, details }: AtsReadabilityCardProps) {
  const isZeroWidthFound = /[\u200b\u200c\u200d\ufeff]/.test(rawText);
  const specialCount = (rawText.match(/[^\w\s.,;:!?@#$%&*()\-+=\[\]{}|\\/<>'"]/g) || []).length;
  const tabCount = (rawText.match(/\t/g) || []).length;

  return (
    <AuditCard
      id="atsReadability"
      title="ATS Parse Rate"
      subtitle="Rule-based layout parsing check"
      score={score}
      scoreStatus={scoreStatus}
      details={details}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricSubCard className="bg-slate-50/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-1">Text Readability Rules</h4>
          <p className="text-xs font-medium text-slate-500 leading-relaxed">
            ATS scanners require plain text formats. Decorative bullet symbols, zero-width spaces, and nested table tags will cause parser breakdown.
          </p>
        </MetricSubCard>
        <MetricSubCard className="bg-slate-50/55 flex flex-col justify-center gap-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Zero-width characters:</span>
            <span className={cn("font-bold", isZeroWidthFound ? "text-error" : "text-success")}>
              {isZeroWidthFound ? "Found (Critical)" : "None"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Unusual special characters:</span>
            <span className={cn("font-bold", specialCount > 10 ? "text-warning" : "text-success")}>
              {specialCount > 0 ? `${specialCount} found` : "Clean"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Tab indent count:</span>
            <span className={cn("font-bold", tabCount > 20 ? "text-warning" : "text-success")}>
              {tabCount > 0 ? `${tabCount} tabs` : "None"}
            </span>
          </div>
        </MetricSubCard>
      </div>
    </AuditCard>
  );
}
