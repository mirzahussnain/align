import React from 'react';
import AuditCard from '../../AuditCard';
import { checkFileName } from '@/shared/utils/filename-check';

interface FileNameCardProps {
  fileName?: string;
}

export default function FileNameCard({ fileName }: FileNameCardProps) {
  const check = checkFileName(fileName);

  return (
    <AuditCard
      id="fileName"
      title="File Name Check"
      subtitle="Audits the uploaded file's name for recruiter-friendly conventions"
      score={check.scoreLabel}
      scoreStatus={check.status}
      source="rule"
    >
      <div className="space-y-3">
        {check.fileName && (
          <p className="text-xs text-slate-500 leading-relaxed">
            Uploaded as{' '}
            <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-bold font-mono break-all">
              {check.fileName}
            </code>
          </p>
        )}

        {check.issues.length > 0 ? (
          <div className="space-y-2">
            {check.issues.map((issue, idx) => (
              <p
                key={idx}
                className="text-[11px] text-slate-600 leading-relaxed p-3 bg-amber-50/40 border border-amber-100 rounded-xl"
              >
                {issue}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 leading-relaxed">
            Your filename identifies you and uses clean separators — ideal for a recruiter’s
            downloads folder and for older ATS download handlers.
          </p>
        )}
      </div>
    </AuditCard>
  );
}
