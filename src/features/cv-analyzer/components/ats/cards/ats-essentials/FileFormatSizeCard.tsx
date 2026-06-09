import React from 'react';
import AuditCard from '../../AuditCard';
import MetricSubCard from '../../MetricSubCard';

interface FileFormatSizeCardProps {
  pageCount: number;
  estimatedReadTime: string;
  details?: string;
}

export default function FileFormatSizeCard({ pageCount, estimatedReadTime, details }: FileFormatSizeCardProps) {
  const isPassed = pageCount <= 2;
  return (
    <AuditCard
      id="fileFormatSize"
      title="File Format & Size"
      subtitle="Checks page count and reading speed"
      score={isPassed ? 'Passed' : 'Too long'}
      scoreStatus={isPassed ? 'excellent' : 'critical'}
      details={details}
    >
      <MetricSubCard className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Page Count</p>
          <p className="text-sm font-bold text-slate-700 mt-0.5">{pageCount} Pages</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Read Time</p>
          <p className="text-sm font-bold text-slate-700 mt-0.5">{estimatedReadTime}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Format</p>
          <p className="text-sm font-bold text-slate-700 mt-0.5">PDF Document</p>
        </div>
      </MetricSubCard>
    </AuditCard>
  );
}
